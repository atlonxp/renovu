import { AUTOCOMPLETE_PASSWORD_MANAGERS_OFF } from '@/editor/utils/constants';

export type ImageSizeUnit = 'px' | '%';

type ImageSizeProps = {
  value: string;
  unit: ImageSizeUnit;
  onValueChange: (value: string) => void;
  onUnitChange: (unit: ImageSizeUnit) => void;
  dimension: 'width' | 'height';
};

export function ImageSize(props: ImageSizeProps) {
  const { value, unit, onValueChange, onUnitChange, dimension } = props;

  const toggleUnit = () => onUnitChange(unit === 'px' ? '%' : 'px');

  return (
    <label className="mly-relative mly-flex mly-items-center">
      <span className="mly-absolute mly-inset-y-0 mly-left-2 mly-flex mly-items-center mly-text-xs mly-leading-none mly-text-gray-400">
        {dimension === 'width' ? 'W' : 'H'}
      </span>
      <input
        {...AUTOCOMPLETE_PASSWORD_MANAGERS_OFF}
        className="hide-number-controls mly-h-auto mly-w-[96px] mly-appearance-none mly-border-0 mly-border-none mly-p-1 mly-pl-[22px] mly-pr-[38px] mly-text-sm mly-uppercase mly-tabular-nums mly-outline-none focus-visible:mly-outline-none"
        type="number"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <button
        type="button"
        onClick={toggleUnit}
        title={`Toggle ${unit === 'px' ? 'percent' : 'pixels'}`}
        className="mly-absolute mly-inset-y-0 mly-right-1 mly-flex mly-items-center mly-rounded mly-px-1 mly-text-xs mly-leading-none mly-text-gray-400 hover:mly-bg-gray-100 hover:mly-text-gray-700"
      >
        {unit === 'px' ? 'PX' : '%'}
      </button>
    </label>
  );
}
