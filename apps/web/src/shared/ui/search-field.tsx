'use client';

import { useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface SearchFieldProps {
  /** 검색 폼의 id. 같은 줄 어디에 둔 `SearchButton`이든 이 id로 이 폼을 제출한다. */
  formId: string;
  /** 지금 적용된 검색어(URL 값). 바깥에서 바뀌면(초기화 등) 입력창을 맞춘다. */
  value: string;
  /** Enter 또는 검색 버튼을 눌렀을 때만 부른다. 입력 중에는 요청하지 않는다. */
  onSearch: (q: string) => void;
  label: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

/**
 * 검색어 입력. 글자를 칠 때마다 목록을 다시 불러오지 않고, Enter나 `SearchButton`으로
 * 제출했을 때 한 번만 검색어를 반영한다. 버튼은 필터 줄 맨 오른쪽에 두도록 폼 밖에 따로 그린다.
 */
export function SearchField({
  formId,
  value,
  onSearch,
  label,
  placeholder,
  maxLength,
  className,
}: SearchFieldProps) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  return (
    <form
      id={formId}
      role="search"
      aria-label={label}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(text.trim());
      }}
      className={className}
    >
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        className="w-44"
        value={text}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  );
}

/** `SearchField`를 제출하는 검색 버튼. 폼 밖에 있어도 `form` 속성으로 연결된다. */
export function SearchButton({ form, className }: { form: string; className?: string }) {
  return (
    <Button type="submit" form={form} className={cn('px-5', className)}>
      <SearchIcon aria-hidden data-icon="inline-start" />
      검색
    </Button>
  );
}
