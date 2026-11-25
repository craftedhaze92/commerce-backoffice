/**
 * Content-Disposition에서 파일명을 꺼낸다. `filename*=UTF-8''…`(RFC 5987)를 먼저 디코딩하고,
 * 없거나 디코딩에 실패하면 `filename="…"`로, 그것도 없으면 null이다.
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) return null;

  const extended = /filename\*\s*=\s*"?UTF-8''([^";]+)"?/i.exec(header);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      // 깨진 퍼센트 인코딩은 아래 filename으로 넘어간다.
    }
  }

  const plain = /(?:^|[;\s])filename\s*=\s*(?:"([^"]*)"|([^;\s]+))/i.exec(header);
  return plain?.[1] ?? plain?.[2] ?? null;
}
