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

## Recent Changes (Feb 2025)

### Multiple Image Support
- Users can attach up to 10 images per message
- Images displayed in preview row before sending
- Individual image removal with X button

### Attachment Menu (+ Button)
- Replaced single attachment button with "+" dropdown menu
- Menu contains: "Add Image" and "Export PDF" options
- Export PDF shows PRO badge, prompts upgrade for free users
- Uses `e.stopPropagation()` to prevent menu closing on click

### Model Selection Persistence
- Selected AI models saved to localStorage
- Restored on page load (validates API keys still configured)
- Functions: `saveSelectedModels()`, `loadSelectedModels()`

### Onboarding Tutorial
- 4-step tutorial for new users (Welcome, API Keys, Choose Models, Start Chatting)
- Shows automatically on first visit (checks `localStorage.tutorialCompleted`)
- Can manually trigger with `showTutorial()` in browser console
- Skip button and dot navigation

### Improved AI Prompts
- More human-like, conversational responses
- Multi-language support (responds in user's language)
- Clear choices with specific criteria when comparing things
- Summary shows which AI chose what

## Model IDs (IMPORTANT - these break if wrong!)

**Anthropic** - MUST use dated versions, "latest" aliases DON'T work:
- `claude-sonnet-4-20250514` (Claude Sonnet 4)
- `claude-3-5-sonnet-20240620` (Claude 3.5 Sonnet)
- `claude-3-opus-20240229` (Claude 3 Opus)
- `claude-3-haiku-20240307` (Claude 3 Haiku)

**OpenAI** - o1 models removed (don't support streaming/system prompts):
- `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`

**Google**:
- `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash-exp`

**Deepseek**:
- `deepseek-chat`, `deepseek-coder`

**xAI**:
- `grok-beta`, `grok-2-latest`

## Common Issues

1. **Claude models 404 error**: Model ID wrong. Must use dated format like `claude-3-5-sonnet-20241022`, NOT `claude-3-5-sonnet-latest`

2. **Dropdown menu closes immediately**: Need `e.stopPropagation()` on click handlers

3. **Tutorial not showing**: Already completed - clear with `localStorage.removeItem('tutorialCompleted')`

4. **Models not persisting**: Check `loadSelectedModels()` is called after `loadConfiguredProviders()`

## TODO - Remind User
- **Tutorial needs improvement**: Make it clearer and more of a step-by-step setup guide (getting API keys, adding them, etc.)
- **Some AIs still not working**: Need to debug which ones and why - check model IDs and provider implementations

## Next Steps (Optional Enhancements)
- Conversation history persistence
- Dark/light mode toggle
- Custom domain
- Add more AI providers
