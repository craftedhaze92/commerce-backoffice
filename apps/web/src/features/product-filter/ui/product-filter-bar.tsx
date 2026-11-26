'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { PRODUCT_LIMITS, ProductStatus } from '@bo/contracts';
import { useCategories } from '@/entities/category';
import { PRODUCT_STATUS_LABEL, type ProductListParams } from '@/entities/product';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Toggle } from '@/shared/ui/toggle';
import type { ProductListPatch } from '../model/product-list-params';

const SEARCH_DEBOUNCE_MS = 300;
const ALL = 'all';
export const PRICE_RANGE_ERROR = '최소 가격이 최대 가격보다 클 수 없습니다';
const PRICE_INVALID_ERROR = `가격은 0 이상 ${PRODUCT_LIMITS.maxPrice.toLocaleString('ko-KR')} 이하의 정수여야 합니다`;

interface ProductFilterBarProps {
  params: ProductListParams;
  onChange: (patch: ProductListPatch) => void;
}

export function ProductFilterBar({ params, onChange }: ProductFilterBarProps) {
  const categories = useCategories();
  // 초기화 시 SearchInput을 다시 마운트해 입력 중인 글자와 대기 중인 디바운스를 함께 버린다
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="flex flex-wrap items-start gap-3">
      <SearchInput key={resetKey} q={params.q} onCommit={(q) => onChange({ q })} />
      <Select
        value={params.categoryId ?? ALL}
        onValueChange={(v) => onChange({ categoryId: v === ALL ? undefined : v })}
      >
        <SelectTrigger aria-label="카테고리" className="w-40">
          <SelectValue placeholder="카테고리">
            {params.categoryId === undefined
              ? '전체'
              : (categories.data?.find((c) => c.id === params.categoryId)?.name ?? (
                  <Skeleton aria-hidden className="h-4 w-14" />
                ))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체</SelectItem>
          {categories.data?.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.status ?? ALL}
        onValueChange={(v) => onChange({ status: v === ALL ? undefined : (v as ProductStatus) })}
      >
        <SelectTrigger aria-label="상태" className="w-32">
          <SelectValue placeholder="상태">
            {params.status === undefined ? '전체' : PRODUCT_STATUS_LABEL[params.status]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체</SelectItem>
          {Object.values(ProductStatus).map((s) => (
            <SelectItem key={s} value={s}>
              {PRODUCT_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PriceRange
        min={params.minPrice}
        max={params.maxPrice}
        onCommit={(patch) => onChange(patch)}
      />
      <Toggle
        className="bg-canvas"
        pressed={params.lowStock}
        onPressedChange={(pressed) => onChange({ lowStock: pressed })}
        aria-label="재고 부족만"
      >
        재고 부족만
      </Toggle>
      <Button
        variant="ghost"
        onClick={() => {
          setResetKey((k) => k + 1);
          onChange({
            q: '',
            categoryId: undefined,
            status: undefined,
            minPrice: undefined,
            maxPrice: undefined,
            lowStock: false,
          });
        }}
      >
        초기화
      </Button>
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
      aria-label="상품 검색"
      placeholder="상품명 또는 SKU"
      className="w-56"
      value={text}
      maxLength={50}
      onChange={(e) => setText(e.target.value)}
    />
  );
}

function parsePrice(raw: string): number | undefined | 'invalid' {
  const t = raw.trim();
  if (t === '') return undefined;
  if (!/^\d+$/.test(t)) return 'invalid';
  const n = Number(t);
  return n > PRODUCT_LIMITS.maxPrice ? 'invalid' : n;
}

interface PriceRangeProps {
  min: number | undefined;
  max: number | undefined;
  onCommit: (patch: ProductListPatch) => void;
}

function PriceRange({ min, max, onCommit }: PriceRangeProps) {
  const errorId = useId();
  const [minText, setMinText] = useState(min?.toString() ?? '');
  const [maxText, setMaxText] = useState(max?.toString() ?? '');
  const [seenMin, setSeenMin] = useState(min);
  const [seenMax, setSeenMax] = useState(max);
  const [error, setError] = useState<string | null>(null);

  // URL이 바깥에서 바뀌면(초기화 등) 입력창을 맞춘다
  if (min !== seenMin) {
    setSeenMin(min);
    setMinText(min?.toString() ?? '');
    setError(null);
  }
  if (max !== seenMax) {
    setSeenMax(max);
    setMaxText(max?.toString() ?? '');
    setError(null);
  }

  function commit(key: 'minPrice' | 'maxPrice') {
    const lo = parsePrice(minText);
    const hi = parsePrice(maxText);
    if (lo === 'invalid' || hi === 'invalid') {
      setError(PRICE_INVALID_ERROR);
      return;
    }
    if (lo !== undefined && hi !== undefined && lo > hi) {
      setError(PRICE_RANGE_ERROR);
      return;
    }
    setError(null);
    const next = key === 'minPrice' ? lo : hi;
    const current = key === 'minPrice' ? min : max;
    if (next !== current) onCommit({ [key]: next });
  }

  const onEnter = (key: 'minPrice' | 'maxPrice') => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(key);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          aria-label="최소 가격"
          placeholder="최소 가격"
          className="w-28"
          value={minText}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setMinText(e.target.value)}
          onBlur={() => commit('minPrice')}
          onKeyDown={onEnter('minPrice')}
        />
        <span aria-hidden className="text-muted-foreground">
          ~
        </span>
        <Input
          inputMode="numeric"
          aria-label="최대 가격"
          placeholder="최대 가격"
          className="w-28"
          value={maxText}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setMaxText(e.target.value)}
          onBlur={() => commit('maxPrice')}
          onKeyDown={onEnter('maxPrice')}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
