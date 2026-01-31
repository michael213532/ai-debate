# Ensemble AI - Project Notes

## What This Is
A chat-based SaaS app where users can have multiple AI models discuss a topic together and get a combined response.

## Tech Stack
- **Backend**: Python + FastAPI + WebSockets
- **Frontend**: Vanilla HTML/CSS/JS
- **Database**: SQLite with aiosqlite
- **Auth**: JWT tokens, bcrypt passwords
- **API Keys**: Fernet encryption (AES-256)
- **Payments**: Stripe subscriptions
- **Deployment**: Railway (Docker)

## Live URL
https://ai-debate-production-8032.up.railway.app

## Key Features
- Chat interface with AI discussion side panel
- 5 AI providers: OpenAI, Anthropic, Google, Deepseek, xAI
- Users bring their own API keys (encrypted storage)
- Free tier: 5 sessions/month, Pro: $5/mo unlimited
- Real-time streaming responses via WebSocket
- Privacy policy with acceptance requirement

## Project Structure
```
ai-debate/
├── backend/
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings, AI models list
│   ├── auth/                # JWT auth, login/register
│   ├── debate/              # Sessions, WebSocket, orchestrator
│   ├── billing/             # Stripe integration
│   ├── providers/           # AI provider implementations
│   └── database/            # SQLite models and queries
├── frontend/
│   ├── index.html           # Landing/login page
│   ├── app.html             # Main chat interface
│   ├── pricing.html         # Pricing page
│   ├── privacy.html         # Privacy policy
│   └── js/
│       ├── app.js           # Main app logic, model selection
│       ├── chat.js          # Chat/WebSocket handling
│       └── settings.js      # API key management modal
```

## Environment Variables (Railway)
- JWT_SECRET_KEY
- ENCRYPTION_KEY (for API key encryption)
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_ID
- DATABASE_PATH
- APP_URL

## Status
- App is fully functional and deployed
- User needs to add credits to OpenAI and Anthropic accounts
- Stripe is in test mode (switch to live when ready)

## Next Steps (Optional Enhancements)
- Conversation history persistence
- Export chats to PDF
- Dark/light mode toggle
- Custom domain
