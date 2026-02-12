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
- Free tier: 20 sessions/month, Pro: $5/mo unlimited
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

**Anthropic** - Claude 3.x models were RETIRED Jan 2026. Current models:
- `claude-opus-4-6` (Claude Opus 4.6) - newest
- `claude-sonnet-4-5-20250929` (Claude Sonnet 4.5)
- `claude-opus-4-5-20251101` (Claude Opus 4.5)
- `claude-sonnet-4-20250514` (Claude Sonnet 4)
- `claude-haiku-4-5-20251001` (Claude Haiku 4.5)

**OpenAI** - o1 models removed (don't support streaming/system prompts):
- `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4`

**Google**:
- `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash-exp`

**Deepseek**:
- `deepseek-chat`, `deepseek-coder`

**xAI**:
- `grok-beta`, `grok-2-latest`

## Common Issues

1. **Claude models 404 error**: Claude 3.x models are RETIRED. Use Claude 4.x models (e.g., `claude-opus-4-6`, `claude-sonnet-4-5-20250929`)

2. **Dropdown menu closes immediately**: Need `e.stopPropagation()` on click handlers

3. **Tutorial not showing**: Already completed - clear with `localStorage.removeItem('tutorialCompleted')`

4. **Models not persisting**: Check `loadSelectedModels()` is called after `loadConfiguredProviders()`

## TODO - Remind User
- **Tutorial needs improvement**: Make it clearer and more of a step-by-step setup guide (getting API keys, adding them, etc.)

## Next Steps (Optional Enhancements)
- Conversation history persistence
- Dark/light mode toggle
- Custom domain
- Add more AI providers
