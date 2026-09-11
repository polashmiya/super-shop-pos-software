import { toAsciiDigits, toBanglaDigits } from '@/domain/text';
import type { BasisPoints, IsoDateTime, Language, Money, NumeralSystem } from '@/types/common';
import type { CurrencySettings } from '@/types/settings';

/* ==========================================================================
   Formatting (money, numbers, quantities, percentages, dates). All UI text
   formatting goes through these functions so the numeral system, currency
   and language settings apply everywhere consistently.
   ========================================================================== */

export interface FormatOptions {
  language: Language;
  numerals: NumeralSystem;
  currency: CurrencySettings;
  clock: '12h' | '24h';
}

export interface MoneyFormatOptions {
  symbol?: boolean;
  decimals?: CurrencySettings['decimals'];
  signed?: boolean;
}

export interface Formatters {
  options: FormatOptions;
  digits(text: string): string;
  money(minor: Money, options?: MoneyFormatOptions): string;
  compactMoney(minor: Money): string;
  number(value: number, maxDecimals?: number): string;
  integer(value: number): string;
  quantity(value: number, unit?: string): string;
  percent(rate: BasisPoints, maxDecimals?: number): string;
  percentValue(value: number, maxDecimals?: number): string;
  date(iso: IsoDateTime | Date | null | undefined, style?: 'short' | 'medium' | 'long'): string;
  time(iso: IsoDateTime | Date | null | undefined, seconds?: boolean): string;
  dateTime(iso: IsoDateTime | Date | null | undefined): string;
  weekday(iso: IsoDateTime | Date): string;
  monthYear(iso: IsoDateTime | Date): string;
  relative(iso: IsoDateTime | Date | null | undefined, now?: Date): string;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function numberFormat(minimumFractionDigits: number, maximumFractionDigits: number): Intl.NumberFormat {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', { minimumFractionDigits, maximumFractionDigits });
    numberFormats.set(key, format);
  }
  return format;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

function toDate(value: IsoDateTime | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const COMPACT_UNITS: Record<Language, Array<[number, string]>> = {
  en: [
    [10_000_000, 'Cr'],
    [100_000, 'L'],
    [1_000, 'k'],
  ],
  bn: [
    [10_000_000, ' কোটি'],
    [100_000, ' লাখ'],
    [1_000, ' হাজার'],
  ],
};

export function createFormatters(options: FormatOptions): Formatters {
  const { language, numerals, currency } = options;
  const digits = (text: string): string => (numerals === 'bn' ? toBanglaDigits(text) : toAsciiDigits(text));
  const dateLocale = language === 'bn' ? 'bn-BD' : 'en-GB';
  const hour12 = options.clock === '12h';

  const withSymbol = (text: string, negative: boolean, signed: boolean): string => {
    const sign = negative ? '-' : signed ? '+' : '';
    return currency.position === 'before' ? `${sign}${currency.symbol}${text}` : `${sign}${text} ${currency.symbol}`;
  };

  const formatters: Formatters = {
    options,
    digits,
    money(minor, moneyOptions = {}) {
      const value = Math.abs(minor) / 100;
      const mode = moneyOptions.decimals ?? currency.decimals;
      const showDecimals = mode === 'always' || (mode === 'auto' && minor % 100 !== 0);
      const text = digits(numberFormat(showDecimals ? 2 : 0, showDecimals ? 2 : 0).format(mode === 'never' ? Math.round(value) : value));
      if (moneyOptions.symbol === false) return `${minor < 0 ? '-' : moneyOptions.signed && minor > 0 ? '+' : ''}${text}`;
      return withSymbol(text, minor < 0, Boolean(moneyOptions.signed) && minor > 0);
    },
    compactMoney(minor) {
      const value = Math.abs(minor) / 100;
      for (const [threshold, suffix] of COMPACT_UNITS[language]) {
        if (value >= threshold) {
          const scaled = value / threshold;
          const text = digits(numberFormat(0, scaled < 10 ? 1 : 0).format(scaled)) + suffix;
          return withSymbol(text, minor < 0, false);
        }
      }
      return withSymbol(digits(numberFormat(0, 0).format(value)), minor < 0, false);
    },
    number(value, maxDecimals = 2) {
      return digits(numberFormat(0, maxDecimals).format(value));
    },
    integer(value) {
      return digits(numberFormat(0, 0).format(Math.round(value)));
    },
    quantity(value, unit) {
      const text = digits(numberFormat(0, 3).format(value));
      return unit ? `${text} ${unit}` : text;
    },
    percent(rate, maxDecimals = 1) {
      return `${digits(numberFormat(0, maxDecimals).format(rate / 100))}%`;
    },
    percentValue(value, maxDecimals = 1) {
      return `${digits(numberFormat(0, maxDecimals).format(value))}%`;
    },
    date(iso, style = 'medium') {
      const date = toDate(iso);
      if (!date) return '—';
      const optionsByStyle: Record<string, Intl.DateTimeFormatOptions> = {
        short: { day: '2-digit', month: '2-digit', year: 'numeric' },
        medium: { day: 'numeric', month: 'short', year: 'numeric' },
        long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      };
      return digits(dateFormat(dateLocale, optionsByStyle[style]).format(date));
    },
    time(iso, seconds = false) {
      const date = toDate(iso);
      if (!date) return '—';
      return digits(dateFormat(dateLocale, { hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}), hour12 }).format(date));
    },
    dateTime(iso) {
      const date = toDate(iso);
      if (!date) return '—';
      return `${formatters.date(date)}, ${formatters.time(date)}`;
    },
    weekday(iso) {
      const date = toDate(iso);
      return date ? dateFormat(dateLocale, { weekday: 'short' }).format(date) : '';
    },
    monthYear(iso) {
      const date = toDate(iso);
      return date ? digits(dateFormat(dateLocale, { month: 'short', year: 'numeric' }).format(date)) : '';
    },
    relative(iso, now = new Date()) {
      const date = toDate(iso);
      if (!date) return '—';
      const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
      const words =
        language === 'bn'
          ? { now: 'এইমাত্র', m: 'মিনিট আগে', h: 'ঘণ্টা আগে', d: 'দিন আগে' }
          : { now: 'just now', m: 'min ago', h: 'h ago', d: 'd ago' };
      if (seconds < 45) return words.now;
      if (seconds < 3_600) return `${digits(String(Math.round(seconds / 60)))} ${words.m}`;
      if (seconds < 86_400) return `${digits(String(Math.round(seconds / 3_600)))} ${words.h}`;
      if (seconds < 7 * 86_400) return `${digits(String(Math.round(seconds / 86_400)))} ${words.d}`;
      return formatters.date(date);
    },
  };
  return formatters;
}
