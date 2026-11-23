import { Button } from '@/shared/ui/button';

interface DataPaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function DataPagination({ page, totalPages, onPageChange }: DataPaginationProps) {
  return (
    <nav aria-label="페이지 이동" className="flex items-center justify-end gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        이전
      </Button>
      <span className="text-muted-foreground text-sm">
        {page} / {Math.max(totalPages, 1)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        다음
      </Button>
    </nav>
  );
}
