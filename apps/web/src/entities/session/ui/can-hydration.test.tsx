import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Role } from '@bo/contracts';
import { sessionKeys } from '../model/query-keys';
import { Can } from './can';

function Tree({ client }: { client: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <Can permission="product:write" fallback={<span>읽기 전용</span>}>
        <button>상품 등록</button>
      </Can>
    </QueryClientProvider>
  );
}

describe('Can hydration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('하이드레이션 전에 캐시에 me가 있어도 서버 마크업과 어긋나지 않는다', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const serverClient = new QueryClient();
    const html = renderToString(<Tree client={serverClient} />);
    expect(html).toContain('읽기 전용');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const clientClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    clientClient.setQueryData(sessionKeys.me, {
      id: 'm',
      email: 'manager@demo.com',
      name: 'M',
      role: Role.MANAGER,
    });

    const recoverable = vi.fn();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Tree client={clientClient} />, {
        onRecoverableError: recoverable,
      });
    });

    const hydrationErrors = errorSpy.mock.calls.filter((args) =>
      args.some((a) => /hydrat/i.test(String(a))),
    );
    expect(hydrationErrors).toEqual([]);
    expect(recoverable).not.toHaveBeenCalled();
    // 하이드레이션이 끝난 뒤에야 children이 나타난다
    expect(container.querySelector('button')?.textContent).toBe('상품 등록');

    await act(async () => root.unmount());
  });
});
