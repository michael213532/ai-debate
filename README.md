# Ensemble AI

A web application where multiple AI models discuss topics together, giving you diverse perspectives and a synthesized summary. Ask a question, watch AIs discuss, get a combined answer.

## Features

- **Multi-Model Debates**: Select 2-6 AI models to participate in structured debates
- **Multiple Providers**: Support for OpenAI, Anthropic, Google, Deepseek, and xAI
- **Real-time Streaming**: Watch responses stream in real-time via WebSockets
- **Round-based Discussion**: Models respond in rounds, building on previous arguments
- **Automatic Summary**: A designated model summarizes the debate at the end
- **Debate History**: View and revisit past debates
- **Secure API Keys**: Per-user encrypted API key storage

## Supported AI Models

- **OpenAI**: GPT-5.2, GPT-5, GPT-5 Mini, GPT-4o, GPT-4o Mini
- **Anthropic**: Claude Opus 4.6, Claude Sonnet 4.5, Claude Opus 4.5, Claude Sonnet 4, Claude Haiku 4.5
- **Google**: Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash
- **Deepseek**: Deepseek V3.2, Deepseek Reasoner
- **xAI**: Grok 4.1, Grok 4, Grok 3 Mini

## Tech Stack

- **Backend**: Python + FastAPI
- **Frontend**: HTML/CSS/JavaScript (vanilla)
- **Real-time**: WebSockets
- **Database**: SQLite (aiosqlite)
- **Auth**: JWT-based authentication
- **Encryption**: Fernet symmetric encryption for API keys

## Setup

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Generate an encryption key for API keys:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add the generated key to your `.env` file as `ENCRYPTION_KEY`.

### 3. Run the Application

```bash
# From the project root directory
uvicorn backend.main:app --reload
```

Or using Python directly:

```bash
python -m backend.main
```

The application will be available at http://localhost:8000

## Usage

1. **Register/Login**: Create an account or login at the landing page
2. **Add API Keys**: Click "Settings" to add your API keys for the providers you want to use
3. **Start a Debate**:
   - Enter a topic
   - Select 2-6 AI models
   - Choose the number of rounds (1-5)
   - Click "Start Debate"
4. **Watch the Debate**: Responses stream in real-time in separate panels
5. **View Summary**: After all rounds, the first selected model provides a summary
6. **Review History**: Click on any past debate to view its full transcript

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login, returns JWT
- `GET /api/auth/me` - Get current user info

### Debates (requires auth)
- `POST /api/debates` - Start a new debate
- `GET /api/debates` - List user's debates
- `GET /api/debates/{id}` - Get debate details
- `POST /api/debates/{id}/stop` - Stop ongoing debate
- `WS /ws/debates/{id}` - WebSocket for real-time updates

### Models & Keys (requires auth)
- `GET /api/models` - List available models
- `POST /api/keys/{provider}` - Save API key
- `DELETE /api/keys/{provider}` - Remove API key
- `GET /api/keys` - List configured providers
- `POST /api/keys/{provider}/test` - Test API key validity

## Project Structure

```
ai-debate/
├── backend/
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Settings & environment
│   ├── auth/
│   │   ├── routes.py        # Login/register endpoints
│   │   ├── jwt.py           # JWT token handling
│   │   └── dependencies.py  # Auth middleware
│   ├── providers/
│   │   ├── base.py          # Abstract base class
│   │   ├── openai_provider.py
│   │   ├── anthropic_provider.py
│   │   ├── google_provider.py
│   │   ├── deepseek_provider.py
│   │   └── xai_provider.py
│   ├── debate/
│   │   ├── routes.py        # Debate API endpoints
│   │   ├── orchestrator.py  # Manages debate flow
│   │   └── schemas.py       # Pydantic models
│   ├── database/
│   │   ├── db.py            # SQLite connection
│   │   └── models.py        # DB models
│   └── requirements.txt
├── frontend/
│   ├── index.html           # Landing/login page
│   ├── app.html             # Main app
│   ├── css/styles.css
│   └── js/
│       ├── auth.js          # Login/register
│       ├── app.js           # Main app logic
│       ├── debate.js        # Debate UI
│       └── settings.js      # API key config
├── .env.example
└── README.md
```

## Security Notes

- API keys are encrypted using Fernet symmetric encryption before storage
- JWT tokens expire after 24 hours by default
- Passwords are hashed using bcrypt
- Always use HTTPS in production
- Keep your `JWT_SECRET_KEY` and `ENCRYPTION_KEY` secure

## License

MIT
