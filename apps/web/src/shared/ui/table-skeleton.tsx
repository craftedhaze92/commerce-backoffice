import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { TableCell, TableRow } from '@/shared/ui/table';

/**
 * 스켈레톤 칸의 모양. 실제로 그려질 내용과 같은 모양·정렬이어야 로딩이 끝날 때 화면이 흔들리지 않는다.
 * - text: 한 줄 글자, twoLine: 이름 + 보조 문구(예: 상품명 + SKU)
 * - thumb: 40px 썸네일, badge: 상태 배지, number: 오른쪽 정렬 숫자
 */
export type SkeletonCellKind = 'text' | 'twoLine' | 'thumb' | 'badge' | 'number';

/** 행마다 글자 폭을 조금씩 달리해 실제 목록처럼 보이게 한다(결정적이라 테스트·SSR이 흔들리지 않는다). */
const TEXT_WIDTHS = ['w-24', 'w-32', 'w-20', 'w-28', 'w-36'];

function SkeletonCell({ kind, row }: { kind: SkeletonCellKind; row: number }) {
  const width = TEXT_WIDTHS[row % TEXT_WIDTHS.length];
  switch (kind) {
    case 'thumb':
      return <Skeleton className="size-10 rounded-lg" />;
    case 'twoLine':
      return (
        <div className="flex flex-col gap-1.5">
          <Skeleton className={cn('h-4', width)} />
          <Skeleton className="h-3 w-16" />
        </div>
      );
    case 'badge':
      return <Skeleton className="h-6 w-12 rounded-md" />;
    case 'number':
      return <Skeleton className="ml-auto h-4 w-16" />;
    default:
      return <Skeleton className={cn('h-4', width)} />;
  }
}

interface TableSkeletonRowsProps {
  cells: readonly SkeletonCellKind[];
  rows?: number;
  testId?: string;
}

/** 표 본문의 로딩 행. 각 행은 aria-busy로 표시해 보조기기가 불러오는 중임을 알 수 있게 한다. */
export function TableSkeletonRows({ cells, rows = 5, testId }: TableSkeletonRowsProps) {
  return Array.from({ length: rows }, (_, row) => (
    <TableRow key={row} data-testid={testId} aria-busy="true" className="hover:bg-transparent">
      {cells.map((kind, i) => (
        <TableCell key={i}>
          <SkeletonCell kind={kind} row={row} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

/**
 * 목록 행 모양(왼쪽 두 줄 + 오른쪽 값)의 로딩 자리. 대시보드 카드 목록에 쓴다.
 * 실제 항목으로 읽히지 않도록 목록(ul/li) 의미를 주지 않는다.
 */
export function ListSkeleton({ rows = 5, testId }: { rows?: number; testId?: string }) {
  return (
    <div data-testid={testId} aria-busy="true" className="flex flex-col">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center justify-between gap-3 py-3">
          <div className="flex flex-col gap-1.5">
            <Skeleton className={cn('h-4', TEXT_WIDTHS[row % TEXT_WIDTHS.length])} />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
