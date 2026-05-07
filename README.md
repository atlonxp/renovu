<h1 align="center">ReNOVU</h1>

<p align="center">
  <strong>Re</strong>verse-Engineered <strong>NOVU</strong> — Self-hosted notifications with enterprise features unlocked
</p>

<p align="center">
  <em>A custom fork of <a href="https://novu.co">NOVU</a> with better features and first-class self-hosting</em>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#whats-different">What's Different</a> •
  <a href="#admin-tools">Admin Tools</a> •
  <a href="#ai-translation">AI Translation</a> •
  <a href="#multi-project">Multi-Project</a> •
  <a href="#production-deployment">Production</a> •
  <a href="#testing">Testing</a> •
  <a href="#changelog">Changelog</a> •
  <a href="#roadmap">Roadmap</a>
</p>

---

## What is ReNOVU?

ReNOVU is a customized fork of the upstream NOVU notification platform, rebuilt for self-hosted deployments. It removes enterprise-tier paywalls, adds first-class auth without Clerk, ships an AI translation system, multi-project support, and a backup/export tooling layer — all under a single open codebase.

For a complete catalog of what differs from upstream NOVU (with file paths, useful when merging upstream commits), see [`RENOVU_FEATURES.md`](./RENOVU_FEATURES.md).

---

## Team

| Role | Name | Contact |
|------|------|---------|
| **Chief Architect & Lead Developer** | atlonxp | [GitHub](https://github.com/atlonxp) |

---

## What's Different

NOVU is excellent open-source notification infrastructure, but many features are locked behind enterprise tiers and the dashboard hard-depends on Clerk. **ReNOVU** unlocks the lot for self-hosters and adds capabilities that don't exist upstream:

| Feature | NOVU Free | NOVU Enterprise | ReNOVU |
|---------|:---------:|:---------------:|:------:|
| Unlimited workflows | Limited | Yes | **Yes** |
| Custom layouts | 1 max | Unlimited | **Unlimited** |
| Remove branding | No | Yes | **Yes** |
| Multi-project per user | No | Limited | **Yes** |
| AI Translation | No | $250+/mo | **Yes** |
| AI Settings (provider-agnostic) | No | No | **Yes** |
| Self-hosted Team management | No | No | **Yes** |
| Backup & Restore | No | No | **Yes** |
| Workflow Export/Import | No | No | **Yes** |
| Drop-in self-hosted auth (no Clerk) | No | No | **Yes** |
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

- **Dashboard** — React SPA (Vite) for managing workflows, layouts, subscribers, projects, and team members
- **API** — NestJS REST API handling auth, workflows, AI settings, and notification orchestration
- **Worker** — Background job processor for sending notifications across channels
- **WebSocket** — Real-time notification delivery to connected clients
- **Admin Tools** — NestJS service for backup/restore and workflow export/import
- **MongoDB** — Primary data store
- **Redis** — Queue broker, caching, and pub/sub

## Naming convention: Organization vs Project

> **Code, DB, API, JWT all use "Organization". The dashboard UI says "Project".**

ReNOVU keeps the upstream identifier names intact for compatibility with NOVU SDKs, but the user-facing dashboard talks about "Projects":

- Backend (entities, repos, controllers, JWT claims, MongoDB collections): `OrganizationEntity`, `_organizationId`, `/v1/organizations/...`, `organizationId` claim. **Never rename.**
- User-visible dashboard copy: "Project". Strings in JSX text, placeholders, button labels, page titles, toasts.
- Each user can be a member of multiple Organizations (= multiple Projects). They are isolated silos: separate envs, separate API keys, separate members per org.

## Multi-Project

Self-hosted ReNOVU supports multiple isolated projects per user (a feature only partially exposed upstream).

- **Sidebar dropdown** — every page has a project switcher with hover affordance, showing all projects you're a member of plus a "Create project" link
- **`/auth/organization-list`** — full project-list page lets you browse, create, and switch projects with a JWT swap + hard reload
- **`POST /v1/auth/organizations/:id/switch`** — mints a fresh JWT scoped to the target project. Caller must be a member or 401
- **Settings → Project** — list your projects, switch with one click, link to project creation
- **Settings → Team** — invite teammates by email, see active members + pending invites, resend or revoke

Tenant isolation is enforced via `_organizationId` filtering on all 36+ entities — there is no leakage path between projects.

## Self-Hosted Auth

ReNOVU replaces the upstream Clerk dependency with a JWT-based auth shim and email/password flow.

- **No Clerk required** — the `apps/dashboard/src/utils/self-hosted/` shim re-implements `useAuth`, `useOrganization`, `useOrganizationList`, `useUser`, `useClerk` to draw from a JWT in localStorage
- **Email + password registration** — `POST /v1/auth/register` returns a JWT
- **Auto-organization on first signup** — first user becomes OSS_ADMIN of a default project
- **Vite alias trick** — `@/context/region` is aliased to a self-hosted no-op when `VITE_SELF_HOSTED=true`, dropping Clerk-dependent cloud bundles entirely

## AI Translation

ReNOVU includes a fully working AI-powered translation system that replaces NOVU's enterprise-gated `@novu/ee-translation` package.

### Features

- **OpenAI GPT integration** — supports gpt-4o-mini through gpt-5.5 model lineup
- **Variable protection** — `{{subscriber.firstName}}` and other Handlebars variables are tokenized before translation, preventing corruption
- **HTML validation** — translated content is validated for structural integrity
- **Organization-level settings** — API keys encrypted with AES-256, configurable per project
- **Locale aliases** — map non-standard locale codes (e.g., `zh-hans` → `zh_CN`)
- **Async translation** — optional Bull queue processing for large batches
- **Dashboard UI** — full settings panel, translate button, and preview in the dashboard

### Configuration

Open Dashboard → **Settings → AI** (the new dedicated AI Settings tab, ReNOVU-only) → enter your OpenAI API key, choose a model, save. The same key powers AI translation, AI workflow generation, AI layout generation, and AI step generation.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/ai-settings` | Get organization AI settings (key never returned, only `apiKeyLast4`) |
| PUT | `/v1/ai-settings` | Create/update settings (provider, apiKey, model) |
| POST | `/v1/ai-settings/test` | Test provider connection |
| GET | `/v1/translation-settings` | Get locale config (defaultLocale, targetLocales, aliases) |
| PUT | `/v1/translation-settings` | Update locale config |
| POST | `/v1/translations/auto-translate` | Trigger translation |

## Admin Tools

Admin Tools (`apps/admin-tools/`) is a NestJS microservice providing data management capabilities via the Dashboard's **Settings → Data Management** tab.

### Backup & Restore

- **Create Backup** — full MongoDB dump as a `.tar.gz` archive (audit/activity collections excluded by default to keep size sane)
- **List/Download/Delete** — manage backup files (scoped per organization)
- **Restore** — upload a backup file to restore the database
  - Auto-creates a pre-restore backup before overwriting
  - Supports dry-run mode for previewing what would be restored
- High-volume collections (jobs, notifications, messages) use cursor-based NDJSON streaming to avoid V8 heap OOM
- Batch inserts (5000 docs/batch) for efficient restore

### Workflow Export & Import

Export workflows from one environment and import into another — enables migration between local, staging, and production.

**Export** captures the full dependency graph: workflows with steps and variants, message templates, layouts (v1 and v2) with content (control values), notification groups and feeds.

**Import** with full ID remapping: all internal references (`_templateId`, `_layoutId`, `_workflowId`, etc.) remapped to new IDs. Conflict strategies: `skip` existing or `overwrite` existing. Layout control values (v2 email content) properly transferred. Environment and organization IDs reassigned to the target.

### Authentication

- **JWT** — same token from Dashboard login (automatic)
- **API Key** — set `ADMIN_API_KEY` env var for headless/CI usage

### CLI Scripts

```bash
# Inside the admin-tools container
node dist/cli/backup.js          # Create backup
node dist/cli/restore.js <file>  # Restore from file
node dist/cli/export.js          # Export workflows
node dist/cli/import.js <file>   # Import workflows
```

## Production Deployment

### Pre-built Images

All images are published to GHCR (linux/amd64 — production target is x86_64 Linux; on Apple Silicon they run via Rosetta under OrbStack):

```
ghcr.io/atlonxp/renovu-api:latest
ghcr.io/atlonxp/renovu-worker:latest
ghcr.io/atlonxp/renovu-ws:latest
ghcr.io/atlonxp/renovu-dashboard:latest
ghcr.io/atlonxp/renovu-admin-tools:latest
```

### Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Local development (builds from source) |
| `docker-compose.production.yml` | Standalone production (GHCR images, host port bindings) |
| `docker-compose.coolify.yml` | Coolify deployment (GHCR images, no ports/networks — Coolify manages Traefik) |

```bash
# Local development
docker compose up -d

# Standalone production
docker compose -f docker-compose.production.yml up -d

# Coolify (set in Coolify UI, not run manually)
# docker compose -f docker-compose.coolify.yml up -d
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | JWT signing secret |
| `STORE_ENCRYPTION_KEY` | 32-character encryption key |
| `NOVU_SECRET_KEY` | NOVU secret key (kept as-is for SDK compatibility) |
| `REDIS_PASSWORD` | Redis password |
| `API_EXTERNAL_URL` | Browser-accessible API URL (e.g., `https://renovu-api.example.com`) |
| `WS_EXTERNAL_URL` | Browser-accessible WebSocket URL |
| `DASHBOARD_EXTERNAL_URL` | Browser-accessible dashboard URL |
| `ADMIN_TOOLS_EXTERNAL_URL` | Browser-accessible admin tools URL |
| `VITE_SELF_HOSTED` | Set to `true` to enable the self-hosted dashboard auth shim |

### Auto-applied data migrations

The API runs pending data migrations automatically on every boot via `apps/api/src/migrations-runtime/`. Cross-replica safe (Mongo lock), idempotent, recorded in `_renovu_migrations`. **No manual `pnpm migration ...` step is needed on deploy.** See [`RENOVU_FEATURES.md → Deploy Runbook`](./RENOVU_FEATURES.md#deploy-runbook) for the full procedure and rollback.

### Coolify Deployment

Use `docker-compose.coolify.yml` for [Coolify](https://coolify.io) deployments:

1. Create a new service in Coolify using Docker Compose
2. Point to this repo's `docker-compose.coolify.yml` on the `release` branch
3. Set the required environment variables in Coolify's UI
4. Set `RENOVU_DATA_DIR` for persistent storage (e.g., `/home/user/renovu`)
5. Coolify handles Traefik routing, TLS, and networking automatically

> **Important:** `docker-compose.coolify.yml` has no custom networks or host port bindings. Coolify creates a shared network for all services. Adding a second network causes Traefik to randomly pick the wrong one, resulting in 504 errors.

## Providers

ReNOVU supports 50+ notification providers out of the box (inherited from upstream NOVU):

<details>
<summary><strong>Email / SMS / Push / Chat (collapsed)</strong></summary>

**Email:** Sendgrid, Mailgun, Amazon SES, Postmark, SMTP, Mailjet, Mandrill, Brevo (Sendinblue), MailerSend, Resend, SparkPost, Outlook 365.

**SMS:** Twilio, Plivo, Amazon SNS, Vonage (Nexmo), Telnyx, Termii, Gupshup, Clickatell, Infobip.

**Push:** Firebase Cloud Messaging (FCM), Expo, Apple Push Notification Service (APNS), OneSignal, Pushpad.

**Chat:** Slack, Discord, Microsoft Teams, Mattermost.

</details>

## Testing

### API E2E Tests

```bash
# Run full test suite
./test-renovu-e2e.sh

# Translation-specific tests
./test-translation-e2e.sh
```

### Playwright UI Tests

```bash
cd apps/dashboard
npx playwright install chromium

# Headed mode (watch it run)
npx tsx tests/multi-project-headed-v2.ts

# Or via the standard Playwright runner
npx playwright test --headed
```

The headed test (`tests/multi-project-headed-v2.ts`) walks through the full multi-project flow with `slowMo` so every interaction is visible — useful for debugging UI regressions.

## Project Structure

```
renovu/
├── apps/
│   ├── api/              # NestJS REST API
│   │   └── src/app/ai-settings/   # ReNOVU: provider-agnostic AI settings
│   ├── dashboard/        # React admin dashboard (Vite)
│   ├── worker/           # Background job processor
│   ├── ws/               # WebSocket server
│   ├── admin-tools/      # ReNOVU: backup/restore + export/import service
│   ├── inbound-mail/     # Inbound email processor
│   └── webhook/          # Webhook delivery service
├── libs/
│   ├── dal/              # Data access layer (MongoDB repositories)
│   └── application-generic/
├── packages/
│   ├── shared/           # Shared types & constants
│   ├── framework/        # Workflow framework
│   ├── translation/      # ReNOVU: AI translation
│   ├── ee-auth/          # ReNOVU: self-hosted Clerk-replacement stub
│   ├── js/               # JavaScript SDK
│   ├── react/            # React components (Inbox)
│   └── providers/        # Channel provider implementations
├── docker/               # Production Dockerfiles
├── docker-compose.yml              # Local development
├── docker-compose.production.yml   # Standalone production
├── docker-compose.coolify.yml      # Coolify deployment
├── README.md                       # This file
├── RENOVU_FEATURES.md              # ReNOVU vs upstream feature catalog (read this when merging)
├── CLAUDE.md                       # AI agent instructions
└── test-renovu-e2e.sh              # API E2E tests
```

## Syncing with Upstream

When merging from upstream NOVU, **always check [`RENOVU_FEATURES.md`](./RENOVU_FEATURES.md) first** — it's the canonical catalog of files we've customized or added, with the rationale for each. That's the file that prevents you from accidentally clobbering ReNOVU features when resolving merge conflicts.

```bash
# Add upstream remote (one-time)
git remote add upstream https://github.com/novuhq/novu.git

# Fetch and merge
git fetch upstream
git merge upstream/next
# Resolve conflicts (keep ReNOVU customizations — see RENOVU_FEATURES.md)
git push origin next
```

## Changelog

### ReNOVU v2.5.0 — 2026-05-08 (in development on `renovu-v2.5-dev`)

**Multi-Project Support (Option A — Multiple Organizations per User)**
- One user can now belong to multiple Organizations, each surfaced in the dashboard as a "Project"
- New `POST /v1/auth/organizations/:id/switch` endpoint mints a JWT scoped to the target project
- Sidebar project dropdown rewritten — rich `DropdownMenu` with avatar, name, hover-revealed chevron, list of memberships, and "Create project" footer item
- Empty-name validation hardened on `POST /v1/organizations` (was 201 with zombie org, now 422)
- Malformed `orgId` switch returns 401 (was crashing 500 on Mongo ObjectId cast)
- Hard-reload pattern after switch — sidesteps any React Query cache key that forgot to include `orgId`

**Self-Hosted Team Management**
- New `Settings → Team` UI with invite form, members table, status badges (`Active`/`Pending invite`), Resend invite, Remove member with confirmation dialog
- Members API endpoints (`GET/DELETE /v1/organizations/members[/:id]`, `PUT /v1/organizations/members/:id/roles`) added to `EEOrganizationController` so they're available in self-hosted mode (the OSS controller is excluded when self-hosted)

**Self-Hosted Project Management**
- New `Settings → Project` projects-management section listing all your projects with Switch buttons, "Currently active" pill, and "New project" link
- Reuses the same `useClerk().setActive` hard-reload path as the sidebar dropdown

**AI Settings — Generalized**
- Moved OpenAI configuration out of Translation Settings into a new `aisettings` collection with `{ provider, apiKey, model }` schema (room for Anthropic/Gemini later)
- New `Settings → AI` tab in the dashboard
- One-time migration `move-openai-to-ai-settings` ports existing keys (encrypted blob is portable since both collections use the same `STORE_ENCRYPTION_KEY`)
- AI translation, AI layout generation, AI workflow/step generation all funnel through the new module

**OpenAI Model Lineup**
- Added gpt-4o-mini through gpt-5.5 to the model picker; older obsolete models removed

**Backup Service Hardening**
- Audit/activity collections (`activity`, `activityfeed`, `notificationtemplates`) excluded from backups by default — these grow unbounded and are not recovery-critical
- Large collections stream as NDJSON to avoid V8 heap OOM on 1M+ row exports

**Branding Pass**
- All user-visible branding standardized: lowercase `novu` → `renovu`, capitalized `Novu`/`NOVU` → `ReNOVU`. References to upstream remain `NOVU`. Internal identifiers (npm package names, class names, provider IDs, `_organizationId`) untouched.

**Bug Fixes from Upstream Merge**
- Fixed dashboard runtime breakage from upstream merge (commit `168ea3aef5`)
- Broke circular dependency in translation package via runtime DI tokens
- Regenerated `pnpm-lock.yaml` after upstream merge

**Production Image Stability**
- MongoDB pinned to `mongo:8.0.15` (was bare `mongo:8.0`) — bare tag was pre-fix release that crashes on Linux kernel 6.19+ with the SERVER-121912 kernel-version-check bug. 8.0.5+ patches have the fix.
- `mongoose` declared as direct dep in `apps/api/package.json` — pnpm only hoists declared deps in production builds, so the bootstrap-eager `@Global()` AI Settings module crashed on container start with `Cannot find module 'mongoose'`. Other apps/api files import mongoose too (contexts, agents, channel-endpoints, switch-organization) and would have hit the same wall lazily.
- Production Dockerfiles cleaned up: removed obsolete `COPY patches ./patches` step (upstream removed `patches/` and the `smtp-server` patched dep)
- `apps/api/tsconfig.build.json` now excludes `**/e2e/**` — prevents upstream's `apps/api/src/app/agents/e2e/mock-agent-handler.ts` TS errors from blocking production builds
- GHA `.github/workflows/build-push.yml` rebranded to ReNOVU, includes `admin-tools` in the build matrix, and pins to `linux/amd64` (production target is x86_64 Linux)

**Upstream Sync — NOVU `next` (17 commits, 2026-05-07)**
- Security: `basic-ftp` 5.2.2 → 5.3.0 (NV-7554), removed obsolete `smtp-server` patchedDependencies
- `apps/inbound-mail` deps refreshed for Node 22 compatibility (NV-7401)
- Inbound-mail New Relic custom tracing (NV-7019)
- Agent framework DX improvements + starter template (NV-7451)
- Provider instances nested in agent and outbound pickers (#11005)
- Onboarding welcome DM + bridge-connected follow-up (NV-7450)
- `ctx.metadata.delete()`/`clear()`/`get()`/`current` (NV-7501)
- Dashboard: Activity Feed nav highlight on conversations page (NV-7546), Bridge URL warning tooltip (NV-7547), webhook URL input width on agent details (NV-7402)
- API: Azure setup OAuth reads/writes scoped by `_environmentId`, Slack reaction events in app manifest (NV-7478)
- CI: aggregator gate for PR pipeline (#11023)

### ReNOVU v1.4.0 — 2026-03-01

**Email Layout Fixes**
- Fixed email layouts not being applied during rendering — default layout now correctly resolved using V2 layout lookup
- Fixed preview crash when layout not found
- Per-step layout selection working

**Upstream Sync — NOVU v3.14.1** (8 commits)
- AI sidekick UI polishing, granular workflow tools, socket type explicit option for SDKs

**Build & Infrastructure**
- `check-ee.mjs` stubs for enterprise package builds — prevents build failures when enterprise source is absent
- `STEP_RESOLVER_DISPATCH_URL` made optional for self-hosted

### ReNOVU v1.3.0 — 2026-02-27

**Upstream Sync — NOVU v3.14.0** (30 commits)
- SQS as alternative queue backend, AI workflow generation, React Email step editor (partial), Cloudflare step resolver

**Enterprise Package Cleanup**
- `enterprise/packages/*` removed from `pnpm-workspace.yaml`
- All enterprise imports use optional chaining — gracefully absent at runtime
- `@novu/ee-auth` remains as our self-hosted stub

### ReNOVU v1.2.0 — 2026-02-27

**Coolify Deployment**
- Purpose-built `docker-compose.coolify.yml` (no custom networks, no host port bindings)

**Worker Crash Loop Fix**
- MongoDB connection pool misconfiguration (`MONGO_MAX_POOL_SIZE` set, `MONGO_MIN_POOL_SIZE` missing) — fixed across all compose files

### ReNOVU v1.1.0 — 2026-02-25

**Admin Tools — Data Management** (`apps/admin-tools/`)
- New NestJS microservice with backup/restore (25 collections, NDJSON streaming, batch inserts)
- Org-scoped backup storage
- Workflow export/import with full ID remapping

**Dashboard — Self-Hosted Fixes**
- Email layouts paywall removed
- `VITE_SELF_HOSTED` type fixes across 20+ components
- Settings & Environments pages enabled for self-hosted mode

### ReNOVU v1.0.0 — 2026-02-24

**Self-Hosted Enterprise Unlock**
- All enterprise tier restrictions removed for self-hosted deployments
- `UNLIMITED` tier auto-assigned to all new organizations
- Removed `@clerk/clerk-react` dependency — replaced with self-hosted JWT auth
- `ee-auth` stub package created

**AI Translation System** (replaces `@novu/ee-translation`)
- New `packages/translation/` package
- OpenAI GPT integration with model selection
- Handlebars variable protection
- Organization-level encrypted settings (AES-256)
- Async Bull queue processing

### Sync Status

| | Version | Branch | Last Synced |
|---|---------|--------|-------------|
| **ReNOVU** | v2.5.0-dev | `renovu-v2.5-dev` | 2026-05-08 |
| **Upstream NOVU** | v3.15.0 | `next` | 2026-05-08 (merged via `merge/upstream-next-2026-05`) |

## Roadmap

ReNOVU is built incrementally — each version pulls in upstream NOVU and layers self-host-friendly extensions. Items below are tracked in [`RENOVU_FEATURES.md`](./RENOVU_FEATURES.md) under the **Backlog** section. No fixed dates — features ship when they're ready.

### Near-term (v2.6 candidates)

- **Continuous typecheck during dev** — surface TS errors in real time as you edit, instead of only on build/CI
- **Per-organization backup/restore policies** — schedule + retention + offsite mirror, configurable per project
- **Admin-tools image in upstream-equivalent GHA** — currently only built in our `build-push.yml`; mirror it into any upstream pipeline we adopt
- **Anthropic + Gemini AI providers** — `aisettings.provider` enum already has room (currently OpenAI-only); add provider switch in `services/ai-provider.service.ts`
- **Workflow Export/Import — UI polish** — current implementation is API-first; surface diff preview and conflict picker in the dashboard

### Mid-term

- **Inbound email — self-hosted-friendly setup** — currently inherits upstream Cloud's Domain Connect manifest; document a reverse-proxy + DNS pattern that doesn't depend on `domainconnect.novu.co`
- **Bring back arm64 native images** — once base images stabilize, restore `linux/arm64` to the GHA matrix (currently amd64-only because production targets are x86_64 Linux)
- **Self-hosted SSO** — email/password works today; add OIDC/SAML for enterprise self-hosters
- **Audit log retention controls** — backup excludes `activity`/`activityfeed`/`notificationtemplates` by default to keep dumps sane; add UI controls for retention windows and on-demand purge

### Out of scope (intentionally)

- **Cloud-tier billing/metering** — the upstream paywall stack stays excluded by design
- **`novu.co` Domain Connect submission** — the `domain-connect/` manifest was removed in v2.5; that's upstream Novu Cloud's surface, not ours
- **Clerk parity** — we replaced Clerk with a JWT shim; no plans to re-add a SaaS auth dependency

If you want something prioritized, open an issue with the use case.

## Disclaimer

ReNOVU is an independent project that modifies NOVU for self-hosted use. It is not affiliated with, endorsed by, or supported by Novu Co. Use at your own discretion.

## License

Based on [NOVU](https://github.com/novuhq/novu), licensed under the MIT License.

---

<p align="center">
  <strong>ReNOVU</strong> — Your notifications, your infrastructure, your rules.
</p>
