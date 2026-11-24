'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ORDER_LIMITS, OrderStatus } from '@bo/contracts';
import { ORDER_STATUS_LABEL, type OrderListParams } from '@/entities/order';
import { kstPreset, type KstPresetKind } from '@/shared/lib/date-range';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { OrderListPatch } from '../model/order-list-params';

const SEARCH_DEBOUNCE_MS = 300;
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
  // 초기화 시 SearchInput을 다시 마운트해 입력 중인 글자와 대기 중인 디바운스를 함께 버린다
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <StatusTabs status={params.status} onChange={(status) => onChange({ status })} />
      <div className="flex flex-wrap items-start gap-3">
        <SearchInput key={resetKey} q={params.q} onCommit={(q) => onChange({ q })} />
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
    <div role="tablist" aria-label="주문 상태" className="flex flex-wrap gap-1 border-b">
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
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              selected
                ? 'border-primary text-foreground'
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

/**
 * 입력 중인 글자는 컴포넌트가 들고 있고, 300ms 멈추면 한 번만 URL에 쓴다.
 * URL 값이 바뀌었을 때 그것이 방금 우리가 쓴 값이 아닐 때만(예: 초기화) 입력창을 맞춘다.
 */
function SearchInput({ q, onCommit }: { q: string; onCommit: (q: string) => void }) {
  const [text, setText] = useState(q);
  const [committed, setCommitted] = useState(q);
  const [seenUrlQ, setSeenUrlQ] = useState(q);

  if (q !== seenUrlQ) {
    setSeenUrlQ(q);
    if (q !== committed) {
      setCommitted(q);
      setText(q);
    }
  }

  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  useEffect(() => {
    if (text === committed) return;
    const timer = setTimeout(() => {
      setCommitted(text);
      onCommitRef.current(text);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, committed]);

  return (
    <Input
      type="search"
      aria-label="주문 검색"
      placeholder="주문번호 또는 고객명"
      className="w-56"
      value={text}
      maxLength={ORDER_LIMITS.qMax}
      onChange={(e) => setText(e.target.value)}
    />
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

  function change(key: 'from' | 'to', value: string) {
    const next = value === '' ? undefined : value;
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
        <Input
          type="date"
          aria-label="시작일"
          className="w-40"
          value={from ?? ''}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => change('from', e.target.value)}
        />
        <span aria-hidden className="text-muted-foreground">
          ~
        </span>
        <Input
          type="date"
          aria-label="종료일"
          className="w-40"
          value={to ?? ''}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => change('to', e.target.value)}
        />
        {PRESETS.map((p) => {
          const range = kstPreset(p.kind);
          const active = from === range.from && to === range.to;
          return (
            <Button
              key={p.kind}
              variant={active ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={active}
              onClick={() => onCommit(range)}
            >
              {p.label}
            </Button>
          );
        })}
        <Button
          variant={!from && !to ? 'secondary' : 'outline'}
          size="sm"
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
