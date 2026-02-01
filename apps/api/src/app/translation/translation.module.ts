import { Module } from '@nestjs/common';
import { TranslationSettingsController } from './translation-settings.controller';
import { TranslationsController } from './translations.controller';
import { SharedModule } from '../shared/shared.module';

/**
 * API Translation Module
 *
 * This module provides authenticated endpoints for translation settings
 * and translation management.
 * It wraps the @novu/translation services with proper API authentication.
 */
@Module({
  imports: [SharedModule],
  controllers: [TranslationSettingsController, TranslationsController],
})
export class ApiTranslationModule {}
