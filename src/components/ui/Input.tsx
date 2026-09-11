import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn, controlBase, controlInvalid } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  trailing?: ReactNode;
  invalid?: boolean;
  inputSize?: 'md' | 'lg' | 'xl';
}

const INPUT_SIZES = { md: 'min-h-touch text-[0.94rem]', lg: 'min-h-[3.25rem] text-base', xl: 'min-h-[3.75rem] text-lg' };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon: Icon, trailing, invalid, inputSize = 'md', className, ...rest },
  ref,
) {
  return (
    <div className="relative flex w-full items-center">
      {Icon && <Icon size={inputSize === 'xl' ? 22 : 18} aria-hidden className="pointer-events-none absolute start-3 text-fg-subtle" />}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(controlBase, INPUT_SIZES[inputSize], Icon && (inputSize === 'xl' ? 'ps-11' : 'ps-10'), trailing ? 'pe-12' : undefined, invalid && controlInvalid, className)}
        {...rest}
      />
      {trailing && <div className="absolute end-1.5 flex items-center gap-1">{trailing}</div>}
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={cn(controlBase, 'py-2.5 leading-relaxed', invalid && controlInvalid, className)} {...rest} />;
});

export interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
}

/** Label + control + hint/error with correct aria wiring. */
export function FormField({ label, hint, error, required, className, children }: FormFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="type-label text-fg-muted">
        {label}
        {required && <span className="ms-0.5 text-danger-text" aria-hidden>*</span>}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="type-caption text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p className="type-caption text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
