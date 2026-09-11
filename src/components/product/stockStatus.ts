import { CircleCheck, CircleSlash, CircleX, Clock, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { StockStatus } from '@/types';
import type { Tone } from '@/components/ui/Display';

/** Stock status → colour + icon (always shown with its text label). */
export function stockStatusBadge(status: StockStatus): { tone: Tone; icon: LucideIcon } {
  switch (status) {
    case 'in_stock':
      return { tone: 'success', icon: CircleCheck };
    case 'low_stock':
      return { tone: 'warning', icon: TriangleAlert };
    case 'out_of_stock':
      return { tone: 'danger', icon: CircleX };
    case 'expiring':
      return { tone: 'warning', icon: Clock };
    case 'inactive':
    default:
      return { tone: 'neutral', icon: CircleSlash };
  }
}
