import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

interface DataPaginationProps {
  className?: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function DataPagination({ className, page, totalPages, onPageChange }: DataPaginationProps) {
  return (
    <nav aria-label="페이지 이동" className={cn('flex items-center justify-end gap-3', className)}>
      <Button
        variant="secondary"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden data-icon="inline-start" />
        이전
      </Button>
      <span className="text-muted-strong min-w-12 text-center text-[15px] font-medium tabular-nums">
        {page} / {Math.max(totalPages, 1)}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        다음
        <ChevronRight aria-hidden data-icon="inline-end" />
      </Button>
    </nav>
  );
}
