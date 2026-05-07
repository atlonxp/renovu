import { LAYOUT_PRESETS, LayoutContainerConfig, LayoutPresetId } from '@novu/shared';
import { FormProvider, useWatch } from 'react-hook-form';
import { ColorPicker } from '../primitives/color-picker';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '../primitives/form/form';
import { Input } from '../primitives/input';
import { SegmentedControl, SegmentedControlList, SegmentedControlTrigger } from '../primitives/segmented-control';
import { cn } from '@/utils/ui';
import { useLayoutEditor } from './layout-editor-provider';

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
] as const;

const QUICK_PRESETS: Array<{ id: LayoutPresetId; label: string }> = [
  { id: LayoutPresetId.STANDARD, label: 'Standard' },
  { id: LayoutPresetId.WIDE, label: 'Wide' },
  { id: LayoutPresetId.FULL_WIDTH_LEFT, label: 'Full' },
  { id: LayoutPresetId.COMPACT, label: 'Compact' },
  { id: LayoutPresetId.BLANK, label: 'Reset' },
];

const isContainerEqual = (a?: LayoutContainerConfig, b?: LayoutContainerConfig) => {
  return (
    (a?.maxWidth ?? '') === (b?.maxWidth ?? '') &&
    (a?.align ?? '') === (b?.align ?? '') &&
    (a?.padding ?? '') === (b?.padding ?? '')
  );
};

const ContainerFields = () => {
  const { form } = useLayoutEditor();
  const container = useWatch({ control: form.control, name: 'container' }) as LayoutContainerConfig | undefined;

  const applyPreset = (preset: LayoutContainerConfig | undefined) => {
    const next: LayoutContainerConfig = {
      maxWidth: preset?.maxWidth,
      align: preset?.align,
      padding: preset?.padding,
      backgroundColor: container?.backgroundColor,
    };
    form.setValue('container', next, { shouldDirty: true, shouldTouch: true });
  };

  const matchedPresetId = LAYOUT_PRESETS.find((p) =>
    isContainerEqual(p.container, container)
  )?.id;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-foreground-950 text-sm font-medium">Container</div>
        <p className="text-foreground-500 mt-0.5 text-xs">
          Configure how the email container is sized, aligned, and styled.
        </p>
      </div>

      <div>
        <div className="text-foreground-600 mb-1.5 text-xs">Presets</div>
        <div className="grid grid-cols-5 gap-1.5">
          {QUICK_PRESETS.map((preset) => {
            const def = LAYOUT_PRESETS.find((p) => p.id === preset.id);
            const selected = matchedPresetId === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(def?.container)}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-xs transition-colors',
                  selected
                    ? 'border-primary-500 bg-primary-50/40 text-foreground-950'
                    : 'border-neutral-100 hover:border-neutral-200 text-foreground-600'
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <FormField
        control={form.control}
        name="container.maxWidth"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Max width</FormLabel>
            <FormControl>
              <Input size="xs" placeholder="600px" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="container.align"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Alignment</FormLabel>
            <FormControl>
              <SegmentedControl value={field.value ?? 'center'} onValueChange={(v) => field.onChange(v)}>
                <SegmentedControlList>
                  {ALIGN_OPTIONS.map((opt) => (
                    <SegmentedControlTrigger key={opt.value} value={opt.value}>
                      {opt.label}
                    </SegmentedControlTrigger>
                  ))}
                </SegmentedControlList>
              </SegmentedControl>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="container.padding"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Padding</FormLabel>
            <FormControl>
              <Input size="xs" placeholder="1rem" {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="container.backgroundColor"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs">Background color</FormLabel>
            <FormControl>
              <ColorPicker
                value={field.value ?? ''}
                onChange={(color) => field.onChange(color)}
                pureInput={false}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};

export const LayoutContainerSection = () => {
  const { form } = useLayoutEditor();

  return (
    <FormProvider {...form}>
      <ContainerFields />
    </FormProvider>
  );
};
