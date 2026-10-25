import { Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  buildWorkflowVariablesForJob,
  CreateExecutionDetails,
  CreateExecutionDetailsCommand,
  createProviderSelectedMessage,
  DetailEnum,
  GetNovuProviderCredentials,
  Instrument,
  type IntegrationFilterData,
  type IntegrationSelectionResult,
  SelectIntegration,
  SelectIntegrationCommand,
  SelectVariant,
  SelectVariantCommand,
} from '@novu/application-generic';
import {
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
  getProviderOverrideConfig,
  INTEGRATION_OVERRIDES_OUTPUT_KEY,
  layerClaimsExclusiveGroup,
  ProvidersIdEnum,
  providers,
  resolveExclusiveRoutingKeys,
  SmsProviderIdEnum,
  TriggerOverrides,
  unpackProviderOverrideOutput,
} from '@novu/shared';
import { format } from 'date-fns';
import i18next from 'i18next';
import { cloneDeep, isPlainObject, mergeWith } from 'lodash';
import { PlatformException, TRANSLATIONS_SERVICE } from '../../../shared/utils';
import { SendMessageChannelCommand } from './send-message-channel.command';
import { SendMessageResult, SendMessageStatus, SendMessageType } from './send-message-type.usecase';

/**
 * Never replace this with a plain `merge`: lodash merges arrays element-by-element, so a
 * higher-priority `blocks: [x]` layered over a persisted `blocks: [a, b, c]` would yield
 * `[merge(a, x), b, c]` — a corrupted first element plus two stale ones. An override array is a
 * complete replacement of the list it overrides, so the higher-priority array wins whole.
 *
 * The clone keeps the result detached from the command the way `merge` used to: the merged blob
 * leaves the worker as `bridgeProviderData`, and it is reused across every endpoint of a fan-out.
 */
function replaceArrays(_targetValue: unknown, sourceValue: unknown): unknown[] | undefined {
  if (Array.isArray(sourceValue)) {
    return cloneDeep(sourceValue);
  }

  return undefined;
}

type BridgeProviderOverrides = {
  providers?: Record<string, Record<string, unknown>>;
};

/**
 * For each exclusive key group, the highest-precedence layer that claims it — sets one of its keys
 * to a value `resolveExclusiveRoutingKeys` can still use — keeps its group keys, and every other
 * layer loses them. That stops a deep-merge from leaving a mixed destination (e.g. FCM `topic` from
 * bridge + `tokens` from trigger).
 *
 * Group keys on non-claiming layers are dropped rather than merged, so an unusable value cannot
 * silently take the destination away: lodash merges `topic: ''` over a dashboard `topic: 'orders'`,
 * and the resolver would then discard the empty string and find no destination at all.
 *
 * `layers` is ordered low → high precedence. Returns shallow-cloned layers; originals are untouched.
 */
function applyExclusiveKeyGroups(
  layers: readonly Record<string, unknown>[],
  exclusiveKeyGroups: readonly (readonly string[])[]
): Record<string, unknown>[] {
  if (exclusiveKeyGroups.length === 0) {
    return [...layers];
  }

  const result = layers.map((layer) => ({ ...layer }));

  for (const group of exclusiveKeyGroups) {
    let claimed = false;

    for (let i = result.length - 1; i >= 0; i -= 1) {
      const layer = result[i];

      if (!claimed && layerClaimsExclusiveGroup(layer, group)) {
        claimed = true;
        continue;
      }

      for (const key of group) {
        delete layer[key];
      }
    }
  }

  return result;
}

function resolveExclusiveKeyGroups(providerId: string): readonly (readonly string[])[] {
  return getProviderOverrideConfig(providerId)?.exclusiveKeyGroups ?? [];
}

/**
 * Resolves one provider's overrides from lowest to highest precedence: what the bridge or the
 * dashboard persisted for the provider, then for the sending integration, then the workflow-global
 * trigger override, then the step-scoped one.
 *
 * The integration overrides map rides inside the bridge provider entry and is never provider data,
 * so it is stripped from the result whichever layer carried it.
 *
 * When the provider declares exclusive key groups (e.g. FCM routing destinations), the highest layer
 * that sets a usable key in a group evicts all group keys contributed by the other layers before merge.
 */
export function combineProviderOverrides(
  bridgeData: BridgeProviderOverrides | null | undefined,
  overrides: TriggerOverrides | undefined,
  stepId: string | undefined,
  providerId: string,
  integrationIdentifier?: string
): Record<string, unknown> {
  const [providerLayer, integrationLayer, workflowLayer, stepLayer] = resolveOverrideLayers(
    bridgeData,
    overrides,
    stepId,
    providerId,
    integrationIdentifier
  );

  const combined: Record<string, unknown> = mergeWith(
    {},
    providerLayer,
    integrationLayer,
    workflowLayer,
    stepLayer,
    replaceArrays
  );
  delete combined[INTEGRATION_OVERRIDES_OUTPUT_KEY];

  return combined;
}

const INTEGRATION_LAYER_INDEX = 1;

/**
 * True when the sending integration's own override supplies the winning exclusive key group, i.e. it
 * chose the destination rather than a provider-wide or trigger layer. Mirrors
 * `resolveExclusiveRoutingKeys`: a `_passthrough.body` claim on any layer outranks top-level keys.
 */
export function integrationOverrideClaimsExclusiveKeys(
  bridgeData: BridgeProviderOverrides | null | undefined,
  overrides: TriggerOverrides | undefined,
  stepId: string | undefined,
  providerId: string,
  integrationIdentifier: string
): boolean {
  const layers = resolveOverrideLayers(bridgeData, overrides, stepId, providerId, integrationIdentifier);
  const mergedPassthroughBody = mergeWith({}, ...layers.map(readPassthroughBody), replaceArrays);

  return resolveExclusiveKeyGroups(providerId).some((group) => {
    const [passthroughKey] = Object.keys(
      resolveExclusiveRoutingKeys({ _passthrough: { body: mergedPassthroughBody } }, [group])
    );
    const claims = passthroughKey
      ? layers.map((layer) => layerClaimsExclusiveGroup(readPassthroughBody(layer), [passthroughKey]))
      : layers.map((layer) => layerClaimsExclusiveGroup(layer, group));

    return claims.lastIndexOf(true) === INTEGRATION_LAYER_INDEX;
  });
}

function readPassthroughBody(layer: Record<string, unknown>): Record<string, unknown> {
  const body = (layer._passthrough as { body?: unknown } | undefined)?.body;

  return isPlainObject(body) ? (body as Record<string, unknown>) : {};
}

function resolveOverrideLayers(
  bridgeData: BridgeProviderOverrides | null | undefined,
  overrides: TriggerOverrides | undefined,
  stepId: string | undefined,
  providerId: string,
  integrationIdentifier?: string
): Record<string, unknown>[] {
  const { providerOverride, integrationOverrides } = unpackProviderOverrideOutput(bridgeData?.providers?.[providerId]);
  const integrationOverride = integrationIdentifier ? (integrationOverrides[integrationIdentifier] ?? {}) : {};
  const workflowGlobalProviderOverrides = overrides?.providers?.[providerId] || {};
  const stepScopedOverrides = stepId ? overrides?.steps?.[stepId]?.providers?.[providerId] || {} : {};

  return applyExclusiveKeyGroups(
    [providerOverride, integrationOverride, workflowGlobalProviderOverrides, stepScopedOverrides],
    resolveExclusiveKeyGroups(providerId)
  );
}

/**
 * Merges every trigger override shape addressed to one provider, lowest priority first:
 *   1. Deprecated channel bucket:    `overrides.<channel>`
 *   2. Deprecated flat provider key: `overrides.<providerId>`
 *   3. Workflow-wide provider:       `overrides.providers.<providerId>`
 *   4. Step-scoped provider:         `overrides.steps.<stepId>.providers.<providerId>`
 *
 * Use it for fields the worker reads itself (e.g. SMS `to`/`from`, email `cc`) — provider request
 * bodies get the nested shapes through `combineProviderOverrides` instead.
 */
export function mergeTriggerProviderOverrides(
  overrides: TriggerOverrides | undefined,
  channel: string | undefined,
  providerId: string | undefined,
  stepId: string | undefined
): Record<string, unknown> {
  const legacyOverrides = overrides as Record<string, Record<string, unknown> | undefined> | undefined;

  return {
    ...(channel ? legacyOverrides?.[channel] || {} : {}),
    ...(providerId ? legacyOverrides?.[providerId] || {} : {}),
    ...(providerId ? overrides?.providers?.[providerId] || {} : {}),
    ...(providerId && stepId ? overrides?.steps?.[stepId]?.providers?.[providerId] || {} : {}),
  };
}

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
    filterData: IntegrationFilterData;
  }): Promise<IntegrationSelectionResult | undefined> {
    const selection = await this.selectIntegration.execute(SelectIntegrationCommand.create(params));

    if (!selection) {
      return;
    }

    const { integration } = selection;

    if (
      integration.providerId === EmailProviderIdEnum.Novu ||
      integration.providerId === SmsProviderIdEnum.Novu ||
      integration.providerId === ChatProviderIdEnum.Novu
    ) {
      integration.credentials = await this.getNovuProviderCredentials.execute({
        channelType: this.channelType,
        providerId: integration.providerId,
        environmentId: integration._environmentId,
        organizationId: integration._organizationId,
        userId: params.userId,
        recipientEmail: params.recipientEmail,
      });
    }

    return selection;
  }

  protected getIntegrationFilterData(command: SendMessageChannelCommand) {
    return {
      tenant: command.job.tenant,
      payload: command.compileContext?.payload,
      subscriber: command.compileContext?.subscriber,
      context: command.compileContext?.context,
      workflow: buildWorkflowVariablesForJob({
        workflow: command.workflow,
        workflowMetadata: command.job.step.workflowMetadata,
        identifier: command.identifier,
        tags: command.tags,
        severity: command.severity,
      }),
    };
  }

  protected storeContent(): boolean {
    return this.channelType === ChannelTypeEnum.IN_APP || process.env.STORE_NOTIFICATION_CONTENT === 'true';
  }

  /**
   * Payload-dedup write policy for a stored message: when enabled, the payload
   * is not persisted on the message and is resolved from the parent
   * notification at read time. When off, the channel's payload is persisted as
   * before. In-app messages keep their own payload and don't use this.
   */
  protected payloadToPersist<T>(command: SendMessageChannelCommand, payload: T): T | undefined {
    return command.isPayloadDedupEnabled ? undefined : payload;
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
  protected async sendSelectedIntegrationExecution(job: JobEntity, selection: IntegrationSelectionResult) {
    const { integration, matchedConditions } = selection;
    const providerDisplayName = providers.find((el) => el.id === integration.providerId)?.displayName || 'Unknown';
    const details = [
      CreateExecutionDetailsCommand.create({
        ...CreateExecutionDetailsCommand.getDetailsFromJob(job),
        detail: createProviderSelectedMessage(providerDisplayName) as DetailEnum,
        source: ExecutionDetailsSourceEnum.INTERNAL,
        status: ExecutionDetailsStatusEnum.PENDING,
        isTest: false,
        isRetry: false,
        raw: JSON.stringify({
          providerId: integration.providerId,
          identifier: integration.identifier,
          name: integration.name,
          _environmentId: integration._environmentId,
          _id: integration._id,
        }),
      }),
    ];

    if (matchedConditions) {
      details.unshift(
        CreateExecutionDetailsCommand.create({
          ...CreateExecutionDetailsCommand.getDetailsFromJob(job),
          detail: DetailEnum.INTEGRATION_CONDITIONS_MATCHED,
          source: ExecutionDetailsSourceEnum.INTERNAL,
          status: ExecutionDetailsStatusEnum.SUCCESS,
          isTest: false,
          isRetry: false,
          raw: JSON.stringify({
            integrationIdentifier: integration.identifier,
            matchedConditions,
          }),
        })
      );
    }

    await Promise.all(details.map((detail) => this.createExecutionDetailBestEffort(detail)));
  }

  private async createExecutionDetailBestEffort(command: CreateExecutionDetailsCommand): Promise<void> {
    try {
      await this.createExecutionDetails.execute(command);
    } catch (error) {
      Logger.error(error, `Failed to create "${command.detail}" execution detail`, SendMessageBase.name);
    }
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
        if (!this.moduleRef.get(TRANSLATIONS_SERVICE, { strict: false })) {
          throw new PlatformException('Translation module is not loaded');
        }
        const service = this.moduleRef.get(TRANSLATIONS_SERVICE, { strict: false });
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
            format(value, formatting, _lng) {
              if (value && formatting && !Number.isNaN(Date.parse(value))) {
                return format(new Date(value), formatting);
              }

              return String(value ?? '');
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
