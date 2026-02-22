# ReNovu State — 2026-02-22

## Branch: `feature/translation-unlock`

### 7 Unpushed Commits (on top of origin)

1. `f04757259b` fix: resolve TypeScript build errors in translation package
2. `69cf7f0511` fix: type compatibility between API and translation package
3. `deeecc7304` fix: type compatibility for layout translation usecases
4. `5c58244fa8` feat(translation): add translate button and auto-translate for missing locales
5. `8e4fd01d77` feat(translation): add locale normalization with custom aliases support
6. `f8eae5239a` feat(translation): self-hosted translation improvements, locale aliases, and preview hook
7. `a69e3810c4` fix(dashboard): resolve TypeScript errors in translation feature components

### What Was Built

**Translation Feature (Self-Hosted ReNovu):**
- API: `ApiTranslationModule` replacing inline controllers; `create-workflow` passes `resourceInternalId`/`resourceName`
- DAL: `enabled` field on `LocalizationGroupEntity` for filtering disabled groups
- Dashboard: smarter onboarding (skip if settings already configured)
- Dashboard: locale aliases dialog with built-in + custom mappings
- Dashboard: self-hosted checks OpenAI key instead of subscription tier for translation access
- Dashboard: debounced target locale saves on onboarding page
- Dashboard: `useTranslatedPreview` hook applies translations to step preview with TipTap rendering
- Dashboard: `headerEndItems` prop on DashboardLayout/HeaderNavigation (translations page Settings button)
- Dashboard: fix inbox button subscriber ID for self-hosted (use `currentUser._id`)
- Dashboard: settings link replaces "Contact Sales" in self-hosted user menu
- Translation package: content extractor service
- Translation package: locale normalization with custom aliases support
- `docker-compose.build.yml` for local image builds

### TypeScript Status
- `tsc -p tsconfig.app.json --noEmit` passes with **0 errors**

### Dev Environment
- MongoDB: `localhost:27017` (Docker)
- Redis: `localhost:6380` (Docker, avoids ArokaGO conflict on 6379)
- API: `localhost:3000` (Node 20 via nvm)
- Worker: `localhost:3004`
- Dashboard: `localhost:4201`
- WebSocket: `localhost:3002`
- **Requires Node.js 20** (`nvm use 20`) — system Node v25 breaks `SlowBuffer`

### Pending Tasks
1. Push 7 commits to `origin/feature/translation-unlock`
2. Test auto-translation end-to-end in dev environment
3. Build multi-arch Docker images (amd64 + arm64) for GHCR deployment
4. Stash was fully resolved and merged — no remaining stashes

### Infrastructure Notes
- GHCR images: `ghcr.io/atlonxp/renovu-{api,worker,ws,dashboard}`
- Currently arm64-only — need multi-arch build before staging deploy
- ArokaGO staging compose already renamed to `renovu-*` service names
