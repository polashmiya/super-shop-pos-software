import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { Banknote, Check, CircleCheckBig, CreditCard, Eye, Gift, Plus, Printer, ReceiptText, Smartphone, Trash2, TriangleAlert, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { comboMatches, displayCombo } from '@/app/shortcuts';
import { parseMoneyInput } from '@/domain/money';
import { suggestCashAmounts } from '@/domain/payment';
import { useFormat } from '@/hooks/useFormat';
import { useLanguage, useT } from '@/i18n';
import { maxPointsPayable, paymentBreakdown } from '@/services/paymentService';
import { completeSale, getSale, type CompletedSale } from '@/services/saleService';
import { sounds } from '@/services/soundService';
import { useCatalogStore } from '@/stores/catalogStore';
import { usePosStore } from '@/stores/posStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { toast } from '@/stores/uiStore';
import type { CardNetwork, MobileProvider, PaymentEntry, PaymentMethod, PrintResult } from '@/types';
import { buildSaleReceipt, printResultMessage, printWithSettings, openPrintPreview } from '@/features/printing/printService';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Kbd } from '@/components/ui/Display';
import { Modal } from '@/components/ui/Modal';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { applyKeypadKey } from '@/components/ui/keypad';
import { useCartTotals } from './useCartTotals';
import { usePosUi } from './posUiStore';

/* ==========================================================================
   Payment (spec §24–27, §122–124): cash with quick notes and change, card,
   mobile banking (bKash, Nagad, Rocket…), loyalty points and split payment.
   Complete is disabled until the amount is covered. After saving, a success
   view offers print / new sale; a print failure never affects the sale.
   ========================================================================== */

interface PayLine {
  id: string;
  method: PaymentMethod;
  provider: MobileProvider | CardNetwork | null;
  amountText: string;
  reference: string;
}

const METHOD_ICONS: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, mobile: Smartphone, points: Gift };

let lineCounter = 0;
const nextLineId = () => {
  lineCounter += 1;
  return `pay-${lineCounter}`;
};

function amountToText(minor: number): string {
  const taka = minor / 100;
  return Number.isInteger(taka) ? String(taka) : taka.toFixed(2);
}

export function PaymentModal() {
  const dialog = usePosUi((state) => state.dialog);
  if (dialog?.type !== 'payment') return null;
  return <PaymentDialog />;
}

function PaymentDialog() {
  const t = useT();
  const language = useLanguage();
  const format = useFormat();
  const navigate = useNavigate();
  const close = usePosUi((state) => state.close);
  const draft = usePosStore((state) => state.draft);
  const customer = usePosStore((state) => state.customer);
  const business = useSettingsStore((state) => state.business);
  const posSettings = useSettingsStore((state) => state.device.pos);
  const printer = useSettingsStore((state) => state.device.printer);
  const updateDevice = useSettingsStore((state) => state.updateDevice);
  const showKeypad = useSettingsStore((state) => state.device.pos.showNumericKeypad);
  const completeShortcut = useSettingsStore((state) => state.device.shortcuts.completePayment);
  const totals = useCartTotals();
  const due = totals.grandTotal;
  const enabledMethods = (['cash', 'card', 'mobile'] as const).filter((method) => business.payment.methods[method]);
  const initialMethod: PaymentMethod = posSettings.rememberLastPaymentMethod && posSettings.lastPaymentMethod && enabledMethods.includes(posSettings.lastPaymentMethod as 'cash') ? posSettings.lastPaymentMethod : (enabledMethods[0] ?? 'cash');
  const [lines, setLines] = useState<PayLine[]>(() => [{ id: nextLineId(), method: initialMethod, provider: initialMethod === 'mobile' ? 'bkash' : initialMethod === 'card' ? 'visa' : null, amountText: amountToText(due), reference: '' }]);
  const [activeId, setActiveId] = useState(lines[0].id);
  const [phase, setPhase] = useState<'pay' | 'saving' | 'done'>('pay');
  const [result, setResult] = useState<CompletedSale | null>(null);
  const [printState, setPrintState] = useState<{ status: 'idle' | 'printing' | 'printed' | 'failed'; message?: string }>({ status: 'idle' });
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const newSaleRef = useRef<HTMLButtonElement | null>(null);

  const entries: PaymentEntry[] = useMemo(
    () =>
      lines.map((line) => {
        const amount = parseMoneyInput(line.amountText) ?? 0;
        return {
          id: line.id,
          method: line.method,
          provider: line.provider,
          amount,
          reference: line.reference,
          points: line.method === 'points' ? Math.floor(amount / business.loyalty.pointValue) : undefined,
        };
      }),
    [lines, business.loyalty.pointValue],
  );
  const breakdown = paymentBreakdown(due, entries, customer);
  const pointsLimit = maxPointsPayable(due, customer);
  const quickCash = useMemo(() => [...new Set([...suggestCashAmounts(due, business.payment.quickCash)])].slice(0, 6), [due, business.payment.quickCash]);
  const activeLine = lines.find((line) => line.id === activeId) ?? lines[0];
  const canComplete = phase === 'pay' && breakdown.isSufficient && breakdown.errors.length === 0 && due > 0;

  const updateLine = (id: string, patch: Partial<PayLine>) => setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  const setMethod = (method: PaymentMethod) => {
    updateLine(activeLine.id, {
      method,
      provider: method === 'mobile' ? 'bkash' : method === 'card' ? 'visa' : null,
      amountText: method === 'points' ? amountToText(Math.min(pointsLimit, parseMoneyInput(activeLine.amountText) ?? 0)) : activeLine.amountText,
    });
    focusLine(activeLine.id);
  };

  const focusLine = (id: string) => {
    setActiveId(id);
    requestAnimationFrame(() => {
      const input = inputRefs.current.get(id);
      input?.focus();
      input?.select();
    });
  };

  const otherLinesTotal = (id: string) => entries.filter((entry) => entry.id !== id).reduce((sum, entry) => sum + entry.amount, 0);

  const addLine = (method?: PaymentMethod) => {
    const remaining = Math.max(0, due - breakdown.tendered);
    const hasCash = lines.some((line) => line.method === 'cash');
    const chosen: PaymentMethod = method ?? (hasCash ? (business.payment.methods.mobile ? 'mobile' : 'card') : 'cash');
    const amount = chosen === 'points' ? Math.min(pointsLimit, remaining || due) : remaining;
    const line: PayLine = { id: nextLineId(), method: chosen, provider: chosen === 'mobile' ? 'bkash' : chosen === 'card' ? 'visa' : null, amountText: amount > 0 ? amountToText(amount) : '', reference: '' };
    setLines((current) => [...current, line]);
    focusLine(line.id);
  };

  const removeLine = (id: string) => {
    setLines((current) => {
      const next = current.filter((line) => line.id !== id);
      if (next.length === 0) return current;
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const setQuickCash = (amount: number) => {
    if (activeLine.method !== 'cash') {
      const cashLine = lines.find((line) => line.method === 'cash');
      if (cashLine) {
        updateLine(cashLine.id, { amountText: amountToText(amount) });
        setActiveId(cashLine.id);
        return;
      }
    }
    updateLine(activeLine.id, { method: 'cash', provider: null, amountText: amountToText(amount) });
  };

  const setExact = () => {
    const rest = Math.max(0, due - otherLinesTotal(activeLine.id));
    updateLine(activeLine.id, { amountText: amountToText(activeLine.method === 'points' ? Math.min(rest, pointsLimit) : rest) });
  };

  const printReceipt = async (saleId: string, reprint = false, preview = false) => {
    setPrintState({ status: 'printing' });
    try {
      const sale = await getSale(saleId);
      if (!sale) throw new Error('sale not found');
      const request = await buildSaleReceipt(sale, reprint);
      const outcome: PrintResult | null = preview ? await openPrintPreview(request) : await printWithSettings(request);
      if (!outcome) setPrintState({ status: 'idle' });
      else if (outcome.outcome === 'printed' || outcome.outcome === 'saved-pdf') setPrintState({ status: 'printed', message: printResultMessage(outcome) });
      else setPrintState({ status: 'failed', message: printResultMessage(outcome) });
    } catch (error) {
      console.error(error);
      setPrintState({ status: 'failed', message: t('pos.success.printFailed') });
    }
  };

  const complete = async () => {
    if (!canComplete) return;
    setPhase('saving');
    try {
      const completed = await completeSale({ draft, payments: entries.filter((entry) => entry.amount > 0), customer, language });
      setResult(completed);
      setPhase('done');
      sounds.success();
      if (posSettings.rememberLastPaymentMethod) updateDevice({ pos: { lastPaymentMethod: lines[0].method } });
      if (posSettings.clearCartAfterSale) usePosStore.getState().clear();
      void useCatalogStore.getState().refreshStock(completed.productIds);
      void useShiftStore.getState().refreshTotals();
      requestAnimationFrame(() => newSaleRef.current?.focus());
      if (printer.printAfterSale || printer.autoPrint) void printReceipt(completed.saleId);
    } catch (error) {
      setPhase('pay');
      toast.fromError(error);
    }
  };

  const finish = () => {
    close();
    usePosUi.getState().setQuery('');
    usePosStore.getState().requestFocus();
  };

  // The complete-payment shortcut (Ctrl+Enter by default) works wherever focus is inside the dialog.
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (phase !== 'pay' || !comboMatches(event, completeShortcut)) return;
    event.preventDefault();
    void complete();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  /* ------------------------------ Success view ------------------------------ */
  if (phase === 'done' && result) {
    return (
      <Modal open onClose={finish} size="md" hideHeader closeLabel={t('common.actions.close')} initialFocus={newSaleRef}>
        <div
          className="flex flex-col items-center gap-5 py-4 text-center"
          onKeyDown={(event) => {
            if (event.key.toLowerCase() === 'p' && !event.ctrlKey) void printReceipt(result.saleId);
          }}
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-success-soft text-success-text animate-pop-in">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="48" className="animate-check" />
            </svg>
          </span>
          <div>
            <h2 className="type-h1 text-fg">{t('pos.success.title')}</h2>
            <p className="mt-1 text-fg-muted">
              {t('pos.success.invoice')} <span className="font-mono font-semibold text-fg">{result.invoiceNo}</span>
            </p>
          </div>
          <div className="grid w-full grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="type-caption text-fg-subtle">{t('pos.success.total')}</p>
              <p className="text-xl font-bold text-fg tnum">{format.money(result.totals.grandTotal)}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="type-caption text-fg-subtle">{t('pos.success.paid')}</p>
              <p className="text-xl font-bold text-fg tnum">{format.money(result.paid)}</p>
            </div>
            <div className={cn('rounded-xl border p-3', result.change > 0 ? 'border-primary bg-primary-soft' : 'border-border bg-surface-2')}>
              <p className={cn('type-caption', result.change > 0 ? 'text-primary-soft-fg' : 'text-fg-subtle')}>{t('pos.success.change')}</p>
              <p className={cn('text-xl font-bold tnum', result.change > 0 ? 'text-primary-soft-fg' : 'text-fg')}>{format.money(result.change)}</p>
            </div>
          </div>
          {result.pointsEarned > 0 && (
            <p className="flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-sm font-semibold text-warning-text">
              <Gift size={15} aria-hidden />
              {t('pos.success.pointsEarned', { points: result.pointsEarned })}
            </p>
          )}
          {printState.status === 'printing' && <p className="type-body-sm text-fg-muted">{t('common.states.printing')}</p>}
          {printState.status === 'printed' && (
            <p className="flex items-center gap-1.5 type-body-sm text-success-text">
              <CircleCheckBig size={16} aria-hidden />
              {printState.message}
            </p>
          )}
          {printState.status === 'failed' && (
            <div role="alert" className="w-full rounded-xl border border-warning/40 bg-warning-soft p-4 text-start">
              <p className="flex items-center gap-2 font-semibold text-warning-text">
                <TriangleAlert size={18} aria-hidden />
                {t('pos.success.printFailed')}
              </p>
              {printState.message && <p className="type-body-sm mt-1 text-fg-muted">{printState.message}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={Printer} onClick={() => void printReceipt(result.saleId, true)}>
                  {t('pos.success.retryPrint')}
                </Button>
                <Button size="sm" icon={Eye} onClick={() => void printReceipt(result.saleId, true, true)}>
                  {t('pos.success.viewReceipt')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPrintState({ status: 'idle' })}>
                  {t('pos.success.later')}
                </Button>
              </div>
            </div>
          )}
          <div className="flex w-full flex-col gap-2">
            <Button ref={newSaleRef} size="xl" variant="primary" icon={Check} onClick={finish} shortcut="Enter" fullWidth>
              {t('pos.success.newSale')}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" icon={Printer} onClick={() => void printReceipt(result.saleId)} shortcut="P">
                {t('pos.success.printReceipt')}
              </Button>
              <Button
                size="lg"
                icon={ReceiptText}
                onClick={() => {
                  finish();
                  navigate(`/sales/${result.saleId}`);
                }}
              >
                {t('pos.success.viewSale')}
              </Button>
            </div>
          </div>
          <p className="type-caption text-fg-subtle">{t('pos.success.newSaleHint')}</p>
        </div>
      </Modal>
    );
  }

  /* ------------------------------ Payment view ------------------------------ */
  const errorMessage = breakdown.errors.includes('nonCashExceedsDue')
    ? t('pos.payment.nonCashExceeds')
    : breakdown.errors.includes('missingReference')
      ? t('pos.payment.missingReference')
      : breakdown.errors.includes('pointsExceedBalance') || breakdown.errors.includes('pointsExceedLimit')
        ? t('pos.payment.pointsProblem')
        : breakdown.errors.includes('invalidAmount')
          ? t('pos.payment.invalidAmount')
          : breakdown.errors.includes('insufficient') || breakdown.errors.includes('noPayment')
            ? t('pos.payment.insufficient')
            : null;

  const methodButtons: PaymentMethod[] = [...enabledMethods, ...(customer && business.loyalty.enabled ? (['points'] as const) : [])];

  return (
    <Modal
      open
      onClose={() => phase === 'pay' && close()}
      dismissible={phase === 'pay'}
      size="xl"
      title={t('pos.payment.title')}
      description={customer ? t('pos.payment.customerLine', { name: customer.name }) : undefined}
      closeLabel={t('common.actions.close')}
      bodyClassName="p-0"
    >
      <div className="grid min-h-[30rem] grid-cols-1 lg:grid-cols-[1fr_22rem]">
        {/* Left: payment lines */}
        <div className="flex min-w-0 flex-col gap-4 p-6">
          <div className="flex items-baseline justify-between rounded-xl bg-surface-2 px-5 py-4">
            <span className="type-h3 text-fg-muted">{t('pos.payment.due')}</span>
            <span className="type-display text-fg tnum">{format.money(due)}</span>
          </div>

          <ul className="flex flex-col gap-3">
            {lines.map((line) => {
              const active = line.id === activeLine.id;
              const Icon = METHOD_ICONS[line.method];
              return (
                <li
                  key={line.id}
                  onClick={() => setActiveId(line.id)}
                  className={cn('rounded-xl border p-3 transition-base', active ? 'border-primary bg-primary-soft/30 ring-1 ring-primary/40' : 'border-border bg-surface')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-1.5" role="radiogroup" aria-label={t('common.labels.method')}>
                      {methodButtons.map((method) => {
                        const MethodIcon = METHOD_ICONS[method];
                        const selected = line.method === method;
                        return (
                          <button
                            key={method}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={method === 'points' && pointsLimit <= 0}
                            onClick={() => {
                              setActiveId(line.id);
                              if (line.id === activeLine.id) setMethod(method);
                              else updateLine(line.id, { method, provider: method === 'mobile' ? 'bkash' : method === 'card' ? 'visa' : null });
                            }}
                            className={cn(
                              'flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-base disabled:opacity-40',
                              selected ? 'border-primary bg-primary text-primary-fg' : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
                            )}
                          >
                            <MethodIcon size={17} aria-hidden />
                            {t(`pos.payment.methods.${method}`)}
                          </button>
                        );
                      })}
                    </div>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(line.id)} aria-label={t('pos.payment.removeLine')} className="ms-auto flex h-10 w-10 items-center justify-center rounded-lg text-fg-subtle hover:bg-danger-soft hover:text-danger-text">
                        <Trash2 size={17} aria-hidden />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="relative min-w-48 flex-1">
                      <Icon size={20} aria-hidden className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                      <input
                        ref={(node) => {
                          if (node) inputRefs.current.set(line.id, node);
                          else inputRefs.current.delete(line.id);
                        }}
                        data-autofocus={line.id === lines[0].id ? true : undefined}
                        inputMode="decimal"
                        aria-label={t('pos.payment.amount')}
                        value={line.amountText}
                        onFocus={(event) => {
                          setActiveId(line.id);
                          event.currentTarget.select();
                        }}
                        onChange={(event) => updateLine(line.id, { amountText: event.target.value.replace(/[^\d.০-৯]/g, '') })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                            event.preventDefault();
                            void complete();
                          }
                        }}
                        className="h-14 w-full rounded-lg border-2 border-border bg-surface-2 ps-11 pe-3 text-end text-2xl font-bold text-fg tnum focus:border-primary focus:outline-none"
                      />
                    </div>
                    {line.method === 'mobile' && (
                      <select
                        aria-label={t('pos.payment.provider')}
                        value={line.provider ?? 'bkash'}
                        onChange={(event) => updateLine(line.id, { provider: event.target.value as MobileProvider })}
                        className="h-14 rounded-lg border border-border bg-surface-2 px-3 font-semibold text-fg"
                      >
                        {(Object.keys(business.payment.mobileProviders) as MobileProvider[])
                          .filter((provider) => business.payment.mobileProviders[provider])
                          .map((provider) => (
                            <option key={provider} value={provider}>
                              {t(`enums.mobileProvider.${provider}`)}
                            </option>
                          ))}
                      </select>
                    )}
                    {line.method === 'card' && (
                      <select
                        aria-label={t('pos.payment.cardNetwork')}
                        value={line.provider ?? 'visa'}
                        onChange={(event) => updateLine(line.id, { provider: event.target.value as CardNetwork })}
                        className="h-14 rounded-lg border border-border bg-surface-2 px-3 font-semibold text-fg"
                      >
                        {(['visa', 'mastercard', 'amex', 'unionpay', 'other'] as CardNetwork[]).map((network) => (
                          <option key={network} value={network}>
                            {t(`enums.cardNetwork.${network}`)}
                          </option>
                        ))}
                      </select>
                    )}
                    {(line.method === 'card' || line.method === 'mobile') && (
                      <input
                        aria-label={line.method === 'card' ? t('pos.payment.cardReference') : t('pos.payment.mobileReference')}
                        placeholder={line.method === 'card' ? t('pos.payment.cardReference') : t('pos.payment.mobileReference')}
                        value={line.reference}
                        maxLength={line.method === 'card' ? 4 : 24}
                        onChange={(event) => updateLine(line.id, { reference: event.target.value })}
                        className="h-14 w-40 rounded-lg border border-border bg-surface-2 px-3 font-mono text-fg focus:border-primary focus:outline-none"
                      />
                    )}
                  </div>
                  {line.method === 'points' && customer && (
                    <p className="type-caption mt-2 text-fg-muted">
                      {t('pos.payment.pointsAvailable', { points: customer.loyaltyPoints, amount: format.money(customer.loyaltyPoints * business.loyalty.pointValue) })} ·{' '}
                      {t('pos.payment.pointsMax', { amount: format.money(pointsLimit) })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button icon={Plus} onClick={() => addLine()}>
              {t('pos.payment.addMethod')}
            </Button>
            {customer && pointsLimit > 0 && !lines.some((line) => line.method === 'points') && (
              <Button icon={Gift} variant="soft" onClick={() => addLine('points')}>
                {t('pos.payment.pointsUse')}
              </Button>
            )}
          </div>

          <div>
            <p className="type-label mb-2 text-fg-muted">{t('pos.payment.quickCash')}</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              <button type="button" onClick={setExact} className="h-12 rounded-lg border border-primary/50 bg-primary-soft text-sm font-bold text-primary-soft-fg transition-base hover:brightness-110">
                {t('pos.payment.exact')}
              </button>
              {quickCash.map((amount) => (
                <button key={amount} type="button" onClick={() => setQuickCash(amount)} className="h-12 rounded-lg border border-border bg-surface-2 text-sm font-bold text-fg transition-base hover:bg-surface-3 tnum">
                  {format.money(amount)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: summary + keypad + complete */}
        <aside className="flex flex-col gap-4 border-t border-border bg-surface-2/50 p-6 lg:border-t-0 lg:border-s">
          <div className="flex flex-col gap-2 text-[0.95rem]">
            <div className="flex justify-between text-fg-muted">
              <span>{t('pos.payment.due')}</span>
              <span className="font-semibold text-fg tnum">{format.money(due)}</span>
            </div>
            <div className="flex justify-between text-fg-muted">
              <span>{t('pos.payment.received')}</span>
              <span className="font-semibold text-fg tnum">{format.money(breakdown.tendered)}</span>
            </div>
            {entries.length > 1 && (
              <ul className="ms-3 flex flex-col gap-1 border-s border-border ps-3 text-sm">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex justify-between text-fg-subtle">
                    <span>{t(`pos.payment.methods.${entry.method}`)}</span>
                    <span className="tnum">{format.money(entry.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 border-t border-border pt-3">
              {breakdown.remaining > 0 ? (
                <div className="flex items-baseline justify-between">
                  <span className="type-h3 text-danger-text">{t('pos.payment.remaining')}</span>
                  <span className="text-3xl font-extrabold text-danger-text tnum">{format.money(breakdown.remaining)}</span>
                </div>
              ) : (
                <div className="flex items-baseline justify-between">
                  <span className="type-h3 text-fg-muted">{t('pos.payment.change')}</span>
                  <span className={cn('text-3xl font-extrabold tnum', breakdown.change > 0 ? 'text-primary' : 'text-fg')}>{format.money(breakdown.change)}</span>
                </div>
              )}
            </div>
          </div>

          {showKeypad && (
            <NumericKeypad
              backLabel={t('common.actions.remove')}
              onKey={(key) => {
                updateLine(activeLine.id, { amountText: applyKeypadKey(activeLine.amountText === amountToText(due) && lines.length === 1 && key !== 'back' ? '' : activeLine.amountText, key, 2, 9) });
              }}
            />
          )}

          {errorMessage && breakdown.tendered > 0 && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger-text">
              <X size={16} aria-hidden className="mt-0.5 shrink-0" />
              {errorMessage}
            </p>
          )}

          <button
            type="button"
            disabled={!canComplete}
            onClick={() => void complete()}
            className="mt-auto flex h-16 w-full items-center justify-center gap-3 rounded-xl bg-primary text-xl font-bold text-primary-fg shadow-glow transition-base hover:bg-primary-hover active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
          >
            {phase === 'saving' ? t('pos.payment.completing') : t('pos.payment.complete')}
            <Kbd tone="onPrimary">{displayCombo(completeShortcut)}</Kbd>
          </button>
        </aside>
      </div>
    </Modal>
  );
}
