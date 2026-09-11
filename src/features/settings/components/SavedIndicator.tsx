import { useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/components/ui/cn';
import { useSaveStatus } from '../saveStatus';

const VISIBLE_MS = 1_800;

/** Calm "Saved" confirmation in the page header after every change (instead of toasts). */
export function SavedIndicator() {
  const t = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useSaveStatus.subscribe((state, previous) => {
      if (state.savedAt === previous.savedAt) return;
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-base',
        visible ? 'bg-success-soft text-success-text opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {visible && (
        <>
          <CircleCheck size={16} aria-hidden />
          {t('settings.saved')}
        </>
      )}
    </span>
  );
}
