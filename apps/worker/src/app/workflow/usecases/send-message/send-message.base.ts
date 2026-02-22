import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CreateExecutionDetails,
  CreateExecutionDetailsCommand,
  createProviderSelectedMessage,
  DetailEnum,
  GetNovuProviderCredentials,
  Instrument,
  SelectIntegration,
  SelectIntegrationCommand,
  SelectVariant,
  SelectVariantCommand,
} from '@novu/application-generic';
import {
  IntegrationEntity,
  JobEntity,
  LocalizationGroupRepository,
  LocalizationRepository,
  LocalizationResourceEnum,
  MessageRepository,
  MessageTemplateEntity,
  SubscriberRepository,
} from '@novu/dal';
import {
  ChannelTypeEnum,
  ChatProviderIdEnum,
  EmailProviderIdEnum,
  ExecutionDetailsSourceEnum,
  ExecutionDetailsStatusEnum,
  ITenantDefine,
  ProvidersIdEnum,
  providers,
  SmsProviderIdEnum,
  TriggerOverrides,
} from '@novu/shared';
import { format } from 'date-fns';
import i18next from 'i18next';
import { merge } from 'lodash';
import { PlatformException } from '../../../shared/utils';
import { SendMessageChannelCommand } from './send-message-channel.command';
import { SendMessageResult, SendMessageStatus, SendMessageType } from './send-message-type.usecase';

export abstract class SendMessageBase extends SendMessageType {
  abstract readonly channelType: ChannelTypeEnum;
  protected constructor(
    protected messageRepository: MessageRepository,
    protected createExecutionDetails: CreateExecutionDetails,
    protected subscriberRepository: SubscriberRepository,
    protected selectIntegration: SelectIntegration,
    protected getNovuProviderCredentials: GetNovuProviderCredentials,
    protected selectVariant: SelectVariant,
    protected moduleRef: ModuleRef
  ) {
    super(messageRepository, createExecutionDetails);
  }

  protected combineOverrides(
    bridgeData: Record<string, any> | null | undefined,
    overrides: TriggerOverrides | undefined,
    stepId: string | undefined,
    integrationId: string
  ): Record<string, unknown> {
    const bridgeProviderData = bridgeData?.providers?.[integrationId] || {};
    const workflowGlobalProviderOverrides = overrides?.providers?.[integrationId] || {};
    const triggerOverrides = stepId ? overrides?.steps?.[stepId]?.providers?.[integrationId] || {} : {};

    return merge({}, bridgeProviderData, workflowGlobalProviderOverrides, triggerOverrides);
  }

  @Instrument()
  protected async getIntegration(params: {
    id?: string;
    providerId?: ProvidersIdEnum;
    identifier?: string;
    organizationId: string;
    environmentId: string;
    channelType: ChannelTypeEnum;
    userId: string;
    recipientEmail?: string;
    filterData: {
      tenant: ITenantDefine | undefined;
    };
  }): Promise<IntegrationEntity | undefined> {
    const integration = await this.selectIntegration.execute(SelectIntegrationCommand.create(params));

    if (!integration) {
      return;
    }

    if (
      integration.providerId === EmailProviderIdEnum.Novu ||
      integration.providerId === SmsProviderIdEnum.Novu ||
      integration.providerId === ChatProviderIdEnum.Novu
    ) {
      integration.credentials = await this.getNovuProviderCredentials.execute({
        channelType: integration.channel,
        providerId: integration.providerId,
        environmentId: integration._environmentId,
        organizationId: integration._organizationId,
        userId: params.userId,
        recipientEmail: params.recipientEmail,
      });
    }

    return integration;
  }

  protected storeContent(): boolean {
    return this.channelType === ChannelTypeEnum.IN_APP || process.env.STORE_NOTIFICATION_CONTENT === 'true';
  }

  protected getCompilePayload(compileContext) {
    const { payload, ...rest } = compileContext;

    return { ...payload, ...rest };
  }

  protected async sendErrorHandlebars(job: JobEntity, error: string): Promise<SendMessageResult> {
    await this.createExecutionDetails.execute(
      CreateExecutionDetailsCommand.create({
        ...CreateExecutionDetailsCommand.getDetailsFromJob(job),
        detail: DetailEnum.MESSAGE_CONTENT_NOT_GENERATED,
        source: ExecutionDetailsSourceEnum.INTERNAL,
        status: ExecutionDetailsStatusEnum.FAILED,
        isTest: false,
        isRetry: false,
        raw: JSON.stringify({ error }),
      })
    );

    return {
      status: SendMessageStatus.FAILED,
      errorMessage: DetailEnum.MESSAGE_CONTENT_NOT_GENERATED,
    };
  }

  @Instrument()
  protected async sendSelectedIntegrationExecution(job: JobEntity, integration: IntegrationEntity) {
    const providerDisplayName = providers.find((el) => el.id === integration?.providerId)?.displayName || 'Unknown';

    await this.createExecutionDetails.execute(
      CreateExecutionDetailsCommand.create({
        ...CreateExecutionDetailsCommand.getDetailsFromJob(job),
        detail: createProviderSelectedMessage(providerDisplayName) as DetailEnum,
        source: ExecutionDetailsSourceEnum.INTERNAL,
        status: ExecutionDetailsStatusEnum.PENDING,
        isTest: false,
        isRetry: false,
        raw: JSON.stringify({
          providerId: integration?.providerId,
          identifier: integration?.identifier,
          name: integration?.name,
          _environmentId: integration?._environmentId,
          _id: integration?._id,
        }),
      })
    );
  }

  @Instrument()
  protected async processVariants(command: SendMessageChannelCommand): Promise<MessageTemplateEntity> {
    const { messageTemplate, conditions } = await this.selectVariant.execute(
      SelectVariantCommand.create({
        organizationId: command.organizationId,
        environmentId: command.environmentId,
        userId: command.userId,
        step: command.step,
        job: command.job,
        filterData: command.compileContext ?? {},
      })
    );

    if (conditions) {
      await this.createExecutionDetails.execute(
        CreateExecutionDetailsCommand.create({
          ...CreateExecutionDetailsCommand.getDetailsFromJob(command.job),
          detail: DetailEnum.VARIANT_CHOSEN,
          source: ExecutionDetailsSourceEnum.INTERNAL,
          status: ExecutionDetailsStatusEnum.PENDING,
          isTest: false,
          isRetry: false,
          raw: JSON.stringify({ conditions }),
        })
      );
    }

    return messageTemplate;
  }

  @Instrument()
  protected async initiateTranslations(environmentId: string, organizationId: string, locale: string | undefined) {
    try {
      if (process.env.NOVU_ENTERPRISE === 'true' || process.env.CI_EE_TEST === 'true') {
        if (!require('@novu/ee-shared-services')?.TranslationsService) {
          throw new PlatformException('Translation module is not loaded');
        }
        const service = this.moduleRef.get(require('@novu/ee-shared-services')?.TranslationsService, { strict: false });
        const { namespaces, resources, defaultLocale } = await service.getTranslationsList(
          environmentId,
          organizationId
        );

        const instance = i18next.createInstance({
          resources,
          ns: namespaces,
          defaultNS: false,
          nsSeparator: '.',
          lng: locale || 'en',
          compatibilityJSON: 'v2',
          fallbackLng: defaultLocale || 'en',
          interpolation: {
            formatSeparator: ',',
            format(value, formatting, lng) {
              if (value && formatting && !Number.isNaN(Date.parse(value))) {
                return format(new Date(value), formatting);
              }

              return value.toString();
            },
          },
        });

        await instance.init();

        return instance;
      }
    } catch (e) {
      Logger.error(e, `Unexpected error while importing enterprise modules`, 'TranslationsService');
    }
  }

  /**
   * ReNovu Translation Bridge
   *
   * Look up translated content for a workflow step based on subscriber locale.
   * Used in self-hosted mode where translations are stored as full content
   * replacements in LocalizationGroup/Localization collections (via auto-translate).
   *
   * @param templateId - The workflow's internal _id (_templateId)
   * @param locale - The subscriber's locale (e.g., "ja_JP", "th", "ko_KR")
   * @param environmentId - Environment ID
   * @param organizationId - Organization ID
   * @returns Parsed content map (e.g., {"step.email.subject": "...", "step.email.body": "..."}) or null
   */
  @Instrument()
  protected async getTranslatedContent(
    templateId: string | undefined,
    locale: string | undefined,
    environmentId: string,
    organizationId: string
  ): Promise<Record<string, string> | null> {
    if (!locale || !templateId) return null;

    try {
      const localizationGroupRepo = this.moduleRef.get(LocalizationGroupRepository, { strict: false });
      const localizationRepo = this.moduleRef.get(LocalizationRepository, { strict: false });

      // Find the localization group for this workflow
      const group = await localizationGroupRepo.findByResource(
        LocalizationResourceEnum.WORKFLOW,
        templateId,
        environmentId,
        organizationId
      );

      if (!group || group.enabled === false) return null;

      // Find translation for this locale
      let localization = await localizationRepo.findOne({
        _localizationGroupId: group._id,
        locale,
        _environmentId: environmentId,
        _organizationId: organizationId,
      });

      // Try locale normalization if not found (e.g., "ja" -> "ja_JP", "ja-JP" -> "ja_JP")
      if (!localization) {
        const normalizedLocale = this.normalizeLocale(locale);
        if (normalizedLocale !== locale) {
          localization = await localizationRepo.findOne({
            _localizationGroupId: group._id,
            locale: normalizedLocale,
            _environmentId: environmentId,
            _organizationId: organizationId,
          });
        }
      }

      if (!localization?.content) return null;

      const content =
        typeof localization.content === 'string' ? JSON.parse(localization.content) : localization.content;

      Logger.log(
        `Translation found for workflow ${templateId}, locale ${locale}: ${Object.keys(content).length} keys`,
        'TranslationBridge'
      );

      return content as Record<string, string>;
    } catch (e) {
      Logger.error(e, `Failed to get translated content for workflow ${templateId}, locale ${locale}`, 'TranslationBridge');

      return null;
    }
  }

  /**
   * Apply translations to a step template for a specific channel.
   *
   * Looks up translated content and replaces template fields (subject, content, title, etc.)
   * with translated versions. The translated content still contains Handlebars variables
   * (e.g., {{name}}, {{company}}) which will be compiled in the subsequent step.
   *
   * Content key convention: "step.<channel>.<field>" (e.g., "step.email.subject", "step.in_app.content")
   *
   * @param step - The workflow step with template to modify
   * @param channelType - The channel type (email, in_app, sms, push, chat)
   * @param templateId - The workflow's internal _id
   * @param locale - The subscriber's locale
   * @param environmentId - Environment ID
   * @param organizationId - Organization ID
   * @returns true if translations were applied, false otherwise
   */
  @Instrument()
  protected async applyTranslationsToStep(
    step: { template?: MessageTemplateEntity },
    channelType: ChannelTypeEnum,
    templateId: string | undefined,
    locale: string | undefined,
    environmentId: string,
    organizationId: string
  ): Promise<boolean> {
    if (!step.template) return false;
    const translatedContent = await this.getTranslatedContent(templateId, locale, environmentId, organizationId);

    if (!translatedContent) return false;

    const channelKey = this.getChannelKey(channelType);
    let applied = false;

    // Map content keys to template fields
    for (const [key, value] of Object.entries(translatedContent)) {
      // Support both "step.<channel>.<field>" and direct "<field>" patterns
      const channelPrefix = `step.${channelKey}.`;
      let field: string | undefined;

      if (key.startsWith(channelPrefix)) {
        field = key.substring(channelPrefix.length);
      } else if (!key.includes('.')) {
        field = key;
      }

      if (!field || !value) continue;

      // Apply translation to the appropriate template field
      switch (field) {
        case 'subject':
          if (step.template.subject !== undefined) {
            step.template.subject = value;
            applied = true;
          }
          break;
        case 'content':
        case 'body':
          if (step.template.content !== undefined) {
            step.template.content = value;
            applied = true;
          }
          break;
        case 'title':
          if ((step.template as any).title !== undefined) {
            (step.template as any).title = value;
            applied = true;
          }
          break;
        case 'senderName':
          if ((step.template as any).senderName !== undefined) {
            (step.template as any).senderName = value;
            applied = true;
          }
          break;
        case 'preheader':
          if ((step.template as any).preheader !== undefined) {
            (step.template as any).preheader = value;
            applied = true;
          }
          break;
      }
    }

    if (applied) {
      Logger.log(
        `Applied translations for ${channelKey} channel, locale ${locale}, workflow ${templateId}`,
        'TranslationBridge'
      );
    }

    return applied;
  }

  private getChannelKey(channelType: ChannelTypeEnum): string {
    switch (channelType) {
      case ChannelTypeEnum.EMAIL:
        return 'email';
      case ChannelTypeEnum.IN_APP:
        return 'in_app';
      case ChannelTypeEnum.SMS:
        return 'sms';
      case ChannelTypeEnum.PUSH:
        return 'push';
      case ChannelTypeEnum.CHAT:
        return 'chat';
      default:
        return (channelType as string).toLowerCase();
    }
  }

  private normalizeLocale(locale: string): string {
    // Convert "ja-JP" to "ja_JP"
    const normalized = locale.replace('-', '_');

    // If it's a short locale like "ja", try common full locale patterns
    if (!normalized.includes('_')) {
      const localeMap: Record<string, string> = {
        ja: 'ja_JP',
        th: 'th_TH',
        ko: 'ko_KR',
        es: 'es_ES',
        fr: 'fr_FR',
        de: 'de_DE',
        zh: 'zh_CN',
        ar: 'ar_SA',
        pt: 'pt_BR',
        ru: 'ru_RU',
        hi: 'hi_IN',
        id: 'id_ID',
        my: 'my_MM',
        en: 'en_US',
      };

      return localeMap[normalized] || normalized;
    }

    return normalized;
  }
}
