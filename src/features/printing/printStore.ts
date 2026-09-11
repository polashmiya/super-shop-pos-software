import { create } from 'zustand';
import type { PrintResult } from '@/types';
import type { PrintRequest } from './printService';

interface PrintState {
  request: (PrintRequest & { resolve: (result: PrintResult | null) => void }) | null;
}

/** The document currently shown in the print preview dialog. */
export const usePrintStore = create<PrintState>(() => ({ request: null }));
