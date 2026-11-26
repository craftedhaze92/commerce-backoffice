'use client';

import { useId, useState } from 'react';
import { ORDER_LIMITS, OrderStatus } from '@bo/contracts';
import { ORDER_STATUS_LABEL, type OrderListParams } from '@/entities/order';
import { kstPreset, kstToday, type KstPresetKind } from '@/shared/lib/date-range';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SearchButton, SearchField } from '@/shared/ui/search-field';
import { DatePicker } from '@/shared/ui/date-picker';
import type { OrderListPatch } from '../model/order-list-params';

export const DATE_RANGE_ERROR = '시작일이 종료일보다 늦을 수 없습니다';

const PRESETS: { kind: KstPresetKind; label: string }[] = [
  { kind: 'today', label: '오늘' },
  { kind: '7d', label: '최근 7일' },
  { kind: '30d', label: '최근 30일' },
];

interface OrderFilterBarProps {
  params: OrderListParams;
  onChange: (patch: OrderListPatch) => void;
}

export function OrderFilterBar({ params, onChange }: OrderFilterBarProps) {
  // 초기화 시 검색 입력을 다시 마운트해 제출하지 않은 글자도 함께 버린다
  const [resetKey, setResetKey] = useState(0);
  const searchFormId = useId();

  return (
    <div className="flex flex-col gap-3">
      <StatusTabs status={params.status} onChange={(status) => onChange({ status })} />
      <div className="flex flex-wrap items-start gap-2">
        <SearchField
          formId={searchFormId}
          key={resetKey}
          value={params.q}
          onSearch={(q) => onChange({ q })}
          label="주문 검색"
          placeholder="주문번호 또는 고객명"
          maxLength={ORDER_LIMITS.qMax}
        />
        <DateRange from={params.from} to={params.to} onCommit={onChange} />
        <Button
          variant="ghost"
          onClick={() => {
            setResetKey((k) => k + 1);
            onChange({ q: '', status: undefined, from: undefined, to: undefined });
          }}
        >
          초기화
        </Button>
        <SearchButton form={searchFormId} />
      </div>
    </div>
  );
}

function StatusTabs({
  status,
  onChange,
}: {
  status: OrderStatus | undefined;
  onChange: (status: OrderStatus | undefined) => void;
}) {
  const tabs: { value: OrderStatus | undefined; label: string }[] = [
    { value: undefined, label: '전체' },
    ...Object.values(OrderStatus).map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
  ];
  return (
    <div
      role="tablist"
      aria-label="주문 상태"
      className="border-canvas flex flex-wrap gap-5 border-b-2"
    >
      {tabs.map((t) => {
        const selected = t.value === status;
        return (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-0.5 border-b-2 py-3 text-[17px] font-semibold transition-colors',
              selected
                ? 'border-foreground text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

interface DateRangeProps {
  from: string | undefined;
  to: string | undefined;
  onCommit: (patch: OrderListPatch) => void;
}

function DateRange({ from, to, onCommit }: DateRangeProps) {
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState({ from, to });

  // URL이 바깥에서 바뀌면(프리셋·초기화) 에러를 걷는다
  if (seen.from !== from || seen.to !== to) {
    setSeen({ from, to });
    setError(null);
  }

  // 미래 날짜는 아직 주문이 없으므로 달력에서 고를 수 없게 한다(KST 기준 오늘까지)
  const today = kstToday();

  function change(key: 'from' | 'to', next: string | undefined) {
    const lo = key === 'from' ? next : from;
    const hi = key === 'to' ? next : to;
    if (lo && hi && lo > hi) {
      setError(DATE_RANGE_ERROR);
      return;
    }
    setError(null);
    onCommit({ [key]: next });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          label="시작일"
          placeholder="시작일"
          value={from}
          max={to ?? today}
          invalid={error !== null}
          describedBy={error ? errorId : undefined}
          onChange={(v) => change('from', v)}
        />
        <span aria-hidden className="text-muted-foreground">
          ~
        </span>
        <DatePicker
          label="종료일"
          placeholder="종료일"
          value={to}
          min={from}
          max={today}
          invalid={error !== null}
          describedBy={error ? errorId : undefined}
          onChange={(v) => change('to', v)}
        />
        {PRESETS.map((p) => {
          const range = kstPreset(p.kind);
          const active = from === range.from && to === range.to;
          return (
            <Button
              key={p.kind}
              variant={active ? 'weak' : 'secondary'}
              aria-pressed={active}
              onClick={() => onCommit(range)}
            >
              {p.label}
            </Button>
          );
        })}
        <Button
          variant={!from && !to ? 'weak' : 'secondary'}
          aria-pressed={!from && !to}
          onClick={() => onCommit({ from: undefined, to: undefined })}
        >
          전체
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
