import type { ShortcutAction, ShortcutMap } from '@/types/settings';

/* ==========================================================================
   Keyboard shortcut matching. Combos look like "F9", "Mod+K", "Alt+C",
   "Delete", "+". "Mod" is Ctrl (Windows/Linux) or Cmd (macOS).
   ========================================================================== */

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Add') return '+';
  if (key === 'Subtract') return '-';
  return key.length === 1 ? key.toUpperCase() : key;
}

/** The combo string for a keyboard event (e.g. "Mod+Enter"). */
export function eventToCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (IS_MAC ? event.metaKey : event.ctrlKey) parts.push('Mod');
  if (event.altKey) parts.push('Alt');
  const key = normalizeKey(event.key);
  // Shift is part of typing symbols like "+"; only record it for named keys.
  if (event.shiftKey && key.length > 1) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function comboMatches(event: KeyboardEvent, combo: string): boolean {
  if (!combo) return false;
  return eventToCombo(event).toLowerCase() === combo.toLowerCase();
}

/** Whether the combo is safe to fire while the user types in a text field. */
export function firesWhileTyping(combo: string): boolean {
  return /^F\d{1,2}$/.test(combo) || combo.startsWith('Mod+') || combo.startsWith('Alt+');
}

export function matchShortcut(event: KeyboardEvent, map: ShortcutMap, actions: readonly ShortcutAction[]): ShortcutAction | null {
  for (const action of actions) {
    if (comboMatches(event, map[action])) return action;
  }
  return null;
}

/** Human-friendly combo for display ("Ctrl+K" / "⌘K"). */
export function displayCombo(combo: string): string {
  if (!combo) return '';
  return combo
    .split('+')
    .map((part) => (part === 'Mod' ? (IS_MAC ? '⌘' : 'Ctrl') : part === 'Delete' ? 'Del' : part))
    .join(IS_MAC ? '' : '+');
}

/** Global (app-wide) actions; the rest are handled by the POS screen. */
export const GLOBAL_ACTIONS: ShortcutAction[] = ['goPos', 'goProducts', 'goSales', 'goCustomers', 'goReports', 'refresh', 'fullscreen', 'globalSearch', 'showShortcuts'];

export const POS_ACTIONS: ShortcutAction[] = ['holdSale', 'recallSale', 'payment', 'discount', 'completePayment', 'removeItem', 'increaseQty', 'decreaseQty', 'focusSearch', 'selectCustomer', 'clearCart'];
