import { Injectable } from '@nestjs/common';
import {
  BuildStepIssuesUsecase,
  GetWorkflowUseCase,
  GetWorkflowWithPreferencesUseCase,
  Instrument,
  InstrumentUsecase,
  PinoLogger,
  SendWebhookMessage,
  stepTypeToControlSchema,
  WorkflowResponseDto,
  WorkflowWithPreferencesResponseDto,
} from '@novu/application-generic';
import { LocalizationResourceEnum, NotificationTemplateEntity, NotificationTemplateRepository } from '@novu/dal';
import { UserSessionData, WebhookEventEnum, WebhookObjectTypeEnum, WorkflowStatusEnum } from '@novu/shared';
import {
  AutoTranslate,
  LocalizationResourceEnum as TranslationResourceEnum,
  ManageTranslations,
} from '@novu/translation';
import { PatchWorkflowCommand } from './patch-workflow.command';

@Injectable()
export class PatchWorkflowUsecase {
  constructor(
    private getWorkflowWithPreferencesUseCase: GetWorkflowWithPreferencesUseCase,
    private notificationTemplateRepository: NotificationTemplateRepository,
    private getWorkflowUseCase: GetWorkflowUseCase,
    private buildStepIssuesUsecase: BuildStepIssuesUsecase,
    private manageTranslations: ManageTranslations,
    private autoTranslate: AutoTranslate,
    private logger: PinoLogger,
    private sendWebhookMessage: SendWebhookMessage
  ) {
    this.logger.setContext(this.constructor.name);
  }

  @InstrumentUsecase()
  async execute(command: PatchWorkflowCommand): Promise<WorkflowResponseDto> {
    const persistedWorkflow = await this.fetchWorkflow(command);

    const transientWorkflow = this.patchWorkflowFields(persistedWorkflow, command);

    const hasPayloadSchemaChanged = this.hasPayloadSchemaChanged(persistedWorkflow, command);

    if (hasPayloadSchemaChanged) {
      await this.recalculateStepIssues(transientWorkflow, command.user);
    }

    if (command.isTranslationEnabled !== undefined) {
      await this.toggleV2TranslationsForWorkflow(
        persistedWorkflow.triggers[0].identifier,
        persistedWorkflow._id,
        persistedWorkflow.name,
        command,
        persistedWorkflow as NotificationTemplateEntity
      );
    }

    await this.persistWorkflow(transientWorkflow, command.user);

    const updatedWorkflow = await this.getWorkflowUseCase.execute({
      workflowIdOrInternalId: command.workflowIdOrInternalId,
      user: command.user,
    });

    await this.sendWebhookMessage.execute({
      eventType: WebhookEventEnum.WORKFLOW_UPDATED,
      objectType: WebhookObjectTypeEnum.WORKFLOW,
      payload: {
        object: updatedWorkflow as unknown as Record<string, unknown>,
        previousObject: persistedWorkflow as unknown as Record<string, unknown>,
      },
      organizationId: command.user.organizationId,
      environmentId: command.user.environmentId,
    });

    return updatedWorkflow;
  }

  private hasPayloadSchemaChanged(
    persistedWorkflow: NotificationTemplateEntity,
    command: PatchWorkflowCommand
  ): boolean {
    return (
      command.payloadSchema !== undefined &&
      command.payloadSchema !== null &&
      JSON.stringify(persistedWorkflow.payloadSchema) !== JSON.stringify(command.payloadSchema)
    );
  }

  @Instrument()
  private async recalculateStepIssues(
    workflow: NotificationTemplateEntity,
    userSessionData: UserSessionData
  ): Promise<void> {
    for (const step of workflow.steps) {
      if (!step._templateId || !step.template?.type) continue;

      const controlSchemas = step.template?.controls || stepTypeToControlSchema[step.template.type];

      const stepIssues = await this.buildStepIssuesUsecase.execute({
        workflowOrigin: workflow.origin!,
        user: userSessionData,
        stepInternalId: step._templateId,
        workflow,
        controlSchema: controlSchemas.schema,
        stepType: step.template.type,
      });

      step.issues = stepIssues;
    }
  }

  private patchWorkflowFields(
    persistedWorkflow: NotificationTemplateEntity,
    command: PatchWorkflowCommand
  ): NotificationTemplateEntity {
    const transientWorkflow = { ...persistedWorkflow };
    if (command.active !== undefined && command.active !== null) {
      transientWorkflow.active = command.active;
    }

    if (command.payloadSchema !== undefined && command.payloadSchema !== null) {
      transientWorkflow.payloadSchema = command.payloadSchema;
    }

    if (command.validatePayload !== undefined && command.validatePayload !== null) {
      transientWorkflow.validatePayload = command.validatePayload;
    }

    if (command.name !== undefined && command.name !== null) {
      transientWorkflow.name = command.name;
    }

    if (command.description !== undefined && command.description !== null) {
      transientWorkflow.description = command.description;
    }

    if (command.tags !== undefined && command.tags !== null) {
      transientWorkflow.tags = command.tags;
    }

    if (command.active !== undefined && command.active !== null) {
      transientWorkflow.status = command.active ? WorkflowStatusEnum.ACTIVE : WorkflowStatusEnum.INACTIVE;
    }

    if (command.isTranslationEnabled !== undefined && command.isTranslationEnabled !== null) {
      transientWorkflow.isTranslationEnabled = command.isTranslationEnabled;
    }

    return transientWorkflow;
  }

  private async persistWorkflow(workflowWithIssues: NotificationTemplateEntity, userSessionData: UserSessionData) {
    await this.notificationTemplateRepository.update(
      {
        _id: workflowWithIssues._id,
        _environmentId: userSessionData.environmentId,
      },
      {
        $set: {
          active: workflowWithIssues.active,
          name: workflowWithIssues.name,
          description: workflowWithIssues.description,
          tags: workflowWithIssues.tags,
          status: workflowWithIssues.status,
          payloadSchema: workflowWithIssues.payloadSchema,
          validatePayload: workflowWithIssues.validatePayload,
          isTranslationEnabled: workflowWithIssues.isTranslationEnabled,
          steps: workflowWithIssues.steps,
          issues: workflowWithIssues.issues,
        },
      }
    );
  }

  private async fetchWorkflow(command: PatchWorkflowCommand): Promise<WorkflowWithPreferencesResponseDto> {
    return await this.getWorkflowWithPreferencesUseCase.execute({
      workflowIdOrInternalId: command.workflowIdOrInternalId,
      environmentId: command.user.environmentId,
      organizationId: command.user.organizationId,
      session: command.session,
    });
  }

  private async toggleV2TranslationsForWorkflow(
    workflowIdentifier: string,
    workflowInternalId: string,
    workflowName: string,
    command: PatchWorkflowCommand,
    workflowEntity?: NotificationTemplateEntity
  ) {
    try {
      const result = await this.manageTranslations.execute({
        enabled: command.isTranslationEnabled ?? false,
        resourceId: workflowIdentifier,
        resourceInternalId: workflowInternalId,
        resourceName: workflowName,
        resourceType: LocalizationResourceEnum.WORKFLOW,
        organizationId: command.user.organizationId,
        environmentId: command.user.environmentId,
        userId: command.user._id,
        session: command.session,
        // Pass workflow entity for content extraction when enabling translations
        resourceEntity: command.isTranslationEnabled && workflowEntity
          ? (workflowEntity as unknown as Record<string, unknown>)
          : undefined,
      });

      // Trigger auto-translation when translations are first enabled or re-enabled with missing locales
      if (result.shouldAutoTranslate && result.extractedContent && Object.keys(result.extractedContent).length > 0) {
        this.logger.info(
          `Triggering auto-translation for workflow ${workflowIdentifier}`,
          {
            workflowIdentifier,
            workflowInternalId,
            contentKeys: Object.keys(result.extractedContent).length,
            organizationId: command.user.organizationId,
          }
        );

        const translateResult = await this.autoTranslate.execute({
          resourceId: workflowIdentifier,
          resourceInternalId: workflowInternalId,
          resourceType: TranslationResourceEnum.WORKFLOW,
          organizationId: command.user.organizationId,
          environmentId: command.user.environmentId,
          userId: command.user._id,
          sourceContent: result.extractedContent,
          session: command.session,
        });

        this.logger.info(
          `Auto-translation completed for workflow ${workflowIdentifier}`,
          {
            workflowIdentifier,
            success: translateResult.success,
            successfulLocales: translateResult.metadata.successfulLocales,
            failedLocales: translateResult.metadata.failedLocales,
            totalLatencyMs: translateResult.metadata.totalLatencyMs,
          }
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to ${command.isTranslationEnabled ? 'enable' : 'disable'} V2 translations for workflow`,
        {
          workflowIdentifier,
          workflowInternalId,
          enabled: command.isTranslationEnabled,
          organizationId: command.user.organizationId,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      throw error;
    }
  }
}
