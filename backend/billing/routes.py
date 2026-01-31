"""Billing routes for Stripe subscription."""
import stripe
from fastapi import APIRouter, HTTPException, status, Depends, Request
from pydantic import BaseModel
from backend.config import STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, APP_URL, FREE_DEBATE_LIMIT
from backend.auth.dependencies import get_current_user
from backend.database import get_db, User

router = APIRouter(prefix="/api/billing", tags=["billing"])

# Initialize Stripe
stripe.api_key = STRIPE_SECRET_KEY


class SubscriptionStatus(BaseModel):
    status: str  # free, active, cancelled
    debates_used: int
    debates_limit: int | None  # None = unlimited
    can_debate: bool


class CheckoutResponse(BaseModel):
    checkout_url: str


@router.get("/status", response_model=SubscriptionStatus)
async def get_subscription_status(current_user: User = Depends(get_current_user)):
    """Get current user's subscription status."""
    is_active = current_user.subscription_status == "active"
    debates_used = current_user.get_debates_used_this_month()
    return SubscriptionStatus(
        status=current_user.subscription_status,
        debates_used=debates_used,
        debates_limit=None if is_active else FREE_DEBATE_LIMIT,
        can_debate=current_user.can_create_debate(FREE_DEBATE_LIMIT)
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(current_user: User = Depends(get_current_user)):
    """Create a Stripe checkout session for subscription."""
    if not STRIPE_SECRET_KEY or not STRIPE_PRICE_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment system not configured"
        )

    try:
        # Create or get Stripe customer
        if current_user.stripe_customer_id:
            customer_id = current_user.stripe_customer_id
        else:
            customer = stripe.Customer.create(
                email=current_user.email,
                metadata={"user_id": current_user.id}
            )
            customer_id = customer.id

            # Save customer ID
            async with get_db() as db:
                await db.execute(
                    "UPDATE users SET stripe_customer_id = ? WHERE id = ?",
                    (customer_id, current_user.id)
                )
                await db.commit()

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=["card"],
            line_items=[{
                "price": STRIPE_PRICE_ID,
                "quantity": 1
            }],
            mode="subscription",
            success_url=f"{APP_URL}/app?subscription=success",
            cancel_url=f"{APP_URL}/app?subscription=cancelled",
            metadata={"user_id": current_user.id}
        )

        return CheckoutResponse(checkout_url=session.url)

    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/portal")
async def create_portal_session(current_user: User = Depends(get_current_user)):
    """Create a Stripe billing portal session to manage subscription."""
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No subscription found"
        )

    try:
        session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=f"{APP_URL}/app"
        )
        return {"portal_url": session.url}

    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Handle subscription events
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("metadata", {}).get("user_id")
        if user_id:
            async with get_db() as db:
                await db.execute(
                    "UPDATE users SET subscription_status = 'active' WHERE id = ?",
                    (user_id,)
                )
                await db.commit()

    elif event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        customer_id = subscription["customer"]
        async with get_db() as db:
            await db.execute(
                "UPDATE users SET subscription_status = 'cancelled' WHERE stripe_customer_id = ?",
                (customer_id,)
            )
            await db.commit()

    elif event["type"] == "customer.subscription.updated":
        subscription = event["data"]["object"]
        customer_id = subscription["customer"]
        status = "active" if subscription["status"] == "active" else "cancelled"
        async with get_db() as db:
            await db.execute(
                "UPDATE users SET subscription_status = ? WHERE stripe_customer_id = ?",
                (status, customer_id)
            )
            await db.commit()

    return {"status": "ok"}
