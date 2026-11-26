'use client';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useColumnVisibility, type ToggleableColumn } from '../model/column-visibility-store';
import { COLUMN_LABEL } from '../lib/columns';

const TOGGLEABLE = Object.keys(COLUMN_LABEL) as ToggleableColumn[];

/** 상품 목록의 선택 컬럼 표시 여부를 바꾼다. 표와 같은 저장소를 쓰므로 어디에 두어도 함께 움직인다. */
export function ProductColumnMenu() {
  const visible = useColumnVisibility((s) => s.visible);
  const setVisible = useColumnVisibility((s) => s.setVisible);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">컬럼</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {TOGGLEABLE.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={visible[id]}
            onCheckedChange={(checked) => setVisible(id, checked === true)}
          >
            {COLUMN_LABEL[id]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
