import { useId } from 'react';
import { Check, Pipette } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/components/ui/cn';
import { CATALOG_COLORS, isHexColor } from './catalogUtils';

interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
}

/** Colour swatches + a custom colour input (keyboard: Tab / Space / Enter). */
export function ColorSwatchPicker({ value, onChange, label }: ColorSwatchPickerProps) {
  const t = useT();
  const customId = useId();
  const normalized = value.toLowerCase();
  const isCustom = !CATALOG_COLORS.some((color) => color === normalized);

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {CATALOG_COLORS.map((color) => {
        const selected = color === normalized;
        return (
          <button
            key={color}
            type="button"
            aria-pressed={selected}
            aria-label={t('catalog.colors.swatch', { value: color })}
            onClick={() => onChange(color)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-base',
              selected ? 'ring-2 ring-fg' : 'hover:ring-2 hover:ring-border-strong',
            )}
            style={{ backgroundColor: color }}
          >
            {selected && <Check size={18} strokeWidth={3} aria-hidden className="text-white" />}
          </button>
        );
      })}
      <label
        htmlFor={customId}
        className={cn(
          'relative flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface-2 ps-1 pe-3 text-sm font-medium text-fg-muted transition-base hover:text-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus',
          isCustom && 'border-fg text-fg',
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: isHexColor(value) ? value : undefined }}>
          <Pipette size={15} aria-hidden className={isCustom ? 'text-white' : 'text-fg-muted'} />
        </span>
        {t('catalog.colors.custom')}
        <input id={customId} type="color" value={isHexColor(value) ? value : '#64748b'} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
    </div>
  );
}
