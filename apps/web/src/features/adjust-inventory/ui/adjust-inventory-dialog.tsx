'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { INVENTORY_LIMITS, type InsufficientStockItem } from '@bo/contracts';
import type { ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { FORM_FIELD, FORM_LABEL } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  adjustInventorySchema,
  type AdjustInventoryFormInput,
} from '../model/adjust-inventory-schema';
import { useAdjustInventory } from '../model/use-adjust-inventory';

const DEFAULTS: AdjustInventoryFormInput = { mode: 'in', amount: '', note: '' };
const GENERIC_ERROR = '재고를 조정하지 못했습니다';

interface AdjustInventoryDialogProps {
  productId: string;
  currentStock: number;
  /** 조정이 성공했을 때 호출한다(예: 재고 이력을 첫 페이지로 되돌린다). */
  onAdjusted?: () => void;
}

function availableFrom(details: unknown): number | undefined {
  if (!Array.isArray(details)) return undefined;
  const first = details[0] as Partial<InsufficientStockItem> | undefined;
  return typeof first?.available === 'number' ? first.available : undefined;
}

function serverMessage(error: ApiError): string {
  if (error.code === 'INSUFFICIENT_STOCK') {
    const available = availableFrom(error.details);
    return available === undefined
      ? '재고가 부족합니다'
      : `재고가 부족합니다 (현재 ${available}개)`;
  }
  return GENERIC_ERROR;
}

export function AdjustInventoryDialog({
  productId,
  currentStock,
  onAdjusted,
}: AdjustInventoryDialogProps) {
  const [open, setOpen] = useState(false);
  const adjust = useAdjustInventory(productId);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdjustInventoryFormInput, unknown, { delta: number; note: string }>({
    resolver: zodResolver(adjustInventorySchema),
    defaultValues: DEFAULTS,
  });

  const [mode, amountText] = useWatch({ control, name: ['mode', 'amount'] });
  const amount = Number(amountText);
  const valid =
    amountText.trim() !== '' &&
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= INVENTORY_LIMITS.deltaMax;
  const preview = currentStock + (mode === 'in' ? amount : -amount);
  const tooMuch = mode === 'out' && valid && amount > currentStock;

  function clearServerError() {
    if (adjust.isError) adjust.reset();
  }

  function onOpenChange(next: boolean) {
    if (adjust.isPending) return;
    if (!next) {
      reset(DEFAULTS);
      adjust.reset();
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">재고 조정</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>재고 조정</DialogTitle>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((input) =>
            adjust.mutate(input, {
              onSuccess: () => {
                reset(DEFAULTS);
                setOpen(false);
                onAdjusted?.();
              },
            }),
          )}
        >
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <ToggleGroup
                type="single"
                variant="outline"
                value={field.value}
                onValueChange={(v) => {
                  if (!v) return;
                  clearServerError();
                  field.onChange(v);
                }}
                aria-label="조정 방향"
              >
                <ToggleGroupItem value="in">입고</ToggleGroupItem>
                <ToggleGroupItem value="out">출고</ToggleGroupItem>
              </ToggleGroup>
            )}
          />
          <label className={FORM_LABEL}>
            <span>수량</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={INVENTORY_LIMITS.deltaMax}
              className={FORM_FIELD}
              aria-invalid={errors.amount ? true : undefined}
              {...register('amount', { onChange: clearServerError })}
            />
            {errors.amount && (
              <span role="alert" className="text-destructive text-xs">
                {errors.amount.message}
              </span>
            )}
          </label>
          <label className={FORM_LABEL}>
            <span>사유</span>
            <Textarea
              placeholder="예: 실사 결과 반영"
              className={FORM_FIELD}
              aria-invalid={errors.note ? true : undefined}
              {...register('note', { onChange: clearServerError })}
            />
            {errors.note && (
              <span role="alert" className="text-destructive text-xs">
                {errors.note.message}
              </span>
            )}
          </label>
          {valid && <p className="text-sm font-medium">조정 후 재고 {preview}개</p>}
          {tooMuch && (
            <p role="alert" className="text-destructive text-xs">
              현재 재고({currentStock}개)보다 많이 뺄 수 없습니다
            </p>
          )}
          {adjust.error && (
            <p role="alert" className="text-destructive text-sm">
              {serverMessage(adjust.error)}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={adjust.isPending || tooMuch}>
              {adjust.isPending ? '조정 중...' : '조정'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
