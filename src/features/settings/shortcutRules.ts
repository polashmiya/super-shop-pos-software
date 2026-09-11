import type { ShortcutAction, ShortcutMap } from '@/types';

/* ==========================================================================
   Rules for re-binding keyboard shortcuts: which keys can never be used
   (they are needed for typing and barcode scanning) and conflicts with
   other actions (every shortcut must be unique).
   ========================================================================== */

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'OS', 'Fn']);

/** Keys that move the cursor, submit forms or close dialogs. */
const NAVIGATION_KEYS = new Set(['Escape', 'Tab', 'Enter', 'Backspace', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

/** Ctrl/Cmd combinations used for text editing everywhere. */
const EDITING_COMBOS = new Set(['mod+a', 'mod+c', 'mod+v', 'mod+x', 'mod+z', 'mod+y']);

/** True while only modifier keys are held (keep waiting for the real key). */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key);
}

function mainKey(combo: string): string {
  if (combo.endsWith('++')) return '+';
  const parts = combo.split('+');
  return parts[parts.length - 1] ?? '';
}

/** Combos that would break typing or scanning: plain letters/digits, Enter, Tab, arrows, Ctrl+C… */
export function isReservedCombo(combo: string): boolean {
  if (!combo) return true;
  const lower = combo.toLowerCase();
  if (EDITING_COMBOS.has(lower)) return true;
  const modified = lower.startsWith('mod+') || lower.startsWith('alt+');
  if (modified) return false;
  const key = mainKey(combo);
  if (/^F\d{1,2}$/.test(key)) return false;
  if (key.length === 1 && /[\p{L}\p{N}]/u.test(key)) return true;
  return NAVIGATION_KEYS.has(key);
}

/** The other action already using `combo`, if any. */
export function findConflict(map: ShortcutMap, action: ShortcutAction, combo: string): ShortcutAction | null {
  const wanted = combo.toLowerCase();
  for (const [other, value] of Object.entries(map) as Array<[ShortcutAction, string]>) {
    if (other !== action && value && value.toLowerCase() === wanted) return other;
  }
  return null;
}
