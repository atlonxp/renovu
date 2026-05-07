import { ApiServiceLevelEnum, FeatureNameEnum, getFeatureForTierAsBoolean, PermissionsEnum } from '@novu/shared';
import { Switch } from '@/components/primitives/switch';
import { UpgradeCTATooltip } from '@/components/upgrade-cta-tooltip';
import { IS_ENTERPRISE, IS_SELF_HOSTED } from '@/config';
import { useFetchSubscription } from '@/hooks/use-fetch-subscription';
import { useAiSettings } from '@/hooks/use-ai-settings';
import { PermissionSwitch } from '../primitives/permission-switch';

type TranslationSwitchProps = {
  id: string;
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  isReadOnly?: boolean;
};

export function TranslationSwitch({ id, value, onChange, isReadOnly }: TranslationSwitchProps) {
  const { subscription, isLoading } = useFetchSubscription();
  const { data: aiSettings } = useAiSettings();

  // For self-hosted (ReNOVU): check if AI provider key is configured
  const hasOpenAIKeyConfigured = aiSettings?.hasApiKey ?? false;

  // For cloud (Novu): check tier/subscription features
  const hasCloudFeatureAccess =
    getFeatureForTierAsBoolean(
      FeatureNameEnum.AUTO_TRANSLATIONS,
      subscription?.apiServiceLevel || ApiServiceLevelEnum.FREE
    ) &&
    (!IS_SELF_HOSTED || IS_ENTERPRISE);

  // Self-hosted can use translations if OpenAI key is configured
  // Cloud can use translations if they have the feature access
  const canUseTranslationFeature = IS_SELF_HOSTED ? hasOpenAIKeyConfigured : hasCloudFeatureAccess;

  const isFeatureUnavailable = !canUseTranslationFeature || isLoading;
  const disabled = isFeatureUnavailable || isReadOnly;
  const checked = isFeatureUnavailable ? false : value;

  return (
    <div className="flex items-center">
      {!canUseTranslationFeature ? (
        <UpgradeCTATooltip
          description="Connect better with every user — Upgrade to reach users in their own language."
          utmCampaign="translation_prompt"
          utmSource="translation_prompt"
        >
          <Switch id={id} checked={checked} disabled />
        </UpgradeCTATooltip>
      ) : (
        <PermissionSwitch
          id={id}
          permission={PermissionsEnum.WORKFLOW_WRITE}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
