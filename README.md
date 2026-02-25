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
  <a href="#admin-tools">Admin Tools</a> •
  <a href="#ai-translation">AI Translation</a> •
  <a href="#production-deployment">Production</a> •
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
| Custom layouts | 1 max | Unlimited | **Unlimited** |
| Remove branding | No | Yes | **Yes** |
| Multi-org support | No | Yes | **Yes** |
| AI Translation | No | $250+/mo | **Yes** |
| Backup & Restore | No | No | **Yes** |
| Workflow Export/Import | No | No | **Yes** |
| Priority support | No | Yes | Community |

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

Open [http://localhost:4000](http://localhost:4000) and create your first account.

## Access Points

| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | [localhost:4000](http://localhost:4000) | Web admin interface |
| API | [localhost:3000](http://localhost:3000) | REST API & OpenAPI docs |
| WebSocket | [localhost:3002](http://localhost:3002) | Real-time updates |
| Admin Tools | [localhost:3005](http://localhost:3005) | Backup/restore & export/import API |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Dashboard   │────▶│   API       │────▶│   Worker    │
│  :4000       │     │   :3000     │     │  (background)│
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
┌─────────────┐     ┌──────┴──────┐     ┌─────────────┐
│ Admin Tools  │────▶│  MongoDB    │◀────│  WebSocket  │
│  :3005       │     │  :27017     │     │  :3002      │
└─────────────┘     └─────────────┘     └─────────────┘
                    ┌─────────────┐
                    │   Redis     │
                    │   :6379     │
                    └─────────────┘
```

**Services:**

- **Dashboard** — React SPA (Vite) for managing workflows, layouts, and subscribers
- **API** — NestJS REST API handling auth, workflows, and notification orchestration
- **Worker** — Background job processor for sending notifications across channels
- **WebSocket** — Real-time notification delivery to connected clients
- **Admin Tools** — NestJS service for backup/restore and workflow export/import
- **MongoDB** — Primary data store
- **Redis** — Queue broker, caching, and pub/sub

## What's Unlocked

### Tier System
All organizations automatically receive **UNLIMITED** tier:
- Unlimited workflows and notification templates
- Unlimited team members
- Unlimited API calls
- All premium features enabled

### Email Layouts
- No plan-based limits — create unlimited layouts
- "Need more layouts? Contact Sales" paywall removed for self-hosted

### Branding Freedom
- "Powered by Novu" banners removed
- Inbox component footer hidden
- Full white-label capability

### Self-Hosted Auth
- No Clerk dependency
- JWT-based authentication
- Auto-organization creation on first login

## Admin Tools

Admin Tools (`apps/admin-tools/`) is a NestJS microservice providing data management capabilities via the Dashboard's **Settings > Data Management** tab.

### Backup & Restore

- **Create Backup** — Full MongoDB dump as a `.tar.gz` archive (25 collections)
- **List/Download/Delete** — Manage backup files (scoped per organization)
- **Restore** — Upload a backup file to restore the database
  - Auto-creates a pre-restore backup before overwriting
  - Supports dry-run mode for previewing what would be restored
- High-volume collections (jobs, notifications, messages) use cursor-based NDJSON streaming
- Batch inserts (5000 docs/batch) for efficient restore

### Workflow Export & Import

Export workflows from one environment and import into another — enables migration between local, staging, and production.

**Export** captures the full dependency graph:
- Workflows with steps and variants
- Message templates
- Layouts (v1 and v2) with content (control values)
- Notification groups and feeds

**Import** with full ID remapping:
- All internal references (`_templateId`, `_layoutId`, `_workflowId`, etc.) remapped to new IDs
- Conflict strategies: `skip` existing or `overwrite` existing
- Layout control values (v2 email content) properly transferred
- Environment and organization IDs reassigned to the target

### Authentication

Admin Tools supports two auth methods:
- **JWT** — Same token from Dashboard login (automatic)
- **API Key** — Set `ADMIN_API_KEY` env var for headless/CI usage

### CLI Scripts

```bash
# Inside the admin-tools container
node dist/cli/backup.js          # Create backup
node dist/cli/restore.js <file>  # Restore from file
node dist/cli/export.js          # Export workflows
node dist/cli/import.js <file>   # Import workflows
```

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

## Production Deployment

### Pre-built Images (Recommended)

All images are published to GHCR with multi-arch support (amd64 + arm64):

```
ghcr.io/atlonxp/renovu-api:latest
ghcr.io/atlonxp/renovu-worker:latest
ghcr.io/atlonxp/renovu-ws:latest
ghcr.io/atlonxp/renovu-dashboard:latest
ghcr.io/atlonxp/renovu-admin-tools:latest
```

```bash
# Start with production compose (uses GHCR images)
docker compose -f docker-compose.production.yml up -d
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | JWT signing secret |
| `STORE_ENCRYPTION_KEY` | 32-character encryption key |
| `NOVU_SECRET_KEY` | Novu secret key |
| `REDIS_PASSWORD` | Redis password |
| `API_EXTERNAL_URL` | Browser-accessible API URL (e.g., `https://novu-api.example.com`) |
| `WS_EXTERNAL_URL` | Browser-accessible WebSocket URL |
| `DASHBOARD_EXTERNAL_URL` | Browser-accessible dashboard URL |
| `ADMIN_TOOLS_EXTERNAL_URL` | Browser-accessible admin tools URL |

### Coolify Deployment

The `docker-compose.production.yml` is designed for [Coolify](https://coolify.io):

1. Create a new service in Coolify using Docker Compose
2. Point to this repo's `docker-compose.production.yml`
3. Set the required environment variables in Coolify's UI
4. Coolify handles Traefik routing and TLS automatically

### Configuration

```bash
# Security (CHANGE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key
STORE_ENCRYPTION_KEY=32-character-encryption-key!!
NOVU_SECRET_KEY=your-novu-secret-key

# Database
MONGO_USER=novu
MONGO_PASSWORD=secure-password
REDIS_PASSWORD=secure-redis-password

# External URLs (for production with reverse proxy)
API_EXTERNAL_URL=https://novu-api.example.com
WS_EXTERNAL_URL=https://novu-ws.example.com
DASHBOARD_EXTERNAL_URL=https://novu.example.com
ADMIN_TOOLS_EXTERNAL_URL=https://novu-admin.example.com

# Optional
PM2_INSTANCES=max          # PM2 cluster mode (default: max = CPU cores)
IMAGE_TAG=latest           # GHCR image tag
ADMIN_API_KEY=your-key     # API key for headless admin-tools access
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

### API E2E Tests

```bash
# Run full test suite (10 suites, 64 tests)
./test-renovu-e2e.sh

# Run specific suite
./test-renovu-e2e.sh --suite health
./test-renovu-e2e.sh --suite subscribers

# Translation-specific tests
./test-translation-e2e.sh
```

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

### Playwright UI Tests

```bash
cd tests/integration
npm install && npx playwright install chromium

# Run all UI tests
npx playwright test

# Headed mode (watch it run)
npx playwright test --headed

# Single test file
npx playwright test tests/01-create-workflows.e2e.ts
```

## Building Images

```bash
# Build all images locally
docker compose build

# Build and push multi-arch to GHCR
docker buildx build --builder multiarch \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/atlonxp/renovu-api:latest \
  -f docker/Dockerfile.api --push .
```

Available Dockerfiles in `docker/`:
- `Dockerfile.api` — API server
- `Dockerfile.worker` — Background worker
- `Dockerfile.ws` — WebSocket server
- `Dockerfile.dashboard` — Dashboard SPA
- `Dockerfile.admin-tools` — Admin tools service

## Project Structure

```
renovu/
├── apps/
│   ├── api/              # NestJS REST API
│   ├── dashboard/        # React admin dashboard (Vite)
│   ├── worker/           # Background job processor
│   ├── ws/               # WebSocket server
│   ├── admin-tools/      # Backup/restore + export/import service
│   ├── inbound-mail/     # Inbound email processor
│   └── webhook/          # Webhook delivery service
├── libs/
│   ├── dal/              # Data access layer (MongoDB repositories)
│   └── application-generic/
├── packages/
│   ├── shared/           # Shared types & constants
│   ├── framework/        # Workflow framework
│   ├── translation/      # AI translation (ReNovu extension)
│   ├── js/               # JavaScript SDK
│   ├── react/            # React components (Inbox)
│   └── providers/        # Channel provider implementations
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   ├── Dockerfile.ws
│   ├── Dockerfile.dashboard
│   └── Dockerfile.admin-tools
├── tests/
│   └── integration/      # Playwright UI E2E tests
├── docker-compose.yml              # Local development
├── docker-compose.production.yml   # Production (GHCR images)
├── test-renovu-e2e.sh              # API E2E tests
└── test-translation-e2e.sh         # Translation E2E tests
```

## Syncing with Upstream

```bash
# Add upstream remote (one-time)
git remote add upstream https://github.com/novuhq/novu.git

# Fetch and merge
git fetch upstream
git merge upstream/next
# Resolve conflicts (keep ReNovu customizations)
git push origin next
```

## Changelog

### ReNovu v1.1.0 — 2026-02-25

**Admin Tools — Data Management** (`apps/admin-tools/`)
- New NestJS microservice for data management operations
- Full MongoDB backup/restore: 25 collections, cursor-based NDJSON streaming for high-volume collections, batch inserts (5,000 docs/batch)
- Org-scoped backup storage — backups isolated per organization (multi-tenant safe), legacy flat backups auto-migrated on startup
- Workflow export/import with complete dependency graph: workflows → steps → message templates → layouts → control values
- Full ID remapping during import — all internal references (`_templateId`, `_layoutId`, `_workflowId`, etc.) remapped to target environment
- Layout control values (v2 email content) included in export/import
- Import conflict strategies: `skip` existing or `overwrite`
- Pre-restore safety backup created automatically before any restore
- Dry-run mode for previewing restore operations
- CLI scripts (`dist/cli/backup.js`, `restore.js`, `export.js`, `import.js`) for headless/CI usage
- Dual auth: JWT (from Dashboard) + API key (`ADMIN_API_KEY` env var) for automation

**Dashboard — Data Management UI**
- New **Settings > Data Management** tab with backup/restore and workflow export/import
- Backup: create, list, download, delete — with file size and date display
- Restore: upload `.tar.gz`, dry-run toggle, confirmation dialog
- Export: select all or individual workflows, download as JSON
- Import: upload JSON, select conflict strategy (skip/overwrite), progress feedback

**Dashboard — Self-Hosted Fixes**
- Email layouts paywall removed — "Need more layouts? Contact Sales" replaced with `IS_SELF_HOSTED` check
- Comprehensive `VITE_SELF_HOSTED` type fixes across 20+ components
- Vercel integration page stubbed out (not applicable for self-hosted)
- Settings and Environments pages enabled for self-hosted mode
- Settings page crash fix (null membership handling)
- Backup date display format fix

**Infrastructure**
- Multi-arch Docker images (linux/amd64 + linux/arm64) published to GHCR
- Production compose (`docker-compose.production.yml`) designed for Coolify with Traefik labels
- Staging compose (`docker-compose.staging.yml`) with environment-specific configuration
- PM2 cluster mode (`PM2_INSTANCES=max`) for API, Worker, and WebSocket services
- MongoDB persistent volume with configurable `MONGO_DATA_PATH`
- ARM64 Docker build fixes: QEMU timeout workaround for WebSocket service, PM2 binary symlinks

**Testing**
- Playwright integration test suite: 3 test files, 15 tests covering account creation, workflows, backup/restore, export/import
- Sequential test execution with shared state across test files

### ReNovu v1.0.0 — 2026-02-24

**Self-Hosted Enterprise Unlock**
- All enterprise tier restrictions removed for self-hosted deployments
- `UNLIMITED` tier auto-assigned to all new organizations — unlimited workflows, team members, API calls
- Removed `@clerk/clerk-react` dependency — replaced with self-hosted JWT authentication
- Auto-organization creation on first user signup
- `ee-auth` stub package created to satisfy build dependencies without Clerk
- Self-hosted mode blank page after login fixed
- React 18/19 type conflicts resolved in notifications package

**AI Translation System** (replaces `@novu/ee-translation`)
- New `packages/translation/` package — drop-in replacement for Novu's enterprise translation
- OpenAI GPT integration with model selection (gpt-4o-mini, gpt-4o, gpt-4-turbo)
- Handlebars variable protection — `{{subscriber.firstName}}` and other variables tokenized before translation, preventing corruption
- HTML structural validation on translated content
- Organization-level encrypted settings (AES-256) stored in MongoDB
- Locale alias mapping for non-standard codes (e.g., `zh-hans` → `zh_CN`)
- Async Bull queue processing for batch translations
- Translation bridge in Worker for notification delivery with locale support
- Dashboard UI: settings panel with API key management, translate button on workflows, preview hook
- API endpoints: settings CRUD, connection test, auto-translate trigger, async job status

**Docker & CI/CD**
- 5 production Dockerfiles: `Dockerfile.api`, `Dockerfile.worker`, `Dockerfile.ws`, `Dockerfile.dashboard`, `Dockerfile.admin-tools`
- GitHub Actions workflow for automated GHCR image publishing
- Programmable Docker Compose files with environment variable overrides for all service images
- Coolify deployment support with GHCR image directives
- Nx circular dependency fix for local Docker builds

**Testing**
- `test-renovu-e2e.sh` — 10 API E2E suites, 64 tests (health, subscribers, workflows, triggers, in-app, locale, preferences, integrations, topics, edge-cases)
- `test-translation-e2e.sh` — 6 translation-specific test phases
- Self-hosted auth E2E suite: 7 tests, 11 assertions

### Sync Status

| | Version | Branch | Last Synced |
|---|---------|--------|-------------|
| **ReNovu** | v1.1.0 | `staging` | — |
| **Upstream Novu** | v3.14.0 | `next` | 2026-02-24 |

## Disclaimer

ReNovu is an independent project that modifies Novu for self-hosted use. It is not affiliated with, endorsed by, or supported by Novu Co. Use at your own discretion.

## License

Based on [Novu](https://github.com/novuhq/novu), licensed under MIT License.

---

<p align="center">
  <strong>ReNovu</strong> — Your notifications, your infrastructure, your rules.
</p>
