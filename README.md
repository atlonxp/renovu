[//]: # (<p align="center">)
[//]: # (  <img src="https://raw.githubusercontent.com/novuhq/novu/next/apps/dashboard/public/images/novu-logo-light-bg.svg" width="200" alt="ReNovu Logo">)
[//]: # (</p>)

<h1 align="center">ReNovu</h1>

<p align="center">
  <strong>Re</strong>verse-Engineered <strong>Novu</strong> — Self-hosted notifications with enterprise features unlocked
</p>

<p align="center">
  <em>Like <a href="https://github.com/ReVanced">ReVanced</a> for YouTube, but for <a href="https://novu.co">Novu</a> notifications</em>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#whats-unlocked">What's Unlocked</a> •
  <a href="#ai-translation">AI Translation</a> •
  <a href="#providers">Providers</a> •
  <a href="#testing">Testing</a> •
  <a href="#changelog">Changelog</a>
</p>

---

## Team

| Role | Name | Contact |
|------|------|---------|
| **Chief Architect & Lead Developer** | atlonxp | [GitHub](https://github.com/atlonxp) |

---

## Why ReNovu?

Novu is an excellent open-source notification infrastructure, but many features are locked behind enterprise tiers. **ReNovu** reverse-engineers these restrictions to give self-hosters the full experience:

| Feature | Novu Free | Novu Enterprise | ReNovu |
|---------|:---------:|:---------------:|:------:|
| Unlimited workflows | Limited | Yes | **Yes** |
| Custom layouts | Limited | Yes | **Yes** |
| Remove branding | No | Yes | **Yes** |
| Multi-org support | No | Yes | **Yes** |
| Priority support | No | Yes | Community |
| AI Translation | No | $250+/mo | **Yes** |

## Quick Start

```bash
# Clone
git clone https://github.com/atlonxp/renovu.git
cd renovu

# Configure
cp .env.example .env

# Build & Launch
docker compose build
docker compose up -d
```

**That's it.** Open [http://localhost:3000](http://localhost:3000) and start sending notifications.

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | [localhost:3000](http://localhost:3000) | Web admin interface |
| API | [localhost:3001](http://localhost:3001) | REST API & OpenAPI docs |
| WebSocket | [localhost:3002](http://localhost:3002) | Real-time updates |

## What's Unlocked

### Tier System
All organizations automatically receive **UNLIMITED** tier:
- Unlimited workflows and notification templates
- Unlimited team members
- Unlimited API calls
- All premium features enabled

### Branding Freedom
- "Powered by Novu" banners removed
- Inbox component footer hidden
- Full white-label capability

### Self-Hosted Auth
- No Clerk dependency
- JWT-based authentication
- Auto-organization creation on first login

### AI Translation
- Full translation management (enterprise-gated in upstream Novu at $250+/mo)
- OpenAI GPT-4o integration for high-quality translations
- See [AI Translation](#ai-translation) section below

## AI Translation

ReNovu includes a fully working AI-powered translation system that replaces Novu's enterprise-gated `@novu/ee-translation` package.

### Features

- **OpenAI GPT Integration** — supports gpt-4o-mini, gpt-4o, gpt-4-turbo
- **Variable Protection** — `{{subscriber.firstName}}` and other Handlebars variables are tokenized before translation, preventing corruption
- **HTML Validation** — translated content is validated for structural integrity
- **Organization-Level Settings** — API keys encrypted with AES-256, configurable per organization
- **Locale Aliases** — map non-standard locale codes (e.g., `zh-hans` → `zh_CN`)
- **Async Translation** — optional Bull queue processing for large batches
- **Dashboard UI** — full settings panel, translate button, and preview in the dashboard

### Configuration

1. Open Dashboard → **Translations** → **Settings**
2. Enter your OpenAI API key
3. Select model and configure target locales
4. Click **Auto-Translate** on any workflow

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/translation-settings` | Get organization settings |
| PUT | `/v1/translation-settings` | Create/update settings |
| POST | `/v1/translation-settings/test` | Test OpenAI connection |
| DELETE | `/v1/translation-settings` | Delete settings |
| POST | `/v1/translations/auto-translate` | Trigger translation |
| GET | `/v1/translations/status/:jobId` | Check async job status |

### Subscriber Locale

Novu stores a `locale` field on each subscriber record. This can be set at creation time or updated later:

```bash
# Create subscriber with locale
curl -X POST http://localhost:3001/v1/subscribers \
  -H "Authorization: ApiKey YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"subscriberId": "user-123", "locale": "ja", "firstName": "Taro"}'

# Update subscriber locale
curl -X PUT http://localhost:3001/v1/subscribers/user-123 \
  -H "Authorization: ApiKey YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"locale": "th"}'
```

> **Note:** Passing `locale` inline in the trigger `to` field **mutates the subscriber record permanently** — it is not ephemeral.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        ReNovu Stack                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │   API    │  │  Worker  │  │    WS    │   │
│  │  :3000   │  │  :3001   │  │  :3004   │  │  :3002   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │          │
│       └─────────────┴──────┬──────┴─────────────┘          │
│                            │                                │
│              ┌─────────────┴─────────────┐                 │
│              │                           │                  │
│         ┌────┴────┐               ┌──────┴──────┐          │
│         │ MongoDB │               │    Redis    │          │
│         │  :27017 │               │    :6379    │          │
│         └─────────┘               └─────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

Edit `.env` for your environment:

```bash
# Security (CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key
STORE_ENCRYPTION_KEY=32-character-encryption-key!!
NOVU_SECRET_KEY=your-novu-secret-key

# Database
MONGO_USER=renovu
MONGO_PASSWORD=secure-password

# URLs (update for production)
API_ROOT_URL=http://localhost:3001
FRONT_BASE_URL=http://localhost:3000

# Ports
DASHBOARD_PORT=3000
API_PORT=3001
WS_PORT=3002
```

## Providers

ReNovu supports 50+ notification providers out of the box:

<details>
<summary><strong>Email Providers</strong></summary>

- Sendgrid
- Mailgun
- Amazon SES
- Postmark
- SMTP (any)
- Mailjet
- Mandrill
- Brevo (Sendinblue)
- MailerSend
- Resend
- SparkPost
- Outlook 365

</details>

<details>
<summary><strong>SMS Providers</strong></summary>

- Twilio
- Plivo
- Amazon SNS
- Vonage (Nexmo)
- Telnyx
- Termii
- Gupshup
- Clickatell
- Infobip

</details>

<details>
<summary><strong>Push Providers</strong></summary>

- Firebase Cloud Messaging (FCM)
- Expo
- Apple Push Notification Service (APNS)
- OneSignal
- Pushpad

</details>

<details>
<summary><strong>Chat Providers</strong></summary>

- Slack
- Discord
- Microsoft Teams
- Mattermost

</details>

## Testing

ReNovu includes comprehensive E2E test suites:

```bash
# Run full test suite (all 10 suites, 64 tests)
./test-renovu-e2e.sh

# Run specific suite
./test-renovu-e2e.sh --suite health
./test-renovu-e2e.sh --suite subscribers
./test-renovu-e2e.sh --suite locale

# List available suites
./test-renovu-e2e.sh --list

# Translation-specific tests
./test-translation-e2e.sh
```

### Test Suites

| Suite | Tests | Coverage |
|-------|-------|----------|
| health | 7 | API, WS, Dashboard, Worker, MongoDB, Redis |
| subscribers | 13 | CRUD, locale, update, delete, list |
| groups-workflows | 7 | Email, in-app, multi-channel workflows |
| triggers | 8 | Single, bulk, broadcast, inline locale |
| in-app | 4 | Feed, unseen count, mark-read |
| locale | 4 | All 13 ArokaGO locales accepted |
| preferences | 3 | Get/update subscriber preferences |
| integrations | 5 | Active channels, provider status |
| topics | 6 | CRUD, trigger-to-topic |
| edge-cases | 8 | Error handling, auth validation |

## Development

```bash
# Install dependencies
pnpm install

# Start dev servers
pnpm start:api:dev      # API on :3001
pnpm start:dashboard    # Dashboard on :3000
pnpm start:worker       # Background worker
pnpm start:ws           # WebSocket server
```

### Build from Source

```bash
# Build all images
docker compose build

# Build specific service
docker compose build api
docker compose build dashboard
```

## Project Structure

```
renovu/
├── apps/
│   ├── api/              # NestJS REST API
│   ├── dashboard/        # React admin dashboard
│   ├── worker/           # Background job processor
│   ├── ws/               # WebSocket server
│   ├── inbound-mail/     # Inbound email processor
│   └── webhook/          # Webhook delivery service
├── libs/
│   ├── dal/              # Data access layer
│   └── application-generic/
├── packages/
│   ├── shared/           # Shared types & constants
│   ├── framework/        # Workflow framework
│   ├── translation/      # AI translation (ReNovu extension)
│   ├── js/               # JavaScript SDK
│   ├── react/            # React components (Inbox)
│   └── providers/        # Channel provider implementations
├── docker/               # Dockerfiles
├── test-renovu-e2e.sh    # Comprehensive E2E tests
├── test-translation-e2e.sh # Translation E2E tests
└── docker-compose.yml
```

## Changelog

### ReNovu Status

ReNovu is currently synced with **Novu v3.14.0** (upstream `next` branch as of 2026-02-24).

#### ReNovu v1.0.0 — 2026-02-24

**Self-Hosted Enterprise Unlock**
- Unlock all enterprise tier restrictions for self-hosted deployments
- UNLIMITED tier auto-assigned to all organizations
- Self-hosted JWT auth (no Clerk dependency)
- Auto-organization creation on first login
- Environments page enabled for self-hosted mode
- Settings page enabled for self-hosted mode

**AI Translation System** (replaces `@novu/ee-translation`)
- `packages/translation/` — full translation package with OpenAI GPT integration
- Variable protection: Handlebars `{{variables}}` tokenized before translation
- HTML structural validation on translated content
- Organization-level encrypted settings (AES-256)
- Locale alias mapping (e.g., `zh-hans` → `zh_CN`)
- Async Bull queue processing for batch translations
- Dashboard UI: settings panel, translate button, preview hook
- Translation bridge in worker for self-hosted notification delivery
- 6 REST API endpoints for translation management

**Infrastructure**
- Docker Compose self-hosted deployment configuration
- Nx circular dependency fix for local Docker builds
- CI trigger changed from `next` to `release` branch
- `ee-auth` stub package for self-hosted builds

**Testing**
- `test-renovu-e2e.sh` — 10 suites, 64 tests covering health, subscribers, workflows, triggers, in-app, locale, preferences, integrations, topics, edge cases
- `test-translation-e2e.sh` — 6 phases covering translation settings, auto-translate, variable preservation, locale delivery

---

### Upstream Novu Changelog

Changes merged from [novuhq/novu](https://github.com/novuhq/novu) `next` branch:

#### Novu v3.14.0 — 2026-02-12
- Email step resolver init & publish commands (NV-7094)
- Monthly usage digest email (NV-6933)
- CF step resolver dispatch worker (NV-7103)
- Cache workflow preferences in LRU store (worker performance)

#### Novu v3.13.0 — 2026-01-28
- Preference optimization flows (API + worker refactor)
- Enhanced sanitization logic for control values
- Default queue concurrency and batch flush interval updates
- Remove Intercom references
- WebSocket contextKeys made non-optional (NV-7091)
- User-agent header removal from JS/React SDKs (NV-7073)

#### Novu v3.12.0 — 2026-01-07
- Get started link URL update (dashboard)
- SocketWorker event handling simplification
- Traces schema date type for expire-at

#### Recent Upstream Fixes (synced 2026-02-24)
- Integration store provider crash fix (NV-7120)
- Workflow sync environment check
- Action required card alignment (NV-7122)
- Environment ID organization check
- Payload parsing fix
- MailerSend upgrade + message ID response fix
- Email layout name saving issue (NV-7084)
- Conditional preference fetches for global (performance)
- VariableInput readonly/disabled forwarding
- Nx build without cloud access
- Mongo duplicate error handling
- Allow null controlValues and restore behavior (NV-7112)
- Workflow step control management with override

---

### Sync Status

| | Version | Branch | Last Synced |
|---|---------|--------|-------------|
| **ReNovu** | v1.0.0 | `next` | — |
| **Upstream Novu** | v3.14.0 | `next` | 2026-02-24 |

To sync with upstream:
```bash
git fetch upstream
git merge upstream/next
# Resolve conflicts (keep ReNovu customizations)
git push origin next
```

## Contributing

ReNovu is community-driven. We welcome contributions for:

- Reverse-engineering additional enterprise features
- Adding new notification providers
- Improving documentation
- Bug fixes and optimizations

## Disclaimer

ReNovu is an independent project that modifies Novu for self-hosted use. It is not affiliated with, endorsed by, or supported by Novu Co. Use at your own discretion.

## License

Based on [Novu](https://github.com/novuhq/novu), licensed under MIT License.

---

<p align="center">
  <strong>ReNovu</strong> — Your notifications, your infrastructure, your rules.
</p>
