import { create } from 'zustand';
import type { Id } from '@/types';

/* Which POS dialog is open (one at a time), the active category and the search text. */

export type PosDialog =
  | { type: 'payment' }
  | { type: 'discount'; lineId: string | null }
  | { type: 'lineEdit'; lineId: string; focus?: 'quantity' | 'price' | 'note' }
  | { type: 'held' }
  | { type: 'hold' }
  | { type: 'customer' }
  | { type: 'quickView'; productId: Id }
  | { type: 'note' }
  | null;

interface PosUiState {
  dialog: PosDialog;
  categoryId: Id | 'featured' | null;
  /** Search text without any quantity prefix ("3*rice" → "rice"). */
  query: string;
  /** Quantity typed in front of the search text ("3*rice" → 3), or null. */
  typedQuantity: number | null;
  /** Index of the highlighted search result (Enter adds it). */
  highlight: number;
  open(dialog: Exclude<PosDialog, null>): void;
  close(): void;
  setCategory(categoryId: Id | 'featured' | null): void;
  setQuery(query: string, typedQuantity?: number | null): void;
  setHighlight(index: number): void;
}

export const usePosUi = create<PosUiState>((set) => ({
  dialog: null,
  categoryId: null,
  query: '',
  typedQuantity: null,
  highlight: 0,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
  setCategory: (categoryId) => set({ categoryId, highlight: 0 }),
  setQuery: (query, typedQuantity = null) => set({ query, typedQuantity, highlight: 0 }),
  setHighlight: (highlight) => set({ highlight }),
}));
