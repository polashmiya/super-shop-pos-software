import { Boxes, Landmark, Receipt, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { ReportGroup } from './types';

/** Icon and tint of each report group in the library (tokens only). */
export const GROUP_ICON: Record<ReportGroup, LucideIcon> = {
  sales: Receipt,
  products: Boxes,
  people: Users,
  finance: Landmark,
  operations: Wallet,
};

export const GROUP_TONE: Record<ReportGroup, string> = {
  sales: 'bg-primary-soft text-primary-soft-fg',
  products: 'bg-info-soft text-info-text',
  people: 'bg-success-soft text-success-text',
  finance: 'bg-warning-soft text-warning-text',
  operations: 'bg-surface-3 text-fg-muted',
};
