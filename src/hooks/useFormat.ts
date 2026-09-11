import { useMemo } from 'react';
import { useI18nStore } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { createFormatters, type Formatters } from '@/utils/format';

/** Formatters (money, numbers, dates) bound to the current language, numerals and currency. */
export function useFormat(): Formatters {
  const language = useI18nStore((state) => state.language);
  const numerals = useI18nStore((state) => state.numerals);
  const currency = useSettingsStore((state) => state.business.currency);
  const clock = useSettingsStore((state) => state.device.locale.clock);
  return useMemo(() => createFormatters({ language, numerals, currency, clock }), [language, numerals, currency, clock]);
}

/** Formatters outside React (printing, exports). */
export function getFormatters(): Formatters {
  const { language, numerals } = useI18nStore.getState();
  const { business, device } = useSettingsStore.getState();
  return createFormatters({ language, numerals, currency: business.currency, clock: device.locale.clock });
}
