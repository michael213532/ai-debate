# Beecision

**AI Models Debate, You Decide.**

Beecision is a multi-AI debate platform where you pose a question and watch AI models with unique personalities discuss it in real time. Each "bee" brings a different perspective, and you get a synthesized summary to help you decide.

**Live at [beecision.com](https://beecision.com)**

## How It Works

1. **Pick a Hive** - Choose from 6 themed groups of AI personalities (Chaos, Friend Group, Billionaire, Internet, Generations, Courtroom)
2. **Ask a Question** - Enter any topic or decision you need help with
3. **Watch the Debate** - AI bees discuss in rounds, streaming responses in real time
4. **Get Your Answer** - A synthesized summary shows each AI's position and a final verdict

## Features

- **6 Themed Hives** with 30 unique bee personalities, each with distinct speaking styles and perspectives
- **2 Special Add-on Bees** - Devil's Advocate and Wild Card can join any hive
- **Custom Hives** - Create your own hive with custom personalities and AI-generated icons (Pro)
- **5 AI Providers** - OpenAI, Anthropic, Google, Deepseek, and xAI
- **Real-time Streaming** - Watch responses appear live via WebSockets
- **User Interventions** - Jump into the debate mid-discussion to redirect the conversation
- **Image Attachments** - Attach up to 10 images per message for vision-capable models
- **Debate History** - Revisit any past debate with full transcripts
- **Memory System** - Beecision remembers facts about you across sessions for more personalized debates
- **Secure API Key Storage** - Your keys are encrypted with Fernet (AES-256) before storage
- **BYOK Model** - Bring your own API keys, no markup on AI costs

## Supported Models

| Provider | Models |
|----------|--------|
| **OpenAI** | GPT-5.2, GPT-5, GPT-5 Mini, GPT-4o, GPT-4o Mini |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.5, Claude Opus 4.5, Claude Sonnet 4, Claude Haiku 4.5 |
| **Google** | Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash |
| **Deepseek** | Deepseek V3.2, Deepseek Reasoner |
| **xAI** | Grok 4.1, Grok 4, Grok 3 Mini |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, Uvicorn |
| Frontend | Vanilla HTML/CSS/JavaScript |
| Real-time | WebSockets |
| Database | SQLite (aiosqlite) |
| Auth | JWT (HS256), bcrypt |
| Encryption | Fernet symmetric encryption |
| Payments | Stripe subscriptions |
| Deployment | Docker, Railway |

## Getting Started

### Prerequisites

- Python 3.11+
- API keys for at least one supported provider

### 1. Clone and Install

```bash
git clone https://github.com/michael213532/ai-debate.git
cd ai-debate
pip install -r backend/requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Generate an encryption key:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Edit `.env` with your values:

```env
JWT_SECRET_KEY=your-secret-key
ENCRYPTION_KEY=your-generated-fernet-key
DATABASE_PATH=beecision.db
HOST=0.0.0.0
PORT=8000
APP_URL=http://localhost:8000

# Stripe (optional, for billing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

### 3. Run

```bash
uvicorn backend.main:app --reload
```

Open [http://localhost:8000](http://localhost:8000)

### Docker

```bash
docker build -t beecision .
docker run -p 8000:8000 --env-file .env beecision
```

## Project Structure

```
beecision/
├── backend/
│   ├── main.py                # FastAPI app entry point
│   ├── config.py              # Settings & AI model definitions
│   ├── personalities.py       # Hive & bee personality definitions
│   ├── auth/                  # JWT authentication
│   ├── debate/                # Debate orchestration & WebSocket
│   ├── billing/               # Stripe subscriptions
│   ├── providers/             # AI provider implementations
│   │   ├── openai_provider.py
│   │   ├── anthropic_provider.py
│   │   ├── google_provider.py
│   │   ├── deepseek_provider.py
│   │   └── xai_provider.py
│   ├── custom_hives/          # Custom hive creation (Pro)
│   ├── memory/                # User memory/context system
│   ├── database/              # SQLite models & queries
│   └── requirements.txt
├── frontend/
│   ├── index.html             # Landing page
│   ├── app.html               # Main debate interface
│   ├── pricing.html           # Pricing page
│   ├── settings.html          # API key management
│   ├── privacy.html           # Privacy policy
│   ├── css/styles.css
│   └── js/
│       ├── app.js             # App logic & model selection
│       ├── chat.js            # WebSocket & chat handling
│       ├── auth.js            # Login/register
│       └── settings.js        # API key configuration
├── .env.example
├── Dockerfile
└── README.md
```

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/me` | Current user info |

### Debates
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/debates` | Start a new debate |
| GET | `/api/debates` | List past debates |
| GET | `/api/debates/{id}` | Get debate details |
| POST | `/api/debates/{id}/stop` | Stop ongoing debate |
| WS | `/ws/debates/{id}` | Real-time debate stream |

### Hives
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/hives` | List all hives with bees |
| GET | `/api/hives/{id}/personalities` | Get bees for a hive |
| GET | `/api/special-bees` | List add-on bees |

### API Keys
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/keys/{provider}` | Save API key |
| DELETE | `/api/keys/{provider}` | Remove API key |
| GET | `/api/keys` | List configured providers |
| POST | `/api/keys/{provider}/test` | Test API key validity |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/billing/checkout` | Create Stripe checkout |
| POST | `/api/billing/portal` | Stripe customer portal |
| GET | `/api/billing/status` | Subscription status |
| POST | `/api/billing/webhook` | Stripe webhook handler |

## Pricing

| | Free | Pro ($5/mo) |
|---|------|-------------|
| Sessions | 20/month | Unlimited |
| Hives | All 6 built-in | All 6 built-in |
| Custom Hives | 1 | Unlimited |
| Special Bees | Yes | Yes |
| Image Attachments | Yes | Yes |
| PDF Export | No | Yes |

## Security

- API keys encrypted at rest with Fernet (AES-256)
- Passwords hashed with bcrypt
- JWT tokens expire after 24 hours
- HTTPS enforced in production
- Per-user key isolation

## License

MIT
