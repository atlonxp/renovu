import { Injectable } from '@nestjs/common';
import {
  buildContextSchema,
  buildSubscriberSchema,
  ControlValueSanitizerService,
  CreateVariablesObject,
  CreateVariablesObjectCommand,
  EmailControlType,
  GetLayoutCommand,
  GetLayoutUseCase,
  InstrumentUsecase,
  LayoutControlType,
  PayloadMergerService,
  PlatformException,
  PreviewPayloadProcessorService,
  PreviewStep,
  PreviewStepCommand,
  resolveEnvironmentVariables,
} from '@novu/application-generic';
import { EnvironmentRepository, EnvironmentVariableRepository, JsonSchemaTypeEnum } from '@novu/dal';
import { ContextResolved } from '@novu/framework/internal';
import {
  ChannelTypeEnum,
  EnvironmentSystemVariables,
  LAYOUT_PREVIEW_EMAIL_STEP,
  LAYOUT_PREVIEW_WORKFLOW_ID,
  LayoutContainerConfig,
  ResourceOriginEnum,
} from '@novu/shared';
import { GenerateLayoutPreviewResponseDto } from '../../dtos/generate-layout-preview-response.dto';
import { PreviewLayoutCommand } from './preview-layout.command';
import { enhanceBodyForPreview } from './preview-utils';

@Injectable()
export class PreviewLayoutUsecase {
  constructor(
    private getLayoutUseCase: GetLayoutUseCase,
    private createVariablesObject: CreateVariablesObject,
    private controlValueSanitizer: ControlValueSanitizerService,
    private payloadProcessor: PreviewPayloadProcessorService,
    private payloadMerger: PayloadMergerService,
    private previewStepUsecase: PreviewStep,
    private readonly environmentVariableRepository: EnvironmentVariableRepository,
    private readonly environmentRepository: EnvironmentRepository
  ) {}

  @InstrumentUsecase()
  async execute(command: PreviewLayoutCommand): Promise<GenerateLayoutPreviewResponseDto> {
    const layout = await this.getLayoutUseCase.execute(
      GetLayoutCommand.create({
        layoutIdOrInternalId: command.layoutIdOrInternalId,
        environmentId: command.user.environmentId,
        organizationId: command.user.organizationId,
        userId: command.user._id,
      })
    );

    try {
      const controlValues = command.layoutPreviewRequestDto.controlValues || layout.controls.values || {};
      const variableSchema = layout.variables ?? {};

      // extract all variables from the control values and build the variables object
      const variablesObject = await this.createVariablesObject.execute(
        CreateVariablesObjectCommand.create({
          environmentId: command.user.environmentId,
          organizationId: command.user.organizationId,
          controlValues: Object.values(controlValues.email ?? {}),
          variableSchema,
        })
      );

      const sanitizedControls = this.controlValueSanitizer.sanitizeControlsForPreview(
        controlValues as Record<string, unknown>,
        'layout',
        ResourceOriginEnum.NOVU_CLOUD
      );

      const { previewTemplateData } = this.controlValueSanitizer.processControlValues(
        sanitizedControls,
        variableSchema,
        variablesObject
      );

      const payloadExample = await this.payloadMerger.mergePayloadExample({
        payloadExample: previewTemplateData.payloadExample,
        userPayloadExample: command.layoutPreviewRequestDto.previewPayload,
        user: command.user,
      });

      const cleanedPayloadExample = this.payloadProcessor.cleanPreviewExamplePayload(payloadExample);

      const { email } = previewTemplateData.controlValues as LayoutControlType;
      const editorType = email?.editorType ?? 'block';
      const body = email?.body ?? (editorType === 'block' ? '{}' : '');

      const [rawEnvVars, environmentEntity] = await Promise.all([
        this.environmentVariableRepository.findByEnvironment(command.user.organizationId, command.user.environmentId),
        this.environmentRepository.findByIdAndOrganization(command.user.environmentId, command.user.organizationId),
      ]);

      if (!environmentEntity) throw new PlatformException('EnvironmentEntity not found');

      const environmentSystemVars: EnvironmentSystemVariables = {
        name: environmentEntity.name,
        type: environmentEntity.type,
      };

      const envVars = {
        ...resolveEnvironmentVariables(rawEnvVars),
        ...environmentSystemVars,
      };

      const executeOutput = await this.previewStepUsecase.execute(
        PreviewStepCommand.create({
          payload: (cleanedPayloadExample.payload ?? {}) as Record<string, unknown>,
          subscriber: cleanedPayloadExample.subscriber ?? {},
          context: (cleanedPayloadExample.context ?? {}) as ContextResolved,
          // mapping the email layout controls to the email step controls
          controls: {
            subject: 'email-layout-preview',
            body: enhanceBodyForPreview(editorType, body),
            editorType,
          } as EmailControlType,
          environmentId: command.user.environmentId,
          organizationId: command.user.organizationId,
          stepId: LAYOUT_PREVIEW_EMAIL_STEP,
          userId: command.user._id,
          workflowId: LAYOUT_PREVIEW_WORKFLOW_ID,
          workflowOrigin: ResourceOriginEnum.NOVU_CLOUD,
          layoutId: layout.layoutId,
          state: [],
          env: envVars,
        })
      );

      const { body: previewBody } = executeOutput.outputs as any;

      // Use raw form-supplied container so unsaved edits show up in live preview.
      // The sanitizer pipeline strips optional fields under some conditions; reading
      // from the raw command payload guarantees the user's in-flight values reach here.
      const rawContainer =
        (command.layoutPreviewRequestDto.controlValues as { email?: { container?: LayoutContainerConfig } })?.email
          ?.container ?? email?.container;
      const wrappedBody = wrapWithLayoutContainer(previewBody, rawContainer);

      // Generate schema from the preview payload example
      const schema = {
        type: JsonSchemaTypeEnum.OBJECT,
        properties: {
          subscriber: buildSubscriberSchema(payloadExample.subscriber),
          context: buildContextSchema(payloadExample.context),
        },
      };

      return {
        result: {
          preview: { body: wrappedBody },
          type: ChannelTypeEnum.EMAIL,
        },
        previewPayloadExample: payloadExample,
        schema,
      };
    } catch (error) {
      /*
       * If preview execution fails, still return valid schema and payload example
       * but with an empty preview result
       */
      return {
        result: {
          type: ChannelTypeEnum.EMAIL,
        },
        previewPayloadExample: {},
        schema: null,
      };
    }
  }
}

// Mirrors maily-render's getContainerStyle so the preview reflects the same
// container chrome the recipient will see on a real send.
function wrapWithLayoutContainer(body: string, container?: LayoutContainerConfig): string {
  const maxWidth = container?.maxWidth ?? '600px';
  const align = container?.align ?? 'center';
  const padding = container?.padding ?? '1rem';
  const backgroundColor = container?.backgroundColor;

  let marginLeft = 'auto';
  let marginRight = 'auto';
  if (align === 'left') marginLeft = '0';
  if (align === 'right') marginRight = '0';

  // For pixel widths lock the canvas to that exact width so editor and preview
  // render at the same size. For fluid widths (100% etc.) fill the pane truly
  // so no whitespace is wasted; the recipient also sees the same fluid behavior.
  const trimmed = maxWidth.trim();
  const isFixedPxWidth = /\d+px$/.test(trimmed);

  const widthParts = isFixedPxWidth
    ? [`width:${trimmed}`, `max-width:${trimmed}`, 'flex-shrink:0']
    : [`max-width:${trimmed}`, 'width:100%'];

  const styleParts = [
    ...widthParts,
    'min-width:300px',
    `margin-left:${marginLeft}`,
    `margin-right:${marginRight}`,
    `padding:${padding}`,
    'box-sizing:border-box',
    backgroundColor ? `background-color:${backgroundColor}` : '',
  ].filter(Boolean);

  return `<div style="${styleParts.join(';')}">${body}</div>`;
}
