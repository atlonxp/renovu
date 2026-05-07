# ReNOVU Feature & File Catalog

> **Read this before merging from upstream NOVU.**
>
> This document is the canonical inventory of every file ReNOVU has added or customized relative to upstream `novuhq/novu`. When you `git merge upstream/next` and resolve conflicts, this is the file that prevents you from accidentally clobbering a ReNOVU feature.
>
> Last reviewed: **2026-05-08** (during ReNOVU v2.5.0-dev work on `renovu-v2.5-dev`).
> Upstream baseline: NOVU v3.14.1 + `merge/upstream-next-2026-05` merge.

---

## How to use this file

1. **Before merging upstream**, skim this file end-to-end and note which files in the catalog overlap with the upstream changeset (`git log upstream/next --name-only --since=<last-merge>`).
2. **During conflict resolution**, default to keeping the ReNOVU side for any file flagged with `[CUSTOM]`. For `[NEW]` files, conflicts shouldn't happen — they don't exist upstream.
3. **After merging**, update the "Last reviewed" date at the top and add new entries below if you've added more ReNOVU-specific code.

Tags used:
- `[NEW]` — file was created by ReNOVU; no upstream equivalent
- `[CUSTOM]` — file exists upstream but ReNOVU has modified it
- `[ALIASED]` — upstream file is replaced via Vite alias / DI token at build time

---

## 1. Self-Hosted Auth (no Clerk)

**Why:** Upstream NOVU's dashboard hard-depends on Clerk. ReNOVU ships an in-tree shim so the dashboard runs with email/password + JWT.

| File | Tag | Purpose |
|---|---|---|
| `apps/dashboard/src/utils/self-hosted/index.tsx` | `[NEW]` | Re-implements `useAuth`, `useOrganization`, `useOrganizationList`, `useUser`, `useClerk`, `ClerkProvider` |
| `apps/dashboard/src/utils/self-hosted/auth.resource.tsx` | `[NEW]` | JWT-backed `AuthContextProvider` |
| `apps/dashboard/src/utils/self-hosted/organization.resource.tsx` | `[NEW]` | Active-org context fed from JWT claim |
| `apps/dashboard/src/utils/self-hosted/user.resource.tsx` | `[NEW]` | User context from JWT |
| `apps/dashboard/src/utils/self-hosted/jwt-manager.tsx` | `[NEW]` | localStorage JWT lifecycle |
| `apps/dashboard/src/utils/self-hosted/components.tsx` | `[NEW]` | Drop-in Clerk component replacements (`UserProfile`, `SignIn`, `SignUp`, `OrganizationProfile`, etc.) |
| `apps/dashboard/src/utils/self-hosted/organization-switcher.tsx` | `[NEW]` | Static project label (used in mobile-only paths) |
| `apps/dashboard/src/utils/self-hosted/user-button.tsx` | `[NEW]` | User dropdown |
| `apps/dashboard/src/utils/self-hosted/user-profile-form.tsx` | `[NEW]` | Profile edit form |
| `apps/dashboard/src/utils/self-hosted/icons.tsx` | `[NEW]` | Inline NOVU/ReNOVU SVG marks |
| `apps/dashboard/vite.config.ts` | `[CUSTOM]` | `excludeCloudFilesPlugin` redirects `region-context` to self-hosted version. Aliases `@/context/region` to no-op self-hosted version when `VITE_SELF_HOSTED=true`. **NOTE:** previously also aliased `@/components/side-navigation/organization-dropdown-clerk` to the static switcher — that alias was REMOVED in v2.5 because it was hijacking the rich dropdown |
| `packages/ee-auth/` | `[NEW]` | Stub package replacing `@novu/ee-auth` so the build doesn't pull Clerk |
| `apps/api/src/app/auth/usecases/register/register.usecase.ts` | `[CUSTOM]` | Self-hosted email/password registration |
| `apps/api/src/app/auth/usecases/login/login.usecase.ts` | `[CUSTOM]` | Self-hosted login |
| `apps/api/src/app/auth/services/jwt.service.ts` | `[CUSTOM]` | JWT minting with `organizationId` / `environmentId` claims |

**Conflict signature:** Anything in `apps/dashboard/src/utils/self-hosted/`, the dashboard `vite.config.ts`, or the API `auth/` module will trigger conflicts when upstream evolves Clerk integration. Keep ours.

---

## 2. Multi-Project (multiple Organizations per User)

**Why:** Upstream supports multi-org through Clerk; we need it natively for self-hosted.

| File | Tag | Purpose |
|---|---|---|
| `apps/api/src/app/auth/usecases/switch-organization/switch-organization.usecase.ts` | `[NEW]` | Mints fresh JWT scoped to target org, validates membership, guards against malformed ObjectId (returns 401, not 500) |
| `apps/api/src/app/auth/usecases/switch-organization/switch-organization.command.ts` | `[NEW]` | Command DTO |
| `apps/api/src/app/auth/auth.controller.ts` | `[CUSTOM]` | Adds `POST /v1/auth/organizations/:id/switch` |
| `apps/api/src/app/organization/dtos/create-organization.dto.ts` | `[CUSTOM]` | Validates `name` with `@IsNotEmpty + @MinLength(1) + @MaxLength(100) + @Transform(trim)` (was accepting empty strings) |
| `apps/dashboard/src/api/organization.ts` | `[CUSTOM]` | `getOrganizations`, `createOrganization`, `switchOrganization` API client |
| `apps/dashboard/src/components/side-navigation/organization-dropdown.tsx` | `[CUSTOM]` | Re-exports the rich dropdown (no longer aliased to static via vite.config) |
| `apps/dashboard/src/components/side-navigation/organization-dropdown-clerk.tsx` | `[CUSTOM]` | Rich self-hosted dropdown using `useOrganizationList` from self-hosted shim. Chevron `opacity-60` at rest (not `opacity-0`) so the click affordance is visible |
| `apps/dashboard/src/pages/organization-list.tsx` | `[CUSTOM]` | Self-hosted project list page (`SelfHostedProjectListPage`) |
| `apps/dashboard/src/components/settings/projects-management-self-hosted.tsx` | `[NEW]` | Settings → Project: list, switch, "New project" link |
| `apps/dashboard/src/components/settings/organization-settings.tsx` | `[CUSTOM]` | Mounts `ProjectsManagementSelfHosted` when self-hosted |

**Conflict signature:** Auth controller, auth usecases, organization DTO, sidebar dropdown.

---

## 3. Self-Hosted Team Management

**Why:** Upstream uses Clerk's `OrganizationProfile` for team management; self-hosted has nothing.

| File | Tag | Purpose |
|---|---|---|
| `apps/api/src/app/organization/ee.organization.controller.ts` | `[CUSTOM]` | Adds `GET /v1/organizations/members`, `DELETE /v1/organizations/members/:id`, `PUT /v1/organizations/members/:id/roles` (the OSS controller defines these too but is excluded in self-hosted mode) |
| `apps/api/src/app/organization/organization.module.ts` | `[CUSTOM]` | `getControllers()` switches to `EEOrganizationController` when self-hosted |
| `apps/dashboard/src/api/members.ts` | `[NEW]` | `getMembers`, `inviteMember`, `resendInvite`, `removeMember` API client |
| `apps/dashboard/src/components/settings/team-settings-self-hosted.tsx` | `[NEW]` | Settings → Team UI: invite form, members table, status badges, remove confirmation |
| `apps/dashboard/src/pages/settings.tsx` | `[CUSTOM]` | Mounts `TeamSettingsSelfHosted` for self-hosted Team tab |

**Conflict signature:** EEOrganizationController + organization.module.ts. Upstream may evolve members endpoints — preserve our additions.

---

## 4. AI Settings (generalized provider config)

**Why:** Originally OpenAI key/model lived inside Translation Settings, which became misleading once layouts/workflows/steps also used it. ReNOVU pulled it out into a provider-agnostic AI Settings module.

| File | Tag | Purpose |
|---|---|---|
| `apps/api/src/app/ai-settings/ai-settings.module.ts` | `[NEW]` | `@Global()` module |
| `apps/api/src/app/ai-settings/dal/ai-settings.entity.ts` | `[NEW]` | `{ provider, apiKey, model }` schema |
| `apps/api/src/app/ai-settings/dal/ai-settings.schema.ts` | `[NEW]` | Mongoose schema, unique `_organizationId` index |
| `apps/api/src/app/ai-settings/dal/ai-settings.repository.ts` | `[NEW]` | `findByOrganization`, `upsertSettings`, `deleteByOrganization`, AES-256 encryption |
| `apps/api/src/app/ai-settings/controllers/ai-settings.controller.ts` | `[NEW]` | `GET/PUT /v1/ai-settings`, `POST /v1/ai-settings/test` |
| `apps/api/src/app/ai-settings/services/ai-provider.service.ts` | `[NEW]` | Single entry point for layout/workflow/translation AI calls |
| `apps/api/migrations/move-openai-to-ai-settings/` | `[NEW]` | One-time migration: copies `openaiApiKey`/`openaiModel` from `translationsettings` → `aisettings` |
| `apps/dashboard/src/api/ai-settings.ts` | `[NEW]` | Dashboard API client |
| `apps/dashboard/src/hooks/use-ai-settings.ts` | `[NEW]` | Fetch + update mutation |
| `apps/dashboard/src/components/settings/ai-settings.tsx` | `[NEW]` | Settings → AI tab |
| `apps/dashboard/src/pages/settings.tsx` | `[CUSTOM]` | Adds AI tab and mounts `AiSettings` |
| `apps/dashboard/src/utils/routes.ts` | `[CUSTOM]` | Adds `SETTINGS_AI: '/settings/ai'` |
| `packages/translation/src/services/openai-translation.service.ts` | `[CUSTOM]` | Reads from AI Settings module via DI token (broke circular dep with application-generic) |
| `apps/api/src/app/layouts-v2/usecases/generate-layout/generate-layout.usecase.ts` | `[CUSTOM]` | Uses `AiSettingsRepository` instead of `TranslationSettingsRepository` |
| `apps/api/src/app/workflows-v2/usecases/generate-workflow/generate-workflow.usecase.ts` | `[CUSTOM]` | Same |
| `packages/translation/src/dal/translation-settings.entity.ts` | `[CUSTOM]` | Removed `openaiApiKey`, `openaiModel` fields |
| `packages/translation/src/dal/translation-settings.schema.ts` | `[CUSTOM]` | Same |
| `packages/translation/src/controllers/translation-settings.controller.ts` | `[CUSTOM]` | Removed key/model from PUT, removed test endpoint |

**Conflict signature:** Translation package, layouts-v2 generate, workflows-v2 generate.

---

## 5. AI Translation Package

**Why:** Replaces `@novu/ee-translation` (enterprise-gated upstream).

| File | Tag | Purpose |
|---|---|---|
| `packages/translation/` | `[NEW]` | Whole package |
| `packages/translation/src/services/openai-translation.service.ts` | `[NEW]` | OpenAI GPT integration with variable tokenization, HTML validation |
| `packages/translation/src/usecases/auto-translate/auto-translate.usecase.ts` | `[NEW]` | Sync translation flow |
| `packages/translation/src/usecases/manage-translations/manage-translations.usecase.ts` | `[NEW]` | Translation CRUD |
| `apps/worker/src/app/workflow/services/translation.service.ts` | `[CUSTOM]` | Bridge for notification delivery with locale support |

**Conflict signature:** Anything `@novu/ee-translation`-shaped upstream — we replaced it wholesale.

---

## 6. Admin Tools (backup/restore + export/import)

**Why:** Upstream has nothing for backup or workflow migration between environments.

| File | Tag | Purpose |
|---|---|---|
| `apps/admin-tools/` | `[NEW]` | Whole NestJS service |
| `apps/admin-tools/src/backup/backup.service.ts` | `[CUSTOM within NEW]` | Audit/activity collections excluded by default; large collections stream as NDJSON to dodge V8 heap OOM |
| `apps/admin-tools/src/cli/{backup,restore,export,import}.ts` | `[NEW]` | CLI scripts |
| `docker/Dockerfile.admin-tools` | `[NEW]` | Container image |
| `apps/dashboard/src/components/settings/data-management-settings.tsx` | `[NEW]` | Settings → Data Management UI |

**Conflict signature:** None — entirely additive.

---

## 7. Branding & Meta

**Why:** Disambiguate the fork from upstream NOVU.

| File | Tag | Purpose |
|---|---|---|
| `apps/dashboard/index.html` | `[CUSTOM]` | `<title>`, og tags use ReNOVU |
| `apps/dashboard/public/manifest.json` | `[CUSTOM]` | PWA name uses ReNOVU |
| `apps/dashboard/src/components/page-meta.tsx` | `[CUSTOM]` | Default title suffix is `| ReNOVU` |
| `apps/dashboard/src/pages/sign-in.tsx`, `sign-up.tsx`, `landing-1-signup.tsx`, `welcome-page.tsx`, `agents-usecase-page.tsx` | `[CUSTOM]` | PageMeta titles say ReNOVU |
| `README.md` | `[CUSTOM]` | Full ReNOVU branding + changelog |
| `RENOVU_FEATURES.md` | `[NEW]` | This file |
| `CLAUDE.md` | `[CUSTOM]` | AI agent instructions for the ReNOVU codebase |

**Branding rules** (apply when copy mentions the brand):
- lowercase `novu` → `renovu`
- capitalized `Novu` / `NOVU` → `ReNOVU`
- Upstream references (when describing what was forked) stay `NOVU`
- **Do NOT rename:** npm package names (`@novu/api`, `@novu/shared`), TypeScript class names (`Novu`, `NovuSDK`), provider IDs (`EmailProviderIdEnum.Novu`), MongoDB collection names, JWT claims, environment variables (`NOVU_SECRET_KEY`), URLs (`novu.co`), repo (`novuhq/novu`), legal entity (`Novu Co.` in disclaimer)

---

## 8. Tier Unlock & Paywall Removal

**Why:** Self-hosted users shouldn't hit "Contact Sales" walls.

| File | Tag | Purpose |
|---|---|---|
| `apps/api/src/app/organization/usecases/create-organization/create-organization.usecase.ts` | `[CUSTOM]` | New orgs get `apiServiceLevel: UNLIMITED` |
| `libs/application-generic/src/utils/check-feature-tier.ts` | `[CUSTOM]` | UNLIMITED tier short-circuits all gates |
| `apps/dashboard/src/components/layouts/layouts-list.tsx` | `[CUSTOM]` | Layout count paywall removed for `IS_SELF_HOSTED` |
| Various dashboard `useFeatureFlag` callsites | `[CUSTOM]` | Self-hosted defaults to enabled for branding-removal flag |

**Conflict signature:** Anything around feature flags, tier checks, or `apiServiceLevel`.

---

## 9. Build & Deployment

**Why:** Multi-arch images, Coolify, and self-hosted-friendly compose configs that don't exist upstream.

| File | Tag | Purpose |
|---|---|---|
| `docker/Dockerfile.{api,worker,ws,dashboard,admin-tools}` | `[NEW or CUSTOM]` | Production Dockerfiles. Some derived from upstream, others entirely new (admin-tools) |
| `docker-compose.yml` | `[CUSTOM]` | Local dev with multi-service orchestration |
| `docker-compose.production.yml` | `[NEW]` | Standalone production w/ host port bindings |
| `docker-compose.coolify.yml` | `[NEW]` | Coolify w/ no custom networks (avoids 504 from Traefik misrouting) |
| `.github/workflows/publish-ghcr.yml` | `[NEW]` | Multi-arch GHCR publish |
| `pnpm-workspace.yaml` | `[CUSTOM]` | `enterprise/packages/*` removed |
| `package.json` (root) | `[CUSTOM]` | `@novu/ee-billing`, `@novu/ee-shared-services`, `@novu/ee-translation`, `@novu/ee-api` removed from app deps |
| `apps/api/package.json` | `[CUSTOM]` | Same |

**Conflict signature:** `pnpm-workspace.yaml`, `package.json` (root and `apps/api/`).

---

## 10. Misc bug fixes & hardening (recurring)

These are smaller fixes that may or may not still be needed depending on upstream state. Worth checking each merge:

| File | Tag | Notes |
|---|---|---|
| `apps/api/src/app/environments-v1/usecases/output-renderers/email-output-renderer.usecase.ts` | `[CUSTOM]` | Layout fallback fix |
| `apps/api/src/app/layouts-v2/usecases/preview-layout/preview-layout.usecase.ts` | `[CUSTOM]` | Preview crash when layout missing |
| `apps/dashboard/src/components/maily/maily.tsx` | `[CUSTOM]` | maily-core editor wiring |
| `libs/maily-core/src/editor/components/bubble-menu/*` | `[CUSTOM]` | Editor menu fixes |
| `apps/api/src/app/translation/...` | `[CUSTOM]` | Various `TranslationWorker.bullMqWorker` upstream-API-change adaptations |

When upstream evolves any of these, double-check the fix is still needed.

---

## Branch & Sync Convention

| Branch | Purpose |
|---|---|
| `next` | Latest stable ReNOVU release line |
| `release` | Tagged release builds (deployed to production) |
| `renovu-v1-{date}` | Frozen v1.x snapshot (production rollback target) |
| `renovu-v2-{date}` | Frozen v2.x snapshot |
| `renovu-v2.5-dev` | Active development for v2.5 (currently the multi-project + AI settings work) |
| `merge/upstream-next-{YYYY-MM}` | Temporary branch for resolving upstream merges before fast-forwarding into `next` |

**Workflow for upstream merge:**
1. `git checkout -b merge/upstream-next-YYYY-MM next`
2. `git fetch upstream && git merge upstream/next`
3. Open this file. Check the catalog against `git diff --name-only HEAD upstream/next`
4. Resolve conflicts; lean toward keeping ReNOVU side for `[CUSTOM]` files
5. Run `pnpm typecheck && ./test-renovu-e2e.sh` and the headed Playwright drive-through
6. Merge into `next`, then tag a new `renovu-v{x.y}-{date}` snapshot
7. Update the "Last reviewed" date at the top of this file

---

## TODO when adding a new ReNOVU feature

When you ship a feature that diverges from upstream:

- [ ] Add an entry to the appropriate section above (or create a new section)
- [ ] Tag each file `[NEW]`, `[CUSTOM]`, or `[ALIASED]`
- [ ] Note the **why** in plain English — six months from now you won't remember
- [ ] If applicable, add a "Conflict signature" line so future merges know what to watch for
- [ ] Add a changelog entry to `README.md`
