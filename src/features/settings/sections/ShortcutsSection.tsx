import { useEffect, useState } from 'react';
import { Globe, Keyboard, Pencil, RotateCcw, ScanBarcode, X } from 'lucide-react';
import { displayCombo, eventToCombo, GLOBAL_ACTIONS, POS_ACTIONS } from '@/app/shortcuts';
import { DEFAULT_SHORTCUTS } from '@/config/defaults';
import { useT } from '@/i18n';
import type { ShortcutAction, ShortcutMap } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { Badge, Kbd } from '@/components/ui/Display';
import { IconButton } from '@/components/ui/IconButton';
import { Note, SettingsCard } from '../components/SettingsCard';
import { saveDevice, useDeviceGroup } from '../saveStatus';
import { findConflict, isModifierKey, isReservedCombo } from '../shortcutRules';

function setShortcut(action: ShortcutAction, combo: string): void {
  saveDevice({ shortcuts: { [action]: combo } as Partial<ShortcutMap> });
}

/** Re-bind every keyboard shortcut: press the new keys, with conflict and reserved-key checks. */
export default function ShortcutsSection() {
  const t = useT();
  const shortcuts = useDeviceGroup('shortcuts');
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [problem, setProblem] = useState<{ action: ShortcutAction; message: string } | null>(null);
  const actionLabel = (action: ShortcutAction) => t(`shell.shortcuts.actions.${action}`);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Capture every key while recording so global shortcuts do not fire.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (isModifierKey(event.key)) return;
      const combo = eventToCombo(event);
      const shown = displayCombo(combo);
      if (isReservedCombo(combo)) {
        setProblem({ action: recording, message: t('settings.shortcuts.reserved', { combo: shown }) });
        return;
      }
      const conflict = findConflict(shortcuts, recording, combo);
      if (conflict) {
        setProblem({ action: recording, message: t('settings.shortcuts.conflict', { combo: shown, action: t(`shell.shortcuts.actions.${conflict}`) }) });
        return;
      }
      setShortcut(recording, combo);
      setProblem(null);
      setRecording(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, shortcuts, t]);

  const start = (action: ShortcutAction) => {
    setProblem(null);
    setRecording(action);
  };

  const renderRow = (action: ShortcutAction) => {
    const combo = shortcuts[action];
    const modified = combo !== DEFAULT_SHORTCUTS[action];
    const active = recording === action;
    const error = problem?.action === action ? problem.message : null;
    return (
      <div key={action} data-setting={`shortcut-${action}`} className="setting-row -mx-3 rounded-lg px-3 py-2.5 transition-base data-[highlight=on]:bg-primary-soft data-[highlight=on]:ring-2 data-[highlight=on]:ring-primary/50">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 type-body font-medium text-fg">
              {actionLabel(action)}
              {modified && (
                <Badge tone="info" size="sm">
                  {t('settings.shortcuts.modified')}
                </Badge>
              )}
            </p>
            {error && (
              <p role="alert" className="type-caption mt-0.5 text-danger-text">
                {error}
              </p>
            )}
          </div>
          <div
            aria-live="polite"
            className={cn('flex min-h-10 min-w-32 items-center justify-center rounded-md border px-3', active ? 'animate-pulse border-primary bg-primary-soft text-primary-soft-fg' : 'border-border bg-surface-2')}
          >
            {active ? <span className="text-sm font-medium">{t('settings.shortcuts.recording')}</span> : combo ? <Kbd>{displayCombo(combo)}</Kbd> : <span className="text-sm text-fg-subtle">{t('settings.shortcuts.none')}</span>}
          </div>
          {active ? (
            <Button size="sm" variant="ghost" onClick={() => setRecording(null)}>
              {t('common.actions.cancel')}
            </Button>
          ) : (
            <Button size="sm" icon={Pencil} aria-label={t('settings.shortcuts.changeLabel', { action: actionLabel(action) })} onClick={() => start(action)}>
              {t('settings.shortcuts.change')}
            </Button>
          )}
          <IconButton size="sm" icon={RotateCcw} label={t('settings.shortcuts.resetOne', { combo: displayCombo(DEFAULT_SHORTCUTS[action]) })} disabled={!modified || active} onClick={() => setShortcut(action, DEFAULT_SHORTCUTS[action])} />
          <IconButton size="sm" icon={X} label={t('settings.shortcuts.clear')} disabled={!combo || active} onClick={() => setShortcut(action, '')} />
        </div>
        {active && <p className="type-caption mt-1 text-fg-subtle">{t('settings.shortcuts.recordingHint')}</p>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard icon={Globe} title={t('settings.shortcuts.global')} description={t('settings.shortcuts.globalHint')}>
        {GLOBAL_ACTIONS.map(renderRow)}
      </SettingsCard>
      <SettingsCard icon={ScanBarcode} title={t('settings.shortcuts.pos')} description={t('settings.shortcuts.posHint')}>
        {POS_ACTIONS.map(renderRow)}
      </SettingsCard>
      <Note tone="neutral" icon={Keyboard}>
        {t('settings.shortcuts.tip')}
      </Note>
    </div>
  );
}
