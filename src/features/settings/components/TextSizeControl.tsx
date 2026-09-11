import { BASE_FONT_RANGE, FONT_SIZE_PRESETS } from '@/config/theme.config';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import type { FontSizePreset } from '@/types';
import { SegmentedControl } from '@/components/ui/Controls';
import { saveDevice, useDeviceGroup } from '../saveStatus';

const PRESETS: FontSizePreset[] = ['sm', 'md', 'lg', 'xl'];

/** Text size presets + a fine-tuning slider for the root font size (the whole app scales). */
export function TextSizeControl({ showSample = true }: { showSample?: boolean }) {
  const t = useT();
  const format = useFormat();
  const appearance = useDeviceGroup('appearance');
  const px = appearance.baseFontPx;
  const pxLabel = t('settings.fonts.px', { value: format.number(px, 1) });

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        ariaLabel={t('settings.fonts.size')}
        value={appearance.fontSize}
        onChange={(fontSize) => saveDevice({ appearance: { fontSize, baseFontPx: FONT_SIZE_PRESETS[fontSize] } })}
        options={PRESETS.map((value) => ({ value, label: t(`enums.fontSize.${value}`) }))}
        fullWidth
      />
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold text-fg-subtle" aria-hidden>
          A
        </span>
        <input
          type="range"
          min={BASE_FONT_RANGE.min}
          max={BASE_FONT_RANGE.max}
          step={BASE_FONT_RANGE.step}
          value={px}
          aria-label={t('settings.fonts.fineTune')}
          aria-valuetext={pxLabel}
          onChange={(event) => saveDevice({ appearance: { baseFontPx: Number(event.target.value) } })}
          className="h-2 min-w-0 flex-1 cursor-pointer"
        />
        <span className="text-lg font-semibold text-fg-subtle" aria-hidden>
          A
        </span>
        <span className="w-16 shrink-0 text-end text-sm font-semibold text-fg tnum">{pxLabel}</span>
      </div>
      {showSample && (
        <div className="grid gap-2 rounded-lg border border-border bg-surface-2 p-4 sm:grid-cols-2">
          <p className="font-bangla text-fg" lang="bn">
            {t('settings.fonts.sampleBn')}
          </p>
          <p className="text-fg" lang="en">
            {t('settings.fonts.sampleEn')}
          </p>
        </div>
      )}
    </div>
  );
}
