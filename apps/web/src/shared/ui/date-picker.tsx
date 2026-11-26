'use client';

import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { ko } from 'react-day-picker/locale';
import type { Matcher } from 'react-day-picker';
import { dateStringToDate, dateToDateString } from '@/shared/lib/date-range';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Calendar } from '@/shared/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

interface DatePickerProps {
  /** 선택된 날짜(`YYYY-MM-DD`). 없으면 placeholder를 보여 준다. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** 트리거 버튼의 접근성 이름(예: 시작일). */
  label: string;
  placeholder?: string;
  /** 고를 수 있는 가장 이른·늦은 날짜(`YYYY-MM-DD`, 포함). 범위 밖 날짜는 달력에서 비활성화된다. */
  min?: string;
  max?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/** `YYYY-MM-DD` → 화면 표기 `YYYY.MM.DD`. */
function display(value: string): string {
  return value.replaceAll('-', '.');
}

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = '날짜 선택',
  min,
  max,
  invalid,
  describedBy,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? dateStringToDate(value) : undefined;

  const disabled: Matcher[] = [];
  if (min) disabled.push({ before: dateStringToDate(min) });
  if (max) disabled.push({ after: dateStringToDate(max) });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          aria-label={value ? `${label} ${display(value)}` : label}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            'w-36 justify-between px-3.5 font-medium tabular-nums',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          {value ? display(value) : placeholder}
          <CalendarIcon aria-hidden className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar
          mode="single"
          locale={ko}
          selected={selected}
          defaultMonth={selected ?? (max ? dateStringToDate(max) : undefined)}
          disabled={disabled}
          // 고를 수 있는 날이 없는 달로는 넘어가지 못하게 한다(미래 달 이동 막기)
          startMonth={min ? dateStringToDate(min) : undefined}
          endMonth={max ? dateStringToDate(max) : undefined}
          onSelect={(date) => {
            onChange(date ? dateToDateString(date) : undefined);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
