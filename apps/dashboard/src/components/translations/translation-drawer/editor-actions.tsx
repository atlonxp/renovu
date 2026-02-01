import { PermissionsEnum } from '@novu/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { RiCheckLine, RiCloseLine, RiFileDownloadLine, RiSparklingLine, RiUploadLine } from 'react-icons/ri';
import { FlagCircle } from '@/components/flag-circle';
import { Button } from '@/components/primitives/button';
import { CopyButton } from '@/components/primitives/copy-button';
import { PermissionButton } from '@/components/primitives/permission-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/primitives/tooltip';
import { TranslationWithPlaceholder } from '@/hooks/use-fetch-translation';
import { useTriggerAutoTranslate } from '@/hooks/use-trigger-auto-translate';
import { TranslationImportTrigger } from '../translation-import-trigger';
import { getLocaleDisplayName } from '../utils';
import { useTranslationFileOperations } from './hooks';

function ActionButton({
  isLoading,
  isSuccess,
  isError,
  disabled,
  onClick,
  icon: Icon,
  children,
  minWidth = 'min-w-[120px]',
}: {
  isLoading?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  minWidth?: string;
}) {
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (isSuccess || isError) {
      setShowResult(true);
      const timer = setTimeout(() => setShowResult(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, isError]);

  return (
    <PermissionButton
      permission={PermissionsEnum.WORKFLOW_WRITE}
      variant="secondary"
      mode="outline"
      size="xs"
      leadingIcon={showResult ? undefined : Icon}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`relative ${minWidth}`}
    >
      <div className="relative">
        {/* Default content - normal layout */}
        <motion.div
          initial={false}
          animate={{
            opacity: showResult ? 0 : 1,
          }}
          transition={{
            duration: 0.15,
            ease: 'easeOut',
          }}
        >
          {children}
        </motion.div>

        {/* Success/Error overlay */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{
                duration: 0.25,
                ease: [0.16, 1, 0.3, 1], // Custom smooth easing
              }}
              className="absolute inset-0 flex items-center justify-center"
            >
              {isSuccess ? (
                <div className="flex items-center gap-1">
                  <RiCheckLine className="size-4 text-green-600" />
                  <span className="text-xs text-green-600">Success!</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <RiCloseLine className="size-4 text-red-600" />
                  <span className="text-xs text-red-600">Failed</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PermissionButton>
  );
}

function UploadButton({
  isUploading,
  uploadSuccess,
  uploadError,
  disabled,
  onClick,
  children,
}: {
  isUploading?: boolean;
  uploadSuccess?: boolean;
  uploadError?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <ActionButton
      isLoading={isUploading}
      isSuccess={uploadSuccess}
      isError={uploadError}
      disabled={disabled}
      onClick={onClick}
      icon={RiFileDownloadLine}
    >
      {children}
    </ActionButton>
  );
}

type EditorActionsProps = {
  selectedTranslation: TranslationWithPlaceholder;
  modifiedContent?: Record<string, unknown> | null;
  isReadOnly?: boolean;
  defaultLocale?: string;
};

export function EditorActions({
  selectedTranslation,
  modifiedContent,
  isReadOnly = false,
  defaultLocale,
}: EditorActionsProps) {
  const { handleDownload } = useTranslationFileOperations();
  const translateMutation = useTriggerAutoTranslate();

  const selectedLocale = selectedTranslation.locale;
  const displayName = getLocaleDisplayName(selectedLocale);

  // Use modified content if available, otherwise use translation content
  const content = modifiedContent || selectedTranslation.content || {};
  const contentToCopy = JSON.stringify(content, null, 2);

  // Create resource object from translation data
  const resource = {
    resourceId: selectedTranslation.resourceId,
    resourceType: selectedTranslation.resourceType,
  };

  // Check if this is a translatable locale (not the default/source locale)
  const isTranslatableLocale = defaultLocale ? selectedLocale !== defaultLocale : true;

  const handleTranslate = () => {
    translateMutation.mutate({
      resourceId: selectedTranslation.resourceId,
      resourceType: selectedTranslation.resourceType,
      targetLocales: [selectedLocale],
    });
  };

  return (
    <>
      <div className="flex flex-col items-start gap-6 self-stretch px-3 pb-3 pt-3">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <FlagCircle locale={selectedLocale} size="md" />
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-neutral-600">{selectedLocale}</span>
              <span className="text-sm text-neutral-400">({displayName})</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isTranslatableLocale && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <ActionButton
                      isLoading={translateMutation.isPending}
                      isSuccess={translateMutation.isSuccess}
                      isError={translateMutation.isError}
                      disabled={isReadOnly}
                      onClick={handleTranslate}
                      icon={RiSparklingLine}
                      minWidth="min-w-[90px]"
                    >
                      Translate
                    </ActionButton>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Auto-translate this locale using AI</TooltipContent>
              </Tooltip>
            )}
            <TranslationImportTrigger resource={resource}>
              <UploadButton disabled={isReadOnly}>Import translation(s)</UploadButton>
            </TranslationImportTrigger>
          </div>
        </div>

        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-medium text-neutral-900">Translation JSON</span>
          <div className="flex items-center gap-1">
            <CopyButton
              valueToCopy={contentToCopy}
              size="xs"
              className="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  mode="outline"
                  size="xs"
                  className="px-2 py-1.5"
                  onClick={() => handleDownload(selectedLocale, content)}
                >
                  <RiUploadLine className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export translation JSON</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </>
  );
}
