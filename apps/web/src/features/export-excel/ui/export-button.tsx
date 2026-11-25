'use client';

import { useMutation } from '@tanstack/react-query';
import { EXPORT_LIMITS, type ExportTooLargeDetails } from '@bo/contracts';
import { Can } from '@/entities/session';
import { ApiError, httpBlob } from '@/shared/api';
import { saveBlob } from '@/shared/lib/save-blob';
import { Button } from '@/shared/ui/button';
import { parseContentDispositionFilename } from '../lib/parse-filename';

interface ExportButtonProps {
  resource: 'products' | 'orders';
  /** 목록과 같은 쿼리 문자열(`?` 없이). 비어 있으면 필터 없이 내려받는다. */
  query: string;
}

const FALLBACK_FILENAME = 'export.xlsx';
const FAILURE_MESSAGE = '다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.';

function errorMessage(error: Error): string {
  if (error instanceof ApiError && error.code === 'EXPORT_TOO_LARGE') {
    const { total, maxRows } = (error.details ?? {}) as Partial<ExportTooLargeDetails>;
    if (typeof total === 'number') {
      return `${total.toLocaleString('ko-KR')}건은 한 번에 내려받을 수 없습니다. ${(maxRows ?? EXPORT_LIMITS.maxRows).toLocaleString('ko-KR')}건 이하가 되도록 필터를 좁혀 주세요.`;
    }
  }
  return FAILURE_MESSAGE;
}

/** 현재 필터·정렬 그대로 목록을 엑셀로 내려받는다. MANAGER 이상에게만 보인다. */
export function ExportButton({ resource, query }: ExportButtonProps) {
  const download = useMutation<void, Error>({
    mutationFn: async () => {
      const { blob, contentDisposition } = await httpBlob(
        `/${resource}/export${query ? `?${query}` : ''}`,
      );
      saveBlob(blob, parseContentDispositionFilename(contentDisposition) ?? FALLBACK_FILENAME);
    },
  });

  return (
    <Can permission="export:download">
      <div className="flex items-center gap-3">
        {download.isError && (
          <span role="alert" className="text-destructive text-sm">
            {errorMessage(download.error)}
          </span>
        )}
        <Button variant="outline" disabled={download.isPending} onClick={() => download.mutate()}>
          {download.isPending ? '다운로드 중…' : '엑셀 다운로드'}
        </Button>
      </div>
    </Can>
  );
}
