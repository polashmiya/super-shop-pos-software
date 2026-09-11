import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Eye, LockKeyhole, LogOut, LockOpen } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { useT } from '@/i18n';
import { shiftService } from '@/services/shiftService';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useShiftStore } from '@/stores/shiftStore';
import { requestApproval, toast } from '@/stores/uiStore';
import type { Money, Shift, ShiftTotals } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmStep, CountStep, DoneStep, ReviewStep, StepIndicator } from './CloseShiftSteps';
import { ShiftPrintMenu } from './ShiftPrintMenu';
import { countValue, emptyCount, type CashCountState, type CloseStep } from './cashMeta';

interface CloseShiftModalProps {
  shift: Shift;
  totals: ShiftTotals;
  heldCount: number;
  /** Blind count: the expected cash is not shown while counting. */
  hideExpected: boolean;
  onClose: () => void;
}

/** Count → review (over / short, note, approval) → confirm → closed summary with the Z report. */
export function CloseShiftModal({ shift, totals, heldCount, hideExpected, onClose }: CloseShiftModalProps) {
  const t = useT();
  const format = useFormat();
  const navigate = useNavigate();
  const limit = useSettingsStore((state) => state.business.shift.maxDifference);
  const [step, setStep] = useState<CloseStep>('count');
  const [count, setCount] = useState<CashCountState>(() => emptyCount());
  const [expected, setExpected] = useState<Money>(totals.expectedCash);
  const [note, setNote] = useState('');
  const [countError, setCountError] = useState<string | undefined>();
  const [noteError, setNoteError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Shift | null>(null);

  const actual = countValue(count) ?? 0;
  const difference = actual - expected;
  const needsApproval = step !== 'count' && shiftService.needsApproval(expected, actual);

  const toReview = async () => {
    const value = countValue(count);
    if (value === null || (count.mode === 'amount' && count.text.trim() === '')) {
      setCountError(t('cash.close.enterCount'));
      return;
    }
    setBusy(true);
    try {
      // Re-read the drawer so sales made while counting are included.
      const fresh = await shiftService.totals(shift);
      setExpected(fresh.expectedCash);
      setStep('review');
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const toConfirm = () => {
    if (difference !== 0 && !note.trim()) {
      setNoteError(t('cash.close.noteRequired'));
      return;
    }
    setStep('confirm');
  };

  const submit = async () => {
    let approvedBy: string | null = null;
    if (needsApproval) {
      const approver = await requestApproval({ permission: 'cash.manage', action: t('cash.close.approvalAction', { shift: shift.shiftNo, amount: format.money(difference, { signed: true }) }) });
      if (!approver) {
        toast.error('cash.close.approvalDeclined');
        return;
      }
      approvedBy = approver.name.en;
    }
    setBusy(true);
    try {
      const store = useShiftStore.getState();
      const result = store.shift?.id === shift.id ? await store.close(actual, note, approvedBy) : await shiftService.close(shift, actual, note, approvedBy);
      if (store.shift?.id !== shift.id) await store.load();
      setClosed(result);
      setStep('done');
    } catch (error) {
      toast.fromError(error);
    } finally {
      setBusy(false);
    }
  };

  const signOut = () => {
    onClose();
    void useAuthStore.getState().logout();
  };

  const footer =
    step === 'done' && closed ? (
      <>
        <Button variant="ghost" icon={LogOut} onClick={signOut}>
          {t('cash.close.signOut')}
        </Button>
        <Button icon={Eye} onClick={() => navigate(`/shift/${closed.id}`)}>
          {t('cash.common.viewShift')}
        </Button>
        <ShiftPrintMenu shift={closed} />
        <Button variant="primary" icon={LockOpen} onClick={onClose}>
          {t('cash.close.openNew')}
        </Button>
      </>
    ) : (
      <>
        {step === 'count' ? (
          <Button onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </Button>
        ) : (
          <Button icon={ArrowLeft} onClick={() => setStep(step === 'confirm' ? 'review' : 'count')} disabled={busy}>
            {t('common.actions.back')}
          </Button>
        )}
        {step === 'count' && (
          <Button variant="primary" iconRight={ArrowRight} loading={busy} onClick={() => void toReview()}>
            {t('common.actions.next')}
          </Button>
        )}
        {step === 'review' && (
          <Button variant="primary" iconRight={ArrowRight} onClick={toConfirm}>
            {t('common.actions.next')}
          </Button>
        )}
        {step === 'confirm' && (
          <Button variant="danger" icon={LockKeyhole} loading={busy} onClick={() => void submit()}>
            {t('cash.close.confirm')}
          </Button>
        )}
      </>
    );

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title={step === 'done' ? t('cash.close.doneTitle') : t('cash.close.title', { shift: shift.shiftNo })}
      closeLabel={t('common.actions.close')}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {step !== 'done' && <StepIndicator step={step} />}
        {step === 'count' && (
          <CountStep
            count={count}
            onCount={(next) => {
              setCount(next);
              setCountError(undefined);
            }}
            error={countError}
            heldCount={heldCount}
            expected={hideExpected ? null : expected}
          />
        )}
        {step === 'review' && (
          <ReviewStep
            expected={expected}
            actual={actual}
            note={note}
            onNote={(value) => {
              setNote(value);
              setNoteError(undefined);
            }}
            noteError={noteError}
            needsApproval={needsApproval}
            limit={limit}
          />
        )}
        {step === 'confirm' && <ConfirmStep shift={shift} expected={expected} actual={actual} note={note} needsApproval={needsApproval} />}
        {step === 'done' && closed && <DoneStep closed={closed} totals={closed.closingTotals ?? { ...totals, expectedCash: expected }} />}
      </div>
    </Modal>
  );
}
