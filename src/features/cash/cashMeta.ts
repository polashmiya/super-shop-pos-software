import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  Banknote,
  Building2,
  CircleCheck,
  CircleDot,
  CircleMinus,
  CirclePlus,
  Hourglass,
  LockKeyhole,
  LockOpen,
  ReceiptText,
  ShoppingBag,
  Undo2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { Tone } from '@/components/ui/Display';
import { parseMoneyInput } from '@/domain/money';
import { sumDenominations } from '@/domain/shift';
import { pick, type Translate } from '@/i18n';
import type { CashMovement, CashMovementType, Counter, CounterStatus, ExpensePaidFrom, ExpenseStatus, Language, Money, PaymentMethod, ReportPeriod, ShiftStatus } from '@/types';

/* ==========================================================================
   Cash screens: status visuals (colour + icon + text), cash counting state,
   drawer ledger helpers, durations and expense description helpers.
   ========================================================================== */

type Meta = { tone: Tone; icon: LucideIcon };

/* ------------------------------ Differences ------------------------------ */

export type DifferenceKind = 'over' | 'short' | 'balanced';

/** Counted − expected: positive = cash over, negative = cash short. */
export function differenceKind(difference: Money): DifferenceKind {
  if (difference > 0) return 'over';
  if (difference < 0) return 'short';
  return 'balanced';
}

export const DIFFERENCE_META: Record<DifferenceKind, Meta> = {
  balanced: { tone: 'success', icon: CircleCheck },
  over: { tone: 'warning', icon: CirclePlus },
  short: { tone: 'danger', icon: CircleMinus },
};

/* -------------------------------- Statuses ------------------------------- */

export const SHIFT_STATUS_META: Record<ShiftStatus, Meta> = {
  open: { tone: 'success', icon: CircleDot },
  closed: { tone: 'neutral', icon: LockKeyhole },
};

export const COUNTER_STATUS_META: Record<CounterStatus, Meta> = {
  open: { tone: 'success', icon: CircleDot },
  closed: { tone: 'neutral', icon: LockKeyhole },
  maintenance: { tone: 'warning', icon: Wrench },
};

export const EXPENSE_STATUSES: readonly ExpenseStatus[] = ['pending', 'approved', 'rejected'];

export const EXPENSE_STATUS_META: Record<ExpenseStatus, Meta> = {
  pending: { tone: 'warning', icon: Hourglass },
  approved: { tone: 'success', icon: CircleCheck },
  rejected: { tone: 'danger', icon: Ban },
};

export const PAID_FROM_OPTIONS: readonly ExpensePaidFrom[] = ['cash_drawer', 'office'];

export const PAID_FROM_ICONS: Record<ExpensePaidFrom, LucideIcon> = { cash_drawer: Banknote, office: Building2 };

export const MOVEMENT_META: Record<CashMovementType, Meta> = {
  opening: { tone: 'neutral', icon: LockOpen },
  sale: { tone: 'success', icon: ShoppingBag },
  refund: { tone: 'warning', icon: Undo2 },
  expense: { tone: 'danger', icon: ReceiptText },
  cash_in: { tone: 'info', icon: ArrowDownToLine },
  cash_out: { tone: 'primary', icon: ArrowUpFromLine },
  closing: { tone: 'neutral', icon: LockKeyhole },
};

/** Periods offered on the shift history and expense screens. */
export const CASH_PERIODS: ReportPeriod[] = ['today', 'yesterday', 'this_week', 'this_month', 'last_month', 'last_30_days', 'custom'];

/* ------------------------------ Cash counting ---------------------------- */

export type CountMode = 'amount' | 'notes';

export interface CashCountState {
  mode: CountMode;
  /** Typed amount in taka (amount mode). */
  text: string;
  /** Pieces per note value (notes mode). */
  counts: Partial<Record<number, number>>;
}

export function emptyCount(text = ''): CashCountState {
  return { mode: 'amount', text, counts: {} };
}

/** Counted amount in poisha, or null when the typed amount is not valid. */
export function countValue(state: CashCountState): Money | null {
  if (state.mode === 'notes') return sumDenominations(state.counts);
  const value = parseMoneyInput(state.text);
  return value !== null && value >= 0 ? value : null;
}

/** Poisha → editable taka text ("1500" or "1500.50"). */
export function amountText(minor: Money): string {
  return (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);
}

/** Keeps digits (English or Bangla) and one decimal point while typing an amount. */
export function sanitizeAmount(text: string): string {
  return text.replace(/[^\d.০-৯]/g, '');
}

/** Parses a piece count typed with English or Bangla digits. */
export function parseCount(text: string): number {
  const ascii = text.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6)).replace(/\D/g, '');
  const value = Number(ascii);
  return Number.isFinite(value) ? Math.min(9_999, Math.trunc(value)) : 0;
}

/** Quick opening floats (poisha): ৳1,000 … ৳10,000. */
export const OPENING_QUICK_AMOUNTS: readonly Money[] = [100_000, 200_000, 300_000, 500_000, 1_000_000];

/** Quick cash in / out amounts (poisha): ৳500 … ৳10,000. */
export const MOVEMENT_QUICK_AMOUNTS: readonly Money[] = [50_000, 100_000, 200_000, 500_000, 1_000_000];

/** Unique, positive amounts in their original order (quick amount chips). */
export function uniqueAmounts(amounts: ReadonlyArray<Money | null | undefined>): Money[] {
  const seen = new Set<Money>();
  const result: Money[] = [];
  for (const amount of amounts) {
    if (amount === null || amount === undefined || amount <= 0 || seen.has(amount)) continue;
    seen.add(amount);
    result.push(amount);
  }
  return result;
}

/* ------------------------------- Close shift ----------------------------- */

export type CloseStep = 'count' | 'review' | 'confirm' | 'done';

export type NumberedCloseStep = Exclude<CloseStep, 'done'>;

/** The numbered steps (the summary after closing is not counted). */
export const CLOSE_STEPS: readonly NumberedCloseStep[] = ['count', 'review', 'confirm'];

/* -------------------------------- Cash in/out ---------------------------- */

export const CASH_IN_REASONS = ['float', 'owner', 'correction', 'other'] as const;
export const CASH_OUT_REASONS = ['bank', 'safe', 'owner', 'supplier', 'correction', 'other'] as const;

export type CashInReason = (typeof CASH_IN_REASONS)[number];
export type CashOutReason = (typeof CASH_OUT_REASONS)[number];

/* ---------------------------------- Ledger ------------------------------- */

export type LedgerFilter = 'all' | 'sales' | 'refunds' | 'inOut' | 'expenses';

export const LEDGER_FILTERS: readonly LedgerFilter[] = ['all', 'sales', 'refunds', 'inOut', 'expenses'];

export function matchesLedger(type: CashMovementType, filter: LedgerFilter): boolean {
  switch (filter) {
    case 'sales':
      return type === 'sale';
    case 'refunds':
      return type === 'refund';
    case 'inOut':
      return type === 'cash_in' || type === 'cash_out';
    case 'expenses':
      return type === 'expense';
    default:
      return true;
  }
}

export interface LedgerRow extends CashMovement {
  /** Cash in the drawer after this movement (the counted cash for the closing count). */
  balance: Money;
}

/** Adds the running drawer balance and returns the rows newest first. */
export function ledgerRows(movements: readonly CashMovement[]): LedgerRow[] {
  const ordered = [...movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let running = 0;
  const rows = ordered.map((movement) => {
    if (movement.type === 'closing') return { ...movement, balance: Math.abs(movement.amount) };
    running += movement.amount;
    return { ...movement, balance: running };
  });
  return rows.reverse();
}

/* -------------------------------- Durations ------------------------------ */

export function durationParts(fromIso: string, to: Date): { hours: number; minutes: number } {
  const total = Math.max(0, Math.floor((to.getTime() - new Date(fromIso).getTime()) / 60_000));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function formatDuration(t: Translate, fromIso: string, to: Date): string {
  const { hours, minutes } = durationParts(fromIso, to);
  return hours > 0 ? t('cash.common.hoursMinutes', { hours, minutes }) : t('cash.common.minutes', { minutes });
}

/* ------------------------------- Names & misc ---------------------------- */

export function counterName(counter: Pick<Counter, 'name'>, language: Language): string {
  return pick(counter.name, language);
}

export const NON_CASH_METHODS: readonly PaymentMethod[] = ['card', 'mobile', 'points'];

/* --------------------------- Expense descriptions ------------------------ */

/** The optional bill / voucher number is kept on its own line after "#". */
const REFERENCE_MARK = '\n#';

export function splitExpenseDescription(description: string): { note: string; reference: string } {
  const index = description.lastIndexOf(REFERENCE_MARK);
  if (index < 0) return { note: description.trim(), reference: '' };
  return { note: description.slice(0, index).trim(), reference: description.slice(index + REFERENCE_MARK.length).trim() };
}

export function joinExpenseDescription(note: string, reference: string): string {
  const cleanNote = note.trim().replace(/\s+/g, ' ');
  const cleanReference = reference.trim().replace(/\s+/g, ' ');
  return cleanReference ? `${cleanNote}${REFERENCE_MARK}${cleanReference}` : cleanNote;
}
