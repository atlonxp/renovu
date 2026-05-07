import type { LayoutContainerConfig } from './layout.dto';

export enum LayoutPresetId {
  STANDARD = 'standard',
  WIDE = 'wide',
  FULL_WIDTH_LEFT = 'full-width-left',
  COMPACT = 'compact',
  BLANK = 'blank',
}

export type LayoutPreset = {
  id: LayoutPresetId;
  label: string;
  description: string;
  container?: LayoutContainerConfig;
};

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: LayoutPresetId.STANDARD,
    label: 'Standard',
    description: 'Centered 600px container with comfortable padding.',
    container: { maxWidth: '600px', align: 'center', padding: '1rem' },
  },
  {
    id: LayoutPresetId.WIDE,
    label: 'Wide',
    description: 'Centered 800px container for longer-form emails.',
    container: { maxWidth: '800px', align: 'center', padding: '1rem' },
  },
  {
    id: LayoutPresetId.FULL_WIDTH_LEFT,
    label: 'Full-width left',
    description: 'Stretches the full viewport width, left-aligned.',
    container: { maxWidth: '100%', align: 'left', padding: '1rem' },
  },
  {
    id: LayoutPresetId.COMPACT,
    label: 'Compact',
    description: 'Narrow 400px container with tighter padding.',
    container: { maxWidth: '400px', align: 'center', padding: '0.75rem' },
  },
  {
    id: LayoutPresetId.BLANK,
    label: 'Blank',
    description: 'No container preset — falls back to defaults.',
    container: undefined,
  },
];

export const DEFAULT_LAYOUT_PRESET_ID = LayoutPresetId.STANDARD;

export const getLayoutPreset = (id: LayoutPresetId): LayoutPreset | undefined =>
  LAYOUT_PRESETS.find((preset) => preset.id === id);
