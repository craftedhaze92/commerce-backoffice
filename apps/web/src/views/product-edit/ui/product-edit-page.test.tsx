import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role, type ProductDetail, type ProductImage } from '@bo/contracts';
import { sessionKeys } from '@/entities/session';
import { createTestQueryClient, renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { navReplace, setMockSearch } from '@/shared/testing/mock-navigation';
import { categoryFixtures, productDetailFixture } from '@/shared/api/mocks/products';
import { CreateProductDialog } from '@/features/edit-product';
import { ProductEditPage } from './product-edit-page';

vi.mock('next/navigation', async () => {
  const m = await import('@/shared/testing/mock-navigation');
  return m.navigationMock;
});

const me = (role: Role) => ({ id: 'u', email: 'u@demo.com', name: 'U', role });
function useRole(role: Role) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(me(role))));
}

/**
 * 업로드 요청이 어떤 파일인지 알아낸다.
 *
 * jsdom 환경에서는 FormData·File이 jsdom 구현이라 Node fetch(undici)가 파일 이름과 내용을 싣지 못한다
 * (filename="blob", 빈 본문). 그래서 본문에 file 필드가 있는지만 확인하고, 파일은 요청이 도착한 순서로
 * 식별한다. 업로더는 고른 순서대로 요청을 시작하므로 도착 순서가 곧 파일 순서다.
 */
function fileQueue(names: readonly string[]) {
  let next = 0;
  return async (request: Request): Promise<string> => {
    const raw = await request.text();
    if (!raw.includes('name="file"')) throw new Error('multipart file field missing');
    return names[next++] ?? `extra-${next}`;
  };
}

function png(name: string): File {
  return new File(['x'], name, { type: 'image/png' });
}

function uploadedImage(name: string): ProductImage {
  return {
    id: `img-${name}`,
    url: `/media/uploads/${name}`,
    thumbUrl: `/media/uploads/thumb-${name}`,
    width: 800,
    height: 800,
    sortOrder: 0,
    isPrimary: false,
  };
}

/** 업로드 핸들러: 도착 순서로 파일을 식별해 id를 만들고 Content-Type을 기록한다. */
function mockUploads(order: string[]) {
  const nameOf = fileQueue(order);
  const contentTypes: (string | null)[] = [];
  server.use(
    http.post('/api/v1/products/images', async ({ request }) => {
      contentTypes.push(request.headers.get('content-type'));
      const file = { name: await nameOf(request) };
      return HttpResponse.json(uploadedImage(file.name), { status: 201 });
    }),
  );
  return contentTypes;
}

type Captured = { body?: Record<string, unknown>; calls: number };

function capture(
  method: 'post' | 'patch' | 'delete',
  path: string,
  respond: (body: Record<string, unknown> | undefined) => Response,
): Captured {
  const captured: Captured = { calls: 0 };
  server.use(
    http[method](path, async ({ request }) => {
      captured.calls += 1;
      captured.body =
        method === 'delete' ? undefined : ((await request.json()) as Record<string, unknown>);
      return respond(captured.body);
    }),
  );
  return captured;
}

const created = (body: Record<string, unknown> | undefined): ProductDetail => ({
  ...productDetailFixture,
  ...(body as Partial<ProductDetail>),
  id: 'new-id',
  images: [],
});

/** 상품 등록 모달을 띄워 폼이 나올 때까지 기다린다. */
async function openCreate(user: UserEvent) {
  renderWithQuery(<CreateProductDialog />);
  await user.click(screen.getByRole('button', { name: '상품 등록' }));
  await screen.findByLabelText('SKU');
}

async function fillCreateForm(user: UserEvent) {
  await user.type(screen.getByLabelText('SKU'), ' new-001 ');
  await user.type(screen.getByLabelText('상품명'), '새 상품');
  await user.click(screen.getByRole('combobox', { name: '카테고리' }));
  await user.click(await screen.findByRole('option', { name: categoryFixtures[1].name }));
  await user.type(screen.getByLabelText('가격'), '15000');
  await user.type(screen.getByLabelText('초기 재고'), '10');
  await user.clear(screen.getByLabelText('안전 재고'));
  await user.type(screen.getByLabelText('안전 재고'), '5');
}

beforeAll(() => {
  // jsdom에는 Radix Select가 쓰는 포인터 캡처·scrollIntoView가 없다
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe('ProductEditPage', () => {
  beforeEach(() => {
    setMockSearch('');
    useRole(Role.MANAGER);
  });

  it('create: fills form, uploads 2 images (MSW), first is primary, submits POST body with images order', async () => {
    const contentTypes = mockUploads(['a.png', 'b.png']);
    const post = capture('post', '/api/v1/products', (b) =>
      HttpResponse.json(created(b), { status: 201 }),
    );
    const user = userEvent.setup();
    await openCreate(user);
    await fillCreateForm(user);
    await user.upload(screen.getByLabelText('파일 선택'), [png('a.png'), png('b.png')]);
    const list = await screen.findByRole('list', { name: '등록된 이미지' });
    await waitFor(() => expect(within(list).getAllByRole('img')).toHaveLength(2));
    expect(contentTypes.every((c) => c?.startsWith('multipart/form-data'))).toBe(true);
    const shown = within(list)
      .getAllByRole('img')
      .map((img) => img.getAttribute('src')?.replace('/media/uploads/thumb-', 'img-'));

    await user.click(screen.getByRole('button', { name: '저장' }));
    // 등록에 성공하면 모달이 닫힌다
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(post.calls).toBe(1);
    expect(post.body).toEqual({
      sku: 'NEW-001',
      name: '새 상품',
      categoryId: categoryFixtures[1].id,
      price: 15000,
      status: 'DRAFT',
      description: '',
      initialStock: 10,
      safetyStock: 5,
      images: [
        { id: shown[0], isPrimary: true },
        { id: shown[1], isPrimary: false },
      ],
    });
  });

  it('reorder and set primary update the submitted images array', async () => {
    const patch = capture('patch', `/api/v1/products/${productDetailFixture.id}`, () =>
      HttpResponse.json(productDetailFixture),
    );
    const user = userEvent.setup();
    renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
    const [a, b] = productDetailFixture.images;
    await user.click(await screen.findByRole('button', { name: '2번 이미지 대표로 지정' }));
    await user.click(screen.getByRole('button', { name: '2번 이미지 앞으로' }));
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(patch.calls).toBe(1));
    expect(patch.body).toEqual({
      images: [
        { id: b.id, isPrimary: true },
        { id: a.id, isPrimary: false },
      ],
    });
  });

  it('409 maps to sku field error "이미 사용 중인 SKU입니다"', async () => {
    capture('post', '/api/v1/products', () =>
      HttpResponse.json(
        {
          statusCode: 409,
          code: 'CONFLICT',
          message: 'SKU already exists',
          details: { field: 'sku' },
        },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    await openCreate(user);
    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: '저장' }));
    const error = await screen.findByText('이미 사용 중인 SKU입니다');
    expect(screen.getByLabelText('SKU')).toHaveAttribute('aria-describedby', error.id);
    expect(screen.getByRole('dialog', { name: '상품 등록' })).toBeInTheDocument();
  });

  it('400 details map to field errors', async () => {
    capture('post', '/api/v1/products', () =>
      HttpResponse.json(
        {
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          details: [
            { field: 'name', messages: ['name is taken by policy'] },
            { field: 'categoryId', messages: ['category does not exist'] },
          ],
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    await openCreate(user);
    await fillCreateForm(user);
    await user.click(screen.getByRole('button', { name: '저장' }));
    const errors = await screen.findAllByText('값을 확인해 주세요');
    expect(errors).toHaveLength(2);
    expect(screen.getByLabelText('상품명')).toHaveAttribute('aria-describedby', errors[0]!.id);
    expect(screen.queryByText('name is taken by policy')).not.toBeInTheDocument();
    expect(screen.queryByText('category does not exist')).not.toBeInTheDocument();
  });

  it('edit: PATCH sends only changed fields', async () => {
    const patch = capture('patch', `/api/v1/products/${productDetailFixture.id}`, (b) =>
      HttpResponse.json({ ...productDetailFixture, ...b }),
    );
    const user = userEvent.setup();
    renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
    const name = await screen.findByLabelText('상품명');
    expect(name).toHaveValue(productDetailFixture.name);
    expect(screen.getByLabelText('SKU')).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('초기 재고')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    await user.clear(name);
    await user.type(name, '바뀐 이름');
    await user.clear(screen.getByLabelText('가격'));
    await user.type(screen.getByLabelText('가격'), '99000');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(patch.calls).toBe(1));
    expect(patch.body).toEqual({ name: '바뀐 이름', price: 99000 });
    // 저장 후 폼이 응답 기준으로 초기화되어 다시 바뀐 것이 없다
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeDisabled());
    expect(screen.getByLabelText('상품명')).toHaveValue('바뀐 이름');
    expect(navReplace).not.toHaveBeenCalled();
  });

  it('viewer sees read-only detail without save/delete', async () => {
    useRole(Role.VIEWER);
    renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
    const name = await screen.findByLabelText('상품명');
    await waitFor(() => expect(name).toBeDisabled());
    expect(screen.getByLabelText('가격')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '카테고리' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상품 삭제' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('파일 선택')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('create dialog closes with 취소 or the close button and discards what was typed', async () => {
    const user = userEvent.setup();
    await openCreate(user);
    await user.type(screen.getByLabelText('상품명'), '버릴 상품');
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '상품 등록' }));
    expect(await screen.findByLabelText('상품명')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '상품 등록' }));
    await screen.findByLabelText('상품명');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('delete confirms, calls DELETE, navigates to /products', async () => {
    const del = capture(
      'delete',
      `/api/v1/products/${productDetailFixture.id}`,
      () => new HttpResponse(null, { status: 204 }),
    );
    const user = userEvent.setup();
    renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
    await user.click(await screen.findByRole('button', { name: '상품 삭제' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(`‘${productDetailFixture.name}’ 상품을 삭제할까요?`);
    expect(del.calls).toBe(0);
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(navReplace).toHaveBeenCalledWith('/products'));
    expect(del.calls).toBe(1);
  });

  it('404 shows not-found state', async () => {
    renderWithQuery(<ProductEditPage id="00000000-0000-4000-8000-0000000000ff" />);
    expect(await screen.findByText('상품을 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '목록으로' })).toHaveAttribute('href', '/products');
  });
  /** 업로드 응답을 release()를 부를 때까지 붙잡아 둔다. */
  function holdUploads() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.post('/api/v1/products/images', async () => {
        await gate;
        return HttpResponse.json(uploadedImage('held.png'), { status: 201 });
      }),
    );
    return () => release();
  }

  const UPLOAD_HINT = '이미지 업로드가 끝난 뒤 저장할 수 있습니다';

  it('create: 저장 is disabled with a hint while an upload is pending', async () => {
    const release = holdUploads();
    const post = capture('post', '/api/v1/products', (b) =>
      HttpResponse.json(created(b), { status: 201 }),
    );
    const user = userEvent.setup();
    await openCreate(user);
    await fillCreateForm(user);
    expect(screen.queryByText(UPLOAD_HINT)).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText('파일 선택'), [png('held.png')]);
    expect(await screen.findByText(UPLOAD_HINT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(post.calls).toBe(0);

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
    expect(screen.queryByText(UPLOAD_HINT)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('edit: 저장 is disabled with a hint while an upload is pending', async () => {
    const release = holdUploads();
    const user = userEvent.setup();
    renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
    await screen.findByLabelText('상품명');
    await user.upload(screen.getByLabelText('파일 선택'), [png('held.png')]);
    expect(await screen.findByText(UPLOAD_HINT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
    expect(screen.queryByText(UPLOAD_HINT)).not.toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(3);
  });

  it('manager never sees a read-only form while the session is loading', async () => {
    let releaseMe!: () => void;
    const meGate = new Promise<void>((r) => (releaseMe = r));
    server.use(
      http.get('/api/v1/auth/me', async () => {
        await meGate;
        return HttpResponse.json(me(Role.MANAGER));
      }),
    );
    renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
    // 상품은 먼저 도착해도 세션을 알기 전까지는 폼을 그리지 않는다
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByLabelText('상품명')).not.toBeInTheDocument();
    releaseMe();
    expect(await screen.findByLabelText('상품명')).toBeEnabled();
  });
  describe('inventory', () => {
    const stock = productDetailFixture.stock;

    it('manager sees stock card, 재고 조정 and history', async () => {
      renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
      const card = await screen.findByRole('region', { name: '재고' });
      expect(
        within(card).getByText(
          `현재 재고 ${stock}개 · 안전 재고 ${productDetailFixture.safetyStock}개`,
        ),
      ).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: '재고 조정' })).toBeInTheDocument();
      expect((await within(card).findAllByRole('link', { name: /^ORD-/ })).length).toBeGreaterThan(
        0,
      );
    });

    it('viewer sees history but no 재고 조정 after the session has loaded', async () => {
      useRole(Role.VIEWER);
      const client = createTestQueryClient();
      renderWithQuery(<ProductEditPage id={productDetailFixture.id} />, { client });
      const card = await screen.findByRole('region', { name: '재고' });
      await within(card).findAllByRole('link', { name: /^ORD-/ });
      await waitFor(() =>
        expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: 'VIEWER' }),
      );
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(screen.queryByRole('button', { name: '재고 조정' })).not.toBeInTheDocument();
    });

    it('입고 5 sends PATCH {delta, note} and updates the displayed stock', async () => {
      const user = userEvent.setup();
      let current = stock;
      const patched = capture('patch', '/api/v1/products/:id/inventory', (body) => {
        current += body?.delta as number;
        return HttpResponse.json({ ...productDetailFixture, stock: current });
      });
      server.use(
        http.get('/api/v1/products/:id', () =>
          HttpResponse.json({ ...productDetailFixture, stock: current }),
        ),
      );
      renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
      await user.click(await screen.findByRole('button', { name: '재고 조정' }));
      await user.type(screen.getByLabelText('수량'), '5');
      await user.type(screen.getByLabelText('사유'), '실사');
      await user.click(screen.getByRole('button', { name: '조정' }));
      await waitFor(() => expect(patched.calls).toBe(1));
      expect(patched.body).toEqual({ delta: 5, note: '실사' });
      expect(
        await screen.findByText(
          `현재 재고 ${stock + 5}개 · 안전 재고 ${productDetailFixture.safetyStock}개`,
        ),
      ).toBeInTheDocument();
    });

    it('returns the history to page 1 after a successful adjustment', async () => {
      const user = userEvent.setup();
      server.use(
        http.patch('/api/v1/products/:id/inventory', () =>
          HttpResponse.json({ ...productDetailFixture, stock: stock + 1 }),
        ),
      );
      renderWithQuery(<ProductEditPage id={productDetailFixture.id} />);
      const card = await screen.findByRole('region', { name: '재고' });
      await within(card).findAllByRole('link', { name: /^ORD-/ });
      await user.click(within(card).getByRole('button', { name: '다음' }));
      expect(await within(card).findByText('2 / 2')).toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: '재고 조정' }));
      await user.type(screen.getByLabelText('수량'), '1');
      await user.type(screen.getByLabelText('사유'), '실사');
      await user.click(screen.getByRole('button', { name: '조정' }));
      expect(await within(card).findByText('1 / 2')).toBeInTheDocument();
    });
  });
});
