import { Injectable, Logger } from "@nestjs/common";
import { StepTypeEnum } from "@novu/shared";

/**
 * Extracted translatable content from a workflow
 * Key format: 'step.<stepId>.<field>'
 */
export type ExtractedContent = Record<string, string>;

/**
 * Step template interface matching MessageTemplateEntity structure
 */
interface StepTemplate {
	_id?: string;
	type: StepTypeEnum;
	content?: string | unknown[];
	subject?: string;
	title?: string;
	preheader?: string;
	senderName?: string;
}

/**
 * Control variables for V2 workflows (novu-cloud origin, BRIDGE type)
 * These are used instead of template fields for newer workflow format
 */
interface ControlVariables {
	subject?: string;
	body?: string;
	title?: string;
	preheader?: string;
	senderName?: string;
	primaryAction?: { label?: string };
	secondaryAction?: { label?: string };
}

/**
 * Step interface matching NotificationStepEntity structure
 */
interface WorkflowStep {
	_id?: string;
	uuid?: string;
	stepId?: string;
	name?: string;
	_templateId?: string;
	template?: StepTemplate;
	// V2 workflows store content in controlVariables
	controlVariables?: ControlVariables;
}

/**
 * Workflow interface matching NotificationTemplateEntity structure
 */
interface WorkflowEntity {
	_id?: string;
	name?: string;
	steps?: WorkflowStep[];
}

/**
 * ContentExtractorService extracts translatable content from workflow steps
 *
 * This service is used when enabling translations to extract the source content
 * from workflow message templates. The extracted content is stored in the default
 * locale's Localization record.
 *
 * Supported channel types and their translatable fields:
 * - Email: subject, body (content), preheader, senderName
 * - SMS: body (content)
 * - Push: subject, body (content)
 * - In-App: subject, body (content), title
 * - Chat: body (content)
 *
 * @example
 * ```typescript
 * const content = extractor.extractFromWorkflow(workflow);
 * // Returns:
 * // {
 * //   'step.email-step.subject': 'Welcome to {{company}}!',
 * //   'step.email-step.body': '<p>Hello {{name}},</p>',
 * //   'step.sms-step.body': 'Hi {{name}}, thanks for joining!',
 * // }
 * ```
 */
@Injectable()
export class ContentExtractorService {
	private readonly logger = new Logger(ContentExtractorService.name);

	/**
	 * Extract translatable content from a workflow entity
	 *
	 * @param workflow - The workflow entity with populated steps
	 * @returns Record of translatable content keyed by step and field
	 */
	extractFromWorkflow(workflow: WorkflowEntity): ExtractedContent {
		const content: ExtractedContent = {};

		if (!workflow.steps || workflow.steps.length === 0) {
			this.logger.debug(
				`No steps found in workflow ${workflow._id || "unknown"}`,
			);
			return content;
		}

		for (const step of workflow.steps) {
			const stepContent = this.extractFromStep(step);
			Object.assign(content, stepContent);
		}

		this.logger.debug(
			`Extracted ${Object.keys(content).length} translatable fields from workflow ${workflow._id || "unknown"}`,
		);

		return content;
	}

	/**
	 * Extract translatable content from a single step
	 *
	 * Supports both V1 (template fields) and V2 (controlVariables) workflow formats
	 */
	private extractFromStep(step: WorkflowStep): ExtractedContent {
		const content: ExtractedContent = {};
		const stepId = step.stepId || step.uuid || step._id || "unknown";

		// First try to extract from controlVariables (V2 workflows)
		if (step.controlVariables) {
			this.extractFromControlVariables(stepId, step.controlVariables, content);
		}

		// Then try to extract from template (V1 workflows)
		if (step.template) {
			const template = step.template;

			// Extract based on channel type
			switch (template.type) {
				case StepTypeEnum.EMAIL:
					this.extractEmailContent(stepId, template, content);
					break;
				case StepTypeEnum.SMS:
					this.extractSmsContent(stepId, template, content);
					break;
				case StepTypeEnum.PUSH:
					this.extractPushContent(stepId, template, content);
					break;
				case StepTypeEnum.IN_APP:
					this.extractInAppContent(stepId, template, content);
					break;
				case StepTypeEnum.CHAT:
					this.extractChatContent(stepId, template, content);
					break;
				default:
					// Non-channel steps (delay, digest, etc.) have no translatable content
					break;
			}
		}

		if (Object.keys(content).length === 0) {
			this.logger.debug(
				`No translatable content found for step ${stepId}`,
			);
		}

		return content;
	}

	/**
	 * Extract translatable content from V2 controlVariables
	 */
	private extractFromControlVariables(
		stepId: string,
		controls: ControlVariables,
		content: ExtractedContent,
	): void {
		if (controls.subject) {
			content[`step.${stepId}.subject`] = controls.subject;
		}

		if (controls.body) {
			content[`step.${stepId}.body`] = controls.body;
		}

		if (controls.title) {
			content[`step.${stepId}.title`] = controls.title;
		}

		if (controls.preheader) {
			content[`step.${stepId}.preheader`] = controls.preheader;
		}

		if (controls.senderName) {
			content[`step.${stepId}.senderName`] = controls.senderName;
		}

		if (controls.primaryAction?.label) {
			content[`step.${stepId}.primaryAction.label`] =
				controls.primaryAction.label;
		}

		if (controls.secondaryAction?.label) {
			content[`step.${stepId}.secondaryAction.label`] =
				controls.secondaryAction.label;
		}
	}

	/**
	 * Extract translatable content from email step
	 */
	private extractEmailContent(
		stepId: string,
		template: StepTemplate,
		content: ExtractedContent,
	): void {
		if (template.subject) {
			content[`step.${stepId}.subject`] = template.subject;
		}

		const body = this.normalizeContent(template.content);
		if (body) {
			content[`step.${stepId}.body`] = body;
		}

		if (template.preheader) {
			content[`step.${stepId}.preheader`] = template.preheader;
		}

		if (template.senderName) {
			content[`step.${stepId}.senderName`] = template.senderName;
		}
	}

	/**
	 * Extract translatable content from SMS step
	 */
	private extractSmsContent(
		stepId: string,
		template: StepTemplate,
		content: ExtractedContent,
	): void {
		const body = this.normalizeContent(template.content);
		if (body) {
			content[`step.${stepId}.body`] = body;
		}
	}

	/**
	 * Extract translatable content from push step
	 */
	private extractPushContent(
		stepId: string,
		template: StepTemplate,
		content: ExtractedContent,
	): void {
		if (template.subject) {
			content[`step.${stepId}.subject`] = template.subject;
		}

		const body = this.normalizeContent(template.content);
		if (body) {
			content[`step.${stepId}.body`] = body;
		}
	}

	/**
	 * Extract translatable content from in-app step
	 */
	private extractInAppContent(
		stepId: string,
		template: StepTemplate,
		content: ExtractedContent,
	): void {
		if (template.subject) {
			content[`step.${stepId}.subject`] = template.subject;
		}

		if (template.title) {
			content[`step.${stepId}.title`] = template.title;
		}

		const body = this.normalizeContent(template.content);
		if (body) {
			content[`step.${stepId}.body`] = body;
		}
	}

	/**
	 * Extract translatable content from chat step
	 */
	private extractChatContent(
		stepId: string,
		template: StepTemplate,
		content: ExtractedContent,
	): void {
		const body = this.normalizeContent(template.content);
		if (body) {
			content[`step.${stepId}.body`] = body;
		}
	}

	/**
	 * Normalize content to string format
	 *
	 * Content can be either a string (most channels) or an array of blocks (rich email editor)
	 */
	private normalizeContent(content: string | unknown[] | undefined): string {
		if (!content) {
			return "";
		}

		if (typeof content === "string") {
			return content;
		}

		// For block-based content (rich email editor), serialize to JSON
		// The translation service should handle this format
		if (Array.isArray(content)) {
			return JSON.stringify(content);
		}

		return "";
	}
}
