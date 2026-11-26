'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { withQueryParam } from '@/shared/lib/url-state';

/** 상품 상세 모달을 여는 링크. 지금 목록의 필터·정렬·페이지는 그대로 두고 `detail`만 더한다. */
export function ProductNameLink({ id, children }: { id: string; children: React.ReactNode }) {
  // 앱 라우터 밖(단독 렌더 등)에서는 null일 수 있다
  const search = useSearchParams()?.toString() ?? '';
  return (
    <Link
      href={`/products${withQueryParam(search, 'detail', id)}`}
      scroll={false}
      className="font-medium hover:underline focus-visible:underline"
    >
      {children}
    </Link>
  );
}
