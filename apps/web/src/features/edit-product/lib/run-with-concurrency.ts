/**
 * items를 worker로 처리하되 동시에 `limit`개까지만 실행한다.
 * worker가 실패해도 나머지는 계속 처리한다(실패 처리는 worker 안에서 한다).
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runner = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch {
        // 개별 실패는 worker가 화면에 알린다. 여기서는 다음 항목으로 넘어간다.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
}
