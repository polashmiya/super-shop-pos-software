import { Boxes, X } from 'lucide-react';
import { pick, useLanguage, useT, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/Button';
import { Checkbox, SegmentedControl, Select, type SelectOption } from '@/components/ui/Controls';
import { PeriodPicker } from '@/components/ui/PeriodPicker';
import type { FilterChoice, FilterDirectory } from './filterOptions';
import { periodsOf } from './period';
import type { FilterKey, ReportDefinition, ReportExtraFilters } from './types';
import { CASH_TYPES, clearFiltersPatch, CUSTOMER_TYPES, MOVEMENT_TYPES, PAYMENT_METHODS, periodPatch, type ReportPatch, type ReportState } from './useReportState';

/* ==========================================================================
   The single filter row of a report: period (or "current stock"), only the
   filters this report supports, compare-with-previous and clear.
   ========================================================================== */

interface ReportFiltersProps {
  definition: ReportDefinition;
  state: ReportState;
  directory: FilterDirectory | undefined;
  snapshotText: string;
  onChange: (patch: ReportPatch) => void;
}

type ListKey = Extract<FilterKey, 'cashier' | 'counter' | 'category' | 'brand' | 'supplier'>;

const LISTS: Record<ListKey, { all: TranslationKey; label: TranslationKey; list: keyof FilterDirectory }> = {
  cashier: { all: 'reports.filters.allCashiers', label: 'reports.filters.cashier', list: 'cashiers' },
  counter: { all: 'reports.filters.allCounters', label: 'reports.filters.counter', list: 'counters' },
  category: { all: 'reports.filters.allCategories', label: 'reports.filters.category', list: 'categories' },
  brand: { all: 'reports.filters.allBrands', label: 'reports.filters.brand', list: 'brands' },
  supplier: { all: 'reports.filters.allSuppliers', label: 'reports.filters.supplier', list: 'suppliers' },
};

const ENUMS = {
  customerType: { all: 'reports.filters.allCustomerTypes', label: 'reports.filters.customerType', values: CUSTOMER_TYPES, group: 'customerType' },
  paymentMethod: { all: 'reports.filters.allPaymentMethods', label: 'reports.filters.paymentMethod', values: PAYMENT_METHODS, group: 'paymentMethod' },
  movementType: { all: 'reports.filters.allMovementTypes', label: 'reports.filters.movementType', values: MOVEMENT_TYPES, group: 'movementType' },
  cashType: { all: 'reports.filters.allCashTypes', label: 'reports.filters.cashType', values: CASH_TYPES, group: 'cashMovement' },
} as const satisfies Record<string, { all: TranslationKey; label: TranslationKey; values: readonly string[]; group: string }>;

type EnumKey = keyof typeof ENUMS;

function isListKey(key: FilterKey): key is ListKey {
  return key in LISTS;
}

function isEnumKey(key: FilterKey): key is EnumKey {
  return key in ENUMS;
}

export function ReportFilters({ definition, state, directory, snapshotText, onChange }: ReportFiltersProps) {
  const t = useT();
  const language = useLanguage();

  const currentValue = (key: ListKey | EnumKey): string => {
    const { filter, extra } = state;
    switch (key) {
      case 'cashier':
        return filter.cashierId;
      case 'counter':
        return filter.counterId;
      case 'category':
        return filter.categoryId;
      case 'brand':
        return filter.brandId;
      case 'supplier':
        return filter.supplierId;
      case 'paymentMethod':
        return filter.paymentMethod;
      default:
        return extra[key];
    }
  };

  const listOptions = (key: ListKey): SelectOption[] => {
    const choices: FilterChoice[] = directory?.[LISTS[key].list] ?? [];
    const options = [{ value: 'all', label: t(LISTS[key].all) }, ...choices.map((choice) => ({ value: choice.id, label: pick(choice.name, language) }))];
    const value = currentValue(key);
    // Keep the chosen value selectable while the lists are still loading.
    return options.some((option) => option.value === value) ? options : [...options, { value, label: '…' }];
  };

  const enumOptions = (key: EnumKey): SelectOption[] => [
    { value: 'all', label: t(ENUMS[key].all) },
    ...ENUMS[key].values.map((value) => ({ value, label: t(`enums.${ENUMS[key].group}.${value}` as TranslationKey) })),
  ];

  const selects = definition.filters.filter((key) => key !== 'search' && key !== 'rankBy');

  return (
    <div role="search" aria-label={t('reports.view.filtersLabel')} className="flex flex-wrap items-center gap-2">
      {definition.period === 'range' ? (
        <PeriodPicker key={state.period} period={state.period} range={state.range} periods={periodsOf(definition)} onChange={(period, custom) => onChange(periodPatch(period, custom))} />
      ) : (
        <span className="inline-flex min-h-touch items-center gap-2 rounded-md border border-border bg-surface-2 px-3 text-sm text-fg-muted">
          <Boxes size={16} aria-hidden />
          {snapshotText}
        </span>
      )}
      {selects.map((key) => {
        const options = isListKey(key) ? listOptions(key) : isEnumKey(key) ? enumOptions(key) : [];
        const label = isListKey(key) ? LISTS[key].label : isEnumKey(key) ? ENUMS[key].label : null;
        if (!label) return null;
        return (
          <div key={key} className="w-48">
            <Select aria-label={t(label)} value={currentValue(key as ListKey | EnumKey)} options={options} onChange={(value) => onChange({ [key]: value })} />
          </div>
        );
      })}
      {definition.filters.includes('rankBy') && (
        <SegmentedControl<ReportExtraFilters['rankBy']>
          ariaLabel={t('reports.filters.rankBy')}
          value={state.extra.rankBy}
          options={[
            { value: 'amount', label: t('reports.filters.rankAmount') },
            { value: 'quantity', label: t('reports.filters.rankQuantity') },
          ]}
          onChange={(value) => onChange({ rankBy: value === 'amount' ? null : value })}
        />
      )}
      {definition.compare && definition.period === 'range' && (
        <div className="flex min-h-touch items-center px-1">
          <Checkbox checked={state.compare} onChange={(checked) => onChange({ compare: checked ? null : '0' })} label={t('reports.view.compare')} />
        </div>
      )}
      {state.filtered && (
        <Button variant="ghost" icon={X} onClick={() => onChange(clearFiltersPatch())}>
          {t('reports.filters.clear')}
        </Button>
      )}
    </div>
  );
}
