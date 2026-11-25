/** 클릭 직후 해제하면 일부 브라우저가 다운로드를 시작하기 전에 URL이 사라진다. */
export const REVOKE_DELAY_MS = 1_000;

/**
 * Blob을 `filename`으로 저장한다. 숨긴 `<a download>`를 클릭하고 앵커는 바로 지우며,
 * object URL은 브라우저가 다운로드를 시작할 시간을 둔 뒤(`REVOKE_DELAY_MS`) 해제한다.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}
