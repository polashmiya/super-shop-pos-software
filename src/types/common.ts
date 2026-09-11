/** Primary keys are UUID strings (roles, permissions and units use stable codes). */
export type Id = string;

/** ISO-8601 timestamp with timezone offset, e.g. 2026-09-10T14:05:00.000+06:00 or …Z. */
export type IsoDateTime = string;

/** Calendar date, yyyy-mm-dd (local). */
export type IsoDate = string;

/** Money in integer minor units (1 taka = 100 poisha). Never a float. */
export type Money = number;

/** Rates and percentages in basis points: 1% = 100, 7.5% = 750. */
export type BasisPoints = number;

export type Language = 'bn' | 'en';

export type NumeralSystem = 'en' | 'bn';

/** Future synchronisation state of a record. Everything is 'local' today. */
export type SyncStatus = 'local' | 'pending' | 'synced' | 'error';

export interface BilingualText {
  bn: string;
  en: string;
}

/** Fields every synchronisable business entity carries. */
export interface EntityMeta {
  id: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  version: number;
  syncStatus: SyncStatus;
  deletedAt: IsoDateTime | null;
}

export type SortDirection = 'asc' | 'desc';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DateRange {
  /** Inclusive start. */
  from: IsoDateTime;
  /** Exclusive end. */
  to: IsoDateTime;
}
