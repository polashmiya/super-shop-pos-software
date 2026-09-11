import { useEffect, useRef } from 'react';
import { comboMatches, firesWhileTyping, POS_ACTIONS } from '@/app/shortcuts';
import { isEditableTarget } from '@/hooks/useCommon';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { ShortcutAction } from '@/types/settings';
import { clearCart, removeLine, scanCode, stepLineQuantity } from './posActions';
import { usePosUi } from './posUiStore';

/* ==========================================================================
   POS keyboard: USB barcode scanners (keyboard wedge) and shortcuts.

   Scanner detection: characters arriving faster than `scanSpeedMs` apart,
   ending with Enter (or Tab), are treated as a scan — even when the scan
   box does not have focus. Typing normally focuses the scan box.
   Shortcuts never interfere with typing (function keys and Ctrl/Alt
   combos only while a text field is focused).
   ========================================================================== */

export interface PosKeyboardHandlers {
  focusSearch: () => void;
}

function anyOverlayOpen(): boolean {
  const ui = useUiStore.getState();
  return Boolean(usePosUi.getState().dialog || ui.paletteOpen || ui.confirm || ui.approval || ui.shortcutsOpen || ui.notificationsOpen || document.querySelector('[data-modal-root]'));
}

export function usePosKeyboard({ focusSearch }: PosKeyboardHandlers): void {
  const buffer = useRef('');
  const lastKeyAt = useRef(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const settings = useSettingsStore.getState().device;
      const editable = isEditableTarget(event.target);
      const overlay = anyOverlayOpen();

      // 1. POS shortcuts.
      if (!overlay) {
        const action = POS_ACTIONS.find((candidate) => comboMatches(event, settings.shortcuts[candidate]));
        if (action) {
          const combo = settings.shortcuts[action];
          const searchEmpty = usePosUi.getState().query === '';
          const inSearch = event.target instanceof HTMLElement && event.target.dataset.posSearch === 'true';
          if (!editable || firesWhileTyping(combo) || (inSearch && searchEmpty)) {
            event.preventDefault();
            runAction(action, focusSearch);
            return;
          }
        }
        if (!editable && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          usePosStore.getState().selectRelative(event.key === 'ArrowDown' ? 1 : -1);
          return;
        }
      }

      // 2. Scanner capture / type-to-search when no text field has focus.
      if (overlay || editable || event.ctrlKey || event.metaKey || event.altKey) return;
      const now = performance.now();
      const terminator = settings.barcode.terminator === 'tab' ? 'Tab' : 'Enter';
      if (event.key === terminator && buffer.current.length > 0) {
        event.preventDefault();
        const code = buffer.current;
        buffer.current = '';
        if (code.length >= settings.barcode.minLength) void scanCode(code);
        return;
      }
      if (event.key.length === 1) {
        const fast = now - lastKeyAt.current <= settings.barcode.scanSpeedMs;
        lastKeyAt.current = now;
        if (!fast) buffer.current = '';
        buffer.current += event.key;
        // A person typing (not a scanner): move the characters into the scan box.
        if (!fast && buffer.current.length === 1 && !/^\d$/.test(event.key)) {
          event.preventDefault();
          buffer.current = '';
          usePosUi.getState().setQuery(event.key);
          focusSearch();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearch]);
}

function runAction(action: ShortcutAction, focusSearch: () => void): void {
  const pos = usePosStore.getState();
  const ui = usePosUi.getState();
  const selected = pos.selectedLineId;
  switch (action) {
    case 'payment':
    case 'completePayment':
      if (pos.draft.lines.length > 0) ui.open({ type: 'payment' });
      break;
    case 'holdSale':
      if (pos.draft.lines.length > 0) ui.open({ type: 'hold' });
      break;
    case 'recallSale':
      ui.open({ type: 'held' });
      break;
    case 'discount':
      if (pos.draft.lines.length > 0) ui.open({ type: 'discount', lineId: null });
      break;
    case 'removeItem':
      if (selected) removeLine(selected);
      break;
    case 'increaseQty':
      if (selected) stepLineQuantity(selected, 1);
      break;
    case 'decreaseQty':
      if (selected) stepLineQuantity(selected, -1);
      break;
    case 'focusSearch':
      focusSearch();
      break;
    case 'selectCustomer':
      ui.open({ type: 'customer' });
      break;
    case 'clearCart':
      void clearCart();
      break;
    default:
      break;
  }
}
