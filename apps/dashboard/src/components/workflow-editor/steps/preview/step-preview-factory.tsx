import { ResourceOriginEnum, StepTypeEnum } from '@novu/shared';
import { memo } from 'react';
import { InlineToast } from '@/components/primitives/inline-toast';
import { ChatPreview } from '@/components/workflow-editor/steps/chat/chat-preview';
import { useStepEditor } from '@/components/workflow-editor/steps/context/step-editor-context';
import { InboxPreview } from '@/components/workflow-editor/steps/in-app/inbox-preview';
import { PushPreview } from '@/components/workflow-editor/steps/push/push-preview';
import { SmsPreview } from '@/components/workflow-editor/steps/sms/sms-preview';
import { useTranslatedPreview } from '@/hooks/use-translated-preview';
import { STEP_TYPE_LABELS } from '@/utils/constants';
import { EmailCorePreview } from './previews/email-preview-wrapper';

const NoPreviewAvailable = memo(({ stepType }: { stepType: StepTypeEnum }) => {
  return (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Preview not implemented for {STEP_TYPE_LABELS[stepType]} steps
    </div>
  );
});

const MobilePreviewWrapper = memo(({ children, description }: { children: React.ReactNode; description: string }) => {
  return (
    <div className="flex flex-col items-center justify-center">
      {children}
      <InlineToast description={description} className="w-full px-3" />
    </div>
  );
});

export function StepPreviewFactory() {
  const { step, workflow, previewData, isInitialLoad, controlValues, selectedLocale } = useStepEditor();

  // Apply translations to preview data based on selected locale
  const { translatedPreviewData, isTranslationLoading } = useTranslatedPreview({
    previewData,
    selectedLocale,
    workflowId: workflow.workflowId,
    stepId: step.stepId,
  });

  const commonProps = {
    previewData: translatedPreviewData ?? undefined,
    isPreviewPending: isInitialLoad || isTranslationLoading,
  };

  const mobilePreviewDescription =
    'This preview shows how your message will appear on mobile. Actual rendering may vary by device.';

  switch (step.type) {
    case StepTypeEnum.EMAIL:
      return (
        <EmailCorePreview
          {...commonProps}
          isCustomHtmlEditor={controlValues?.editorType === 'html'}
          resourceOrigin={step.origin ?? ResourceOriginEnum.NOVU_CLOUD}
        />
      );

    case StepTypeEnum.IN_APP:
      return <InboxPreview {...commonProps} />;

    case StepTypeEnum.SMS:
      return (
        <MobilePreviewWrapper description={mobilePreviewDescription}>
          <SmsPreview {...commonProps} />
        </MobilePreviewWrapper>
      );

    case StepTypeEnum.PUSH:
      return (
        <MobilePreviewWrapper description={mobilePreviewDescription}>
          <PushPreview {...commonProps} />
        </MobilePreviewWrapper>
      );

    case StepTypeEnum.CHAT:
      return <ChatPreview {...commonProps} />;

    default:
      return <NoPreviewAvailable stepType={step.type} />;
  }
}
