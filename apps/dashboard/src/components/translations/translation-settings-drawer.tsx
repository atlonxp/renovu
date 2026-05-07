import { DEFAULT_LOCALE, EnvironmentTypeEnum, PermissionsEnum } from '@novu/shared';
import { forwardRef, useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { RiExternalLinkLine, RiSettings4Line } from 'react-icons/ri';
import { LocaleAliasesDialog } from './locale-aliases-dialog';
import { Button } from '@/components/primitives/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormRoot } from '@/components/primitives/form/form';
import { InlineToast } from '@/components/primitives/inline-toast';
import { LocaleSelect } from '@/components/primitives/locale-select';
import { Sheet, SheetContent, SheetTitle } from '@/components/primitives/sheet';
import { Skeleton } from '@/components/primitives/skeleton';
import { showSuccessToast } from '@/components/primitives/sonner-helpers';
import { IS_SELF_HOSTED } from '@/config';
import { useEnvironment } from '@/context/environment/hooks';
import { useAiSettings } from '@/hooks/use-ai-settings';
import { useCombinedRefs } from '@/hooks/use-combined-refs';
import { useFormProtection } from '@/hooks/use-form-protection';
import { useHasPermission } from '@/hooks/use-has-permission';
import { useTranslationSettings } from '@/hooks/use-translation-settings';
import { useUpdateTranslationSettings } from '@/hooks/use-update-translation-settings';
import { ROUTES } from '@/utils/routes';
import { PermissionButton } from '../primitives/permission-button';

interface TranslationSettingsFormData {
  defaultLocale: string;
  targetLocales: string[];
  localeAliases: Record<string, string>;
}

interface TranslationSettingsDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const TranslationSettingsDrawer = forwardRef<HTMLDivElement, TranslationSettingsDrawerProps>(
  ({ isOpen, onOpenChange }, forwardedRef) => {
    const has = useHasPermission();
    const { currentEnvironment } = useEnvironment();
    const canWrite = has({ permission: PermissionsEnum.WORKFLOW_WRITE });
    const isDevEnvironment = currentEnvironment?.type === EnvironmentTypeEnum.DEV;
    // For self-hosted (ReNovu), allow editing in any environment since there's no strict dev/prod promotion workflow
    const isReadOnly = !canWrite || (!IS_SELF_HOSTED && !isDevEnvironment);

    const { data: translationSettings, isLoading, refetch } = useTranslationSettings();
    const { data: aiSettings } = useAiSettings();
    const updateSettings = useUpdateTranslationSettings();

    const [isLocaleAliasesOpen, setIsLocaleAliasesOpen] = useState(false);

    const {
      protectedOnValueChange,
      ProtectionAlert,
      ref: protectionRef,
    } = useFormProtection({
      onValueChange: onOpenChange,
    });

    const combinedRef = useCombinedRefs(forwardedRef, protectionRef);

    const form = useForm<TranslationSettingsFormData>({
      defaultValues: {
        defaultLocale: DEFAULT_LOCALE,
        targetLocales: [],
        localeAliases: {},
      },
    });

    const { reset } = form;

    useEffect(() => {
      if (translationSettings) {
        reset({
          defaultLocale: translationSettings.defaultLocale || DEFAULT_LOCALE,
          targetLocales: translationSettings.targetLocales || [],
          localeAliases: translationSettings.localeAliases || {},
        });
      }
    }, [translationSettings, reset]);

    const handleSave = useCallback(async () => {
      const formValues = form.getValues();

      if (isReadOnly) return;

      try {
        await updateSettings.mutateAsync({
          defaultLocale: formValues.defaultLocale,
          targetLocales: formValues.targetLocales,
          localeAliases: formValues.localeAliases,
        });

        showSuccessToast('Translation settings updated successfully');
        refetch();
        onOpenChange(false);
      } catch {
        // Error toast already shown by the mutation
      }
    }, [form, updateSettings, isReadOnly, refetch, onOpenChange]);

    const aiKeyConfigured = Boolean(aiSettings?.hasApiKey);

    return (
      <>
        <Sheet open={isOpen} onOpenChange={protectedOnValueChange}>
          <SheetContent ref={combinedRef} side="right" className="w-[500px] max-w-none!">
            <div className="flex h-full flex-col">
              <header className="border-bg-soft flex h-12 w-full flex-row items-center gap-3 border-b px-3 py-4">
                <div className="flex flex-1 items-center gap-2 overflow-hidden text-sm font-medium">
                  <RiSettings4Line className="h-4 w-4 text-neutral-600" />
                  <SheetTitle className="flex-1 truncate pr-10 text-sm font-medium text-neutral-950">
                    Configure translation settings
                  </SheetTitle>
                </div>
              </header>

              <div className="flex-1 overflow-auto p-3.5">
                {!IS_SELF_HOSTED && !isDevEnvironment && (
                  <div className="mb-6">
                    <InlineToast
                      variant="warning"
                      title="View-only mode"
                      description="Edit translation settings in your development environment."
                    />
                  </div>
                )}

                <div className="mb-6">
                  {aiKeyConfigured ? (
                    <InlineToast
                      variant="info"
                      title="AI provider configured"
                      description={
                        <span>
                          Manage the API key and model in{' '}
                          <Link to={ROUTES.SETTINGS_AI} className="underline">
                            Settings → AI
                          </Link>
                          .
                        </span>
                      }
                    />
                  ) : (
                    <InlineToast
                      variant="error"
                      title="AI provider not configured"
                      description={
                        <span>
                          Translations need this to work. Configure it in{' '}
                          <Link to={ROUTES.SETTINGS_AI} className="underline">
                            Settings → AI
                          </Link>
                          .
                        </span>
                      }
                    />
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    {isLoading ? (
                      <div className="space-y-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                      </div>
                    ) : (
                      <Form {...form}>
                        <FormRoot className="space-y-6">
                          <div className="space-y-4">
                            <h3 className="text-text-strong text-sm font-medium">Locale Settings</h3>

                            <FormField
                              control={form.control}
                              name="defaultLocale"
                              render={({ field }) => (
                                <FormItem className="space-y-1">
                                  <FormLabel
                                    className="text-text-sub gap-1"
                                    tooltip="The primary language for your translations - serves as fallback when language specific translations are not available"
                                  >
                                    Default language
                                  </FormLabel>
                                  <FormControl>
                                    <LocaleSelect
                                      value={field.value}
                                      onChange={field.onChange}
                                      className="w-full"
                                      disabled={isReadOnly}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="targetLocales"
                              render={({ field }) => (
                                <FormItem className="space-y-1">
                                  <FormLabel
                                    className="text-text-sub gap-1"
                                    tooltip="Languages you want to translate into. We'll check if they're in sync with your default language."
                                  >
                                    Target languages
                                  </FormLabel>
                                  <FormControl>
                                    <LocaleSelect
                                      value={field.value}
                                      onChange={field.onChange}
                                      className="w-full"
                                      multiSelect={true}
                                      disabled={isReadOnly}
                                    />
                                  </FormControl>
                                  <span className="text-text-soft text-2xs">
                                    Select all languages you want to translate into
                                  </span>
                                </FormItem>
                              )}
                            />

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-text-sub text-xs font-medium">Locale Aliases</span>
                                  <p className="text-text-soft text-2xs">
                                    Map external locale codes to your target locales (e.g., zh-hans → zh_CN)
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  mode="outline"
                                  size="xs"
                                  onClick={() => setIsLocaleAliasesOpen(true)}
                                >
                                  <RiExternalLinkLine className="mr-1.5 size-3" />
                                  Configure
                                </Button>
                              </div>
                              {Object.keys(form.watch('localeAliases') || {}).length > 0 && (
                                <div className="text-text-soft text-2xs">
                                  {Object.keys(form.watch('localeAliases') || {}).length} custom alias
                                  {Object.keys(form.watch('localeAliases') || {}).length === 1 ? '' : 'es'} configured
                                </div>
                              )}
                            </div>
                          </div>
                        </FormRoot>
                      </Form>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-auto">
                <div className="flex justify-end gap-3 p-3.5">
                  <PermissionButton
                    permission={PermissionsEnum.WORKFLOW_WRITE}
                    variant="secondary"
                    onClick={handleSave}
                    disabled={updateSettings.isPending || isReadOnly}
                    isLoading={updateSettings.isPending}
                  >
                    Save changes
                  </PermissionButton>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {ProtectionAlert}

        <LocaleAliasesDialog
          isOpen={isLocaleAliasesOpen}
          onOpenChange={setIsLocaleAliasesOpen}
          value={form.watch('localeAliases') || {}}
          onChange={(aliases) => form.setValue('localeAliases', aliases)}
          isReadOnly={isReadOnly}
        />
      </>
    );
  }
);
