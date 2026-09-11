/** Joins class names, skipping falsy values. (It does not merge conflicting Tailwind classes.) */
export function cn(...values: Array<string | false | null | undefined | 0>): string {
  let result = '';
  for (const value of values) {
    if (value) result = result ? `${result} ${value}` : value;
  }
  return result;
}

/** Shared control styling (inputs, selects, textareas). */
export const controlBase =
  'w-full rounded-md border border-border bg-surface-2 px-3 text-fg placeholder:text-fg-subtle transition-base ' +
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60 disabled:cursor-not-allowed';

export const controlInvalid = 'border-danger focus:border-danger focus:ring-danger/25';
