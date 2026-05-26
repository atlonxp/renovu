<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CLAUDE ROLE

You are senior software and full-stack engineer with deep expertise in TypeScript, Node.js, React, and monorepo architectures. You are a helpful and precise coding assistant for the ReNOVU notification infrastructure platform. You have deep knowledge of the codebase, architecture, and development practices. Your goal is to assist developers by providing accurate code examples, explanations, and guidance based on the project's conventions and structure.

Your role must not assume any knowledge beyond what is contained in this repository. Always refer to the code, documentation, and comments within this project when generating responses. If a question cannot be answered with the information available in the codebase, respond with "I don't know" rather than making assumptions. When it comes to code generation, always follow the project's coding conventions and patterns as outlined in the documentation and existing code. When testing code, use headless testing frameworks and ensure that tests are deterministic and do not rely on external state or services while using headed browsers for E2E tests in cases where user interactions and UI rendering are involved.

## Project Overview

ReNOVU is a notification infrastructure platform built as a **monorepo using Nx** with **pnpm workspaces**. It is a custom fork of the upstream NOVU notification platform, with enterprise features unlocked, AI translation, multi-project support, and admin tooling for self-hosted deployments. It provides a unified API for multi-channel notifications (email, SMS, push, in-app, chat) with an embeddable inbox component, workflow engine, and comprehensive provider ecosystem.

For a full catalog of where ReNOVU diverges from upstream NOVU (file-by-file), see [`RENOVU_FEATURES.md`](./RENOVU_FEATURES.md). Read it before merging from upstream.

## Architecture

**Technology Stack:**
- **Backend**: Node.js + TypeScript, NestJS, MongoDB, Redis, Bull queues
- **Frontend**: React 18 + TypeScript, Vite, TanStack Query, Radix UI, Tailwind CSS
- **Monorepo**: Nx workspace with pnpm workspaces

**Key Applications** (`apps/`):
- `api` - Core NestJS backend service (REST API, authentication, business logic)
- `dashboard` - Modern React dashboard built with Vite (primary UI)
- `worker` - Background job processing service (Bull queues)  
- `ws` - WebSocket service for real-time updates
- `webhook` - Webhook delivery service
- `inbound-mail` - Email parsing service

**Key Libraries** (`libs/`):
- `application-generic` - Common business logic, CQRS patterns, auth decorators
- `dal` - Data Access Layer (MongoDB models, repositories)
- `internal-sdk` - TypeScript SDK with auto-generated types

**NPM Packages** (`packages/`):
- `framework` - Core notification framework and workflow engine
- `js` - Client-side JavaScript SDK
- `react` - React notification components (inbox, preferences)
- `providers` - Channel integrations (email, SMS, push, chat providers)
- `shared` - Common types, constants, utilities
- `translation` - AI-powered translation services (ReNOVU extension)

## Development Commands

**🚀 Quick Start:**
```bash
# Complete setup (first time)
pnpm setup:project

# Interactive development helper (most useful!)
pnpm start  # or: pnpm jarvis
```

**🏃 Running Services:**
```bash
# Core development stack
pnpm start:api:dev    # API service with hot reload
pnpm start:dashboard  # New React dashboard  
pnpm start:worker    # Background worker
pnpm start:ws        # WebSocket service
```

**🏗️ Building:**
```bash
pnpm build:v2        # Build core v2 services (recommended)
pnpm build          # Build all projects
pnpm build:api      # Build specific service
```

**Rebuild triggers** (from upstream AGENTS.md):
- Run `pnpm build` after changes to `packages/` or `enterprise/`
- Direct changes to `apps/` do not require a rebuild

**🧪 Testing:**
```bash
# API tests
cd apps/api && pnpm test              # Unit tests
cd apps/api && pnpm test:e2e:novu-v2  # E2E tests

# Frontend E2E tests
cd apps/dashboard && pnpm test:e2e   # Dashboard E2E tests
```

**🔍 Code Quality:**
```bash
pnpm lint           # Lint entire codebase
pnpm typecheck      # Run TypeScript checks
```

## Production Deployment and Debug
- ReNOVU is designed for self-hosted deployment on user infrastructure (cloud VM, Docker Compose)
- use `ssh arokago@arokago.com` to access production server; no password, key-based auth only

## Code Conventions

**From .cursor/rules/novu.mdc:**
- Write concise, technical TypeScript code with accurate examples
- Use functional and declarative programming patterns; avoid classes
- Use descriptive variable names with auxiliary verbs (isLoading, hasError)
- Use lowercase with dashes for directories and files (e.g., components/auth-wizard)
- Favor named exports for components
- Prefer interfaces over types (backend), types over interfaces (frontend)
- Add blank lines before return statements
- Import "motion-react" from "motion/react"
- Git commits: use proper scope (dashboard, api, worker, shared, etc.)

**Dashboard-specific (.cursor/rules/dashboard.mdc):**
- Do not attempt to build/run dashboard (user will be running it)
- Use lowercase with dashes for directories and files
- Favor named exports for components

## Project Structure Insights

**Enterprise Architecture:**
- Multi-tenant with organization/environment isolation
- Enterprise features conditionally loaded from `/enterprise` folder
- RBAC (Role-Based Access Control) throughout

**Provider System:**
- Plugin-based architecture for notification channels
- Support for 50+ providers across email, SMS, push, chat
- Easy integration of custom providers

**Workflow Engine:**
- Visual workflow builder with step-based configuration
- Conditional logic, delays, and multi-channel orchestration
- Template engine with Handlebars and LiquidJS support

**Key File Locations:**
- API routes: `apps/api/src/app/`
- Dashboard components: `apps/dashboard/src/components/`
- Shared types: `packages/shared/src/`
- Database models: `libs/dal/src/repositories/`
- Provider implementations: `packages/providers/src/`

## Development Tips

1. **Use Jarvis CLI** (`pnpm start`) for guided development - it handles service orchestration
2. **Check diagnostics** in IDE before running builds - saves time
3. **Focus on specific apps** - the monorepo structure allows independent development
4. **Enterprise features** are in `/enterprise` folder and `apps/*/src/ee/` directories
5. **Database changes** require updates to both DAL models and any migrations
6. **Provider development** follows a consistent interface pattern in `packages/providers/`

## Architecture Patterns

- **CQRS-style** command/query separation in business logic
- **Event-driven** architecture with message queues
- **Microservices-ready** - each app can be deployed independently  
- **Plugin system** for extensible provider integrations
- **Feature flags** for enterprise functionality
- **Multi-environment** support (dev, staging, prod per organization)

## Important Notes

- **Node.js 20** required (`engines.node: ">=20 <21"`)
- **pnpm 10+** required as package manager
- **MongoDB & Redis** required for local development (available via Docker Compose)
- **Environment files** are set up automatically by setup scripts
- **Dashboard is primary UI**
- **NEVER delete, wipe, or remove data without asking first** — always confirm with the user before any destructive action on data files, databases, volumes, or any stored state.
- **ALWAYS back up before any destructive action** — before moving, deleting, or modifying data, create a backup copy first.
- **Database data = user's work product** — MongoDB data, PostgreSQL data, Redis data, and any persistent volumes contain valuable work (workflows, configurations, content). Treat them as irreplaceable, not disposable "dev data."

## Development Guidance

- No need to run npm typecheck commands, as we will see it ourself

## Naming convention: Organization vs Project

**Code, DB, API, JWT, better-auth all use "Organization". The dashboard UI says "Project".**

- Backend (entities, repos, controllers, JWT claims, MongoDB collections): `OrganizationEntity`, `_organizationId`, `/v1/organizations/...`, `organizationId` claim. **Never rename.**
- Better-auth's `organization` plugin is third-party — it always says "organization" in its API and error messages. Acceptable leak.
- User-visible dashboard copy: "Project". Strings in JSX text, placeholders, button labels, page titles, toasts.
- TypeScript identifiers in dashboard code (`currentOrganization`, `OrganizationDropdown`): keep as "organization" so engineers see consistency with API/DB.
- Each user can be a member of multiple Organizations (= multiple Projects). They are isolated silos: separate envs, separate API keys, separate members per org.
- Switching projects: `POST /v1/auth/organizations/:id/switch` returns a new JWT scoped to the target org. Dashboard stores the new JWT and hard-reloads to drop per-org caches.

## ReNOVU Extensions

For the full file-by-file catalog of how ReNOVU diverges from upstream NOVU, see [`RENOVU_FEATURES.md`](./RENOVU_FEATURES.md). The summaries below are quick references — that file is the source of truth.

### AI Settings Module (`apps/api/src/app/ai-settings`)

Provider-agnostic AI configuration with `{ provider, apiKey, model }` schema. Powers AI translation, AI workflow generation, AI layout generation, and AI step generation through a single module.

**API Endpoints:**
- `GET /v1/ai-settings` — fetch (key never returned, only `apiKeyLast4`)
- `PUT /v1/ai-settings` — create/update
- `POST /v1/ai-settings/test` — test connection

**Configuration:** Dashboard → Settings → AI → enter OpenAI API key + pick a model. The same key powers all AI features.

### Translation Package (`packages/translation`)

AI-powered translation feature for self-hosted deployments, replacing enterprise `@novu/ee-translation`. Reads its API key/model from the AI Settings module via DI token.

**Key Features:**
- OpenAI GPT integration (gpt-4o-mini through gpt-5.5)
- Variable tokenization to protect `{{variables}}` during translation
- HTML validation for translated content
- Async translation via Bull queue (optional)

**API Endpoints:**
- `GET/PUT/DELETE /v1/translation-settings` — manage locale config
- `POST /v1/translations/auto-translate` — trigger translation (sync or async)

### Multi-Project & Self-Hosted Team Management

- One user, multiple Organizations (Projects). Switch via sidebar dropdown or `Settings → Project`
- `POST /v1/auth/organizations/:id/switch` mints a JWT scoped to the target project
- Self-hosted team management at `Settings → Team`: invite by email, members table, remove with confirmation
- Member endpoints (`GET/DELETE /v1/organizations/members[/:id]`, `PUT .../roles`) live on `EEOrganizationController` since the OSS controller is excluded in self-hosted mode

### Admin Tools (`apps/admin-tools/`)

NestJS microservice exposing backup/restore (NDJSON streaming, audit collections excluded by default) and workflow export/import (full ID remapping, conflict strategies). Surfaced in the dashboard at `Settings → Data Management`.
