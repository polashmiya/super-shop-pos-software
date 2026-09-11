import { Delete } from 'lucide-react';
import { cn } from './cn';

interface NumericKeypadProps {
  /** Receives a key: '0'-'9', '00', '.', 'back', 'clear'. */
  onKey: (key: string) => void;
  allowDecimal?: boolean;
  backLabel: string;
  clearLabel?: string;
  className?: string;
  size?: 'md' | 'lg';
}

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
];

/** On-screen numeric keypad with large touch targets (spec §71). */
export function NumericKeypad({ onKey, allowDecimal = true, backLabel, clearLabel, className, size = 'md' }: NumericKeypadProps) {
  const keyClass = cn(
    'flex items-center justify-center rounded-lg border border-border bg-surface-2 font-semibold text-fg transition-base tnum',
    'hover:bg-surface-3 active:scale-95 active:bg-primary-soft select-none',
    size === 'lg' ? 'h-16 text-2xl' : 'h-13 min-h-touch text-xl',
  );
  return (
    <div className={cn('grid grid-cols-3 gap-2', className)} role="group">
      {ROWS.flat().map((key) => (
        <button key={key} type="button" className={keyClass} onClick={() => onKey(key)} tabIndex={-1}>
          {key}
        </button>
      ))}
      <button type="button" className={keyClass} onClick={() => onKey(allowDecimal ? '.' : '00')} tabIndex={-1}>
        {allowDecimal ? '.' : '00'}
      </button>
      <button type="button" className={keyClass} onClick={() => onKey('0')} tabIndex={-1}>
        0
      </button>
      <button
        type="button"
        className={cn(keyClass, 'text-fg-muted')}
        onClick={() => onKey('back')}
        onDoubleClick={() => clearLabel && onKey('clear')}
        aria-label={backLabel}
        tabIndex={-1}
      >
        <Delete size={size === 'lg' ? 26 : 22} aria-hidden />
      </button>
    </div>
  );
}
