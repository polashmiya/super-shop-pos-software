import { create } from 'zustand';
import type { Permission } from '@/config/permissions';
import { APP_CONFIG } from '@/config/app.config';
import { isAppError, toAppError } from '@/domain/errors';
import { t, type TranslationKey, type TranslationParams } from '@/i18n';
import { sounds } from '@/services/soundService';
import type { User } from '@/types';

/* ==========================================================================
   UI state: overlays (command palette, notifications, shortcuts), toasts
   and promise-based dialogs (confirm, manager approval).
   ========================================================================== */

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  duration: number;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Require typing this word before confirming (very destructive actions). */
  typeToConfirm?: string;
}

export interface ApprovalRequest {
  permission: Permission;
  action: string;
}

interface UiState {
  paletteOpen: boolean;
  notificationsOpen: boolean;
  shortcutsOpen: boolean;
  toasts: Toast[];
  confirm: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null;
  approval: (ApprovalRequest & { resolve: (user: User | null) => void }) | null;
  setPaletteOpen(open: boolean): void;
  setNotificationsOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  pushToast(toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number;
  dismissToast(id: number): void;
}

let toastSequence = 0;

export const useUiStore = create<UiState>((set, get) => ({
  paletteOpen: false,
  notificationsOpen: false,
  shortcutsOpen: false,
  toasts: [],
  confirm: null,
  approval: null,

  setPaletteOpen: (open) => set({ paletteOpen: open, notificationsOpen: open ? false : get().notificationsOpen }),
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),

  pushToast(toast) {
    toastSequence += 1;
    const id = toastSequence;
    const duration = toast.duration ?? (toast.tone === 'danger' ? APP_CONFIG.ui.toastErrorDurationMs : APP_CONFIG.ui.toastDurationMs);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, duration }].slice(-APP_CONFIG.ui.maxToasts) }));
    return id;
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

type ToastInput = TranslationKey | { key: TranslationKey; params?: TranslationParams } | { text: string };

function resolveText(input: ToastInput): string {
  if (typeof input === 'string') return t(input);
  if ('text' in input) return input.text;
  return t(input.key, input.params);
}

/** Toast helpers. Messages are translation keys (or plain text via { text }). */
export const toast = {
  success(title: ToastInput, description?: ToastInput) {
    return useUiStore.getState().pushToast({ tone: 'success', title: resolveText(title), description: description ? resolveText(description) : undefined });
  },
  info(title: ToastInput, description?: ToastInput) {
    return useUiStore.getState().pushToast({ tone: 'info', title: resolveText(title), description: description ? resolveText(description) : undefined });
  },
  warning(title: ToastInput, description?: ToastInput) {
    return useUiStore.getState().pushToast({ tone: 'warning', title: resolveText(title), description: description ? resolveText(description) : undefined });
  },
  error(title: ToastInput, description?: ToastInput, action?: ToastAction) {
    sounds.error();
    return useUiStore.getState().pushToast({ tone: 'danger', title: resolveText(title), description: description ? resolveText(description) : undefined, action });
  },
  /** Shows a friendly, translated message for any error (never raw technical text). */
  fromError(error: unknown, action?: ToastAction) {
    const appError = toAppError(error);
    if (!isAppError(error)) console.error(error);
    return toast.error({ key: `errors.${appError.code}` as TranslationKey, params: appError.params }, undefined, action);
  },
};

/** Opens a confirmation dialog and resolves true when the user confirms. */
export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    const previous = useUiStore.getState().confirm;
    previous?.resolve(false);
    useUiStore.setState({ confirm: { ...request, resolve } });
  });
}

/** Asks a manager/admin for their PIN. Resolves with the approver or null. */
export function requestApproval(request: ApprovalRequest): Promise<User | null> {
  return new Promise((resolve) => {
    const previous = useUiStore.getState().approval;
    previous?.resolve(null);
    useUiStore.setState({ approval: { ...request, resolve } });
  });
}
