import { useMemo } from 'react';
import { isAcceptableBarcode } from '@/domain/barcode';
import { code128Svg } from '@/utils/code128';
import { cn } from '@/components/ui/cn';

interface BarcodeImageProps {
  value: string;
  /** Bar height in px. */
  height?: number;
  showText?: boolean;
  className?: string;
  label?: string;
}

/** Scannable Code 128 rendering of a barcode on a paper-white tile. */
export function BarcodeImage({ value, height = 56, showText = true, className, label }: BarcodeImageProps) {
  const src = useMemo(() => (isAcceptableBarcode(value) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code128Svg(value, height))}` : null), [value, height]);
  if (!src) return null;
  return (
    <figure className={cn('flex flex-col items-center gap-1 rounded-md bg-paper px-4 py-3 text-paper-fg', className)}>
      <img src={src} alt={label ?? value} draggable={false} className="w-full max-w-[18rem]" style={{ height }} />
      {showText && <figcaption className="font-mono text-sm tracking-[0.18em] select-text">{value}</figcaption>}
    </figure>
  );
}
