import type { Language } from '@/types/common';
import type { en } from './en';

export type { Language };

/** Same shape as the English dictionary with every leaf widened to string. */
export type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type StripPlural<K extends string> = K extends `${infer Base}_one` ? Base : K extends `${infer Base}_other` ? Base : K;

export type Dictionary = typeof en;

/** Every translation key, e.g. "pos.payNow". Plural keys are used without the _one/_other suffix. */
export type TranslationKey = StripPlural<Leaves<Dictionary>>;

export type TranslationParams = Record<string, string | number>;

export type Translate = (key: TranslationKey, params?: TranslationParams) => string;
