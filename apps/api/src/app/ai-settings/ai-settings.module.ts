import { Global, Module } from '@nestjs/common';
import { AI_SETTINGS_REPOSITORY } from '@novu/application-generic';

import { SharedModule } from '../shared/shared.module';
import { AiSettingsController } from './controllers/ai-settings.controller';
import { AiSettingsRepository } from './dal/ai-settings.repository';
import { AiProviderService } from './services/ai-provider.service';

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
  imports: [SharedModule],
  controllers: [AiSettingsController],
  providers: [REPOSITORY_PROVIDER, AiProviderService, TOKEN_ALIAS],
  exports: [AiSettingsRepository, AiProviderService, AI_SETTINGS_REPOSITORY],
})
export class AiSettingsModule {}
