import { Global, Module } from '@nestjs/common';
import { AI_SETTINGS_REPOSITORY } from '@novu/application-generic';

import { AiSettingsRepository } from './dal/ai-settings.repository';

// ReNovu: self-hosted worker boot fix.
//
// Upstream's @novu/translation package declares OpenAITranslationService, which
// @Inject(AI_SETTINGS_REPOSITORY)s its first constructor argument, but the
// package never provides that token — by design it expects the host app to
// provide it (see IAiSettingsLookup in @novu/application-generic). The api app
// satisfies this via its own @Global() AiSettingsModule; the worker did not,
// so when TranslationWorkerModule pulled in @novu/translation the worker
// crash-looped on boot ("Nest can't resolve dependencies of the
// OpenAITranslationService ... AI_SETTINGS_REPOSITORY at index [0]"), which
// stopped all queue consumption (no notifications delivered).
//
// Provide AI_SETTINGS_REPOSITORY here and mark the module @Global() so the
// dynamically-imported @novu/translation module can resolve it. Mirrors
// apps/api/src/app/ai-settings/ai-settings.module.ts and the precedent fix for
// the community auth module (provide a missing upstream token locally).
const REPOSITORY_PROVIDER = {
  provide: AiSettingsRepository,
  useFactory: () => new AiSettingsRepository(),
};

const TOKEN_ALIAS = {
  provide: AI_SETTINGS_REPOSITORY,
  useExisting: AiSettingsRepository,
};

@Global()
@Module({
  providers: [REPOSITORY_PROVIDER, TOKEN_ALIAS],
  exports: [AiSettingsRepository, AI_SETTINGS_REPOSITORY],
})
export class AiSettingsModule {}
