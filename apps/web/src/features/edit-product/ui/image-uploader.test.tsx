import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { ProductImage } from '@bo/contracts';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { ImageUploader } from './image-uploader';

function image(id: string, isPrimary = false, sortOrder = 0): ProductImage {
  return {
    id,
    url: `/media/${id}.webp`,
    thumbUrl: `/media/${id}-thumb.webp`,
    width: 800,
    height: 800,
    sortOrder,
    isPrimary,
  };
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

function png(name: string, bytes?: number): File {
  const file = new File(['x'], name, { type: 'image/png' });
  // 큰 파일은 실제로 만들지 않고 크기만 속인다(업로드 전에 거절되므로 전송되지 않는다)
  if (bytes !== undefined) Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

/** order 순서로 도착한 업로드에 파일명 기반 id로 응답하고, 받은 파일명과 최대 동시 요청 수를 기록한다. */
function recordUploads(order: string[], opts: { wait?: number; fail?: string[] } = {}) {
  const nameOf = fileQueue(order);
  const names: string[] = [];
  const stats = { inFlight: 0, peak: 0 };
  server.use(
    http.post('/api/v1/products/images', async ({ request }) => {
      stats.inFlight += 1;
      stats.peak = Math.max(stats.peak, stats.inFlight);
      try {
        const file = { name: await nameOf(request) };
        names.push(file.name);
        if (opts.wait) await delay(opts.wait);
        if (opts.fail?.includes(file.name)) {
          return HttpResponse.json(
            { statusCode: 500, code: 'INTERNAL', message: 'boom' },
            { status: 500 },
          );
        }
        return HttpResponse.json(image(`img-${file.name}`), { status: 201 });
      } finally {
        stats.inFlight -= 1;
      }
    }),
  );
  return { names, stats };
}

function Harness({ initial = [] }: { initial?: ProductImage[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ImageUploader value={value} onChange={setValue} />
      <output data-testid="state">
        {JSON.stringify(value.map((i) => [i.id, i.isPrimary, i.sortOrder]))}
      </output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent ?? '[]') as unknown[];

describe('ImageUploader', () => {
  it('rejects 6MB file and .gif before upload with per-file error; no request sent', async () => {
    const { names } = recordUploads([]);
    const user = userEvent.setup({ applyAccept: false });
    renderWithQuery(<Harness />);
    const input = screen.getByLabelText('파일 선택');
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    const gif = new File(['x'], 'anim.gif', { type: 'image/gif' });
    await user.upload(input, [png('big.png', 6 * 1024 * 1024), gif]);
    expect(screen.getByText('big.png: 5MB를 넘습니다')).toBeInTheDocument();
    expect(screen.getByText('anim.gif: 지원하지 않는 형식입니다')).toBeInTheDocument();
    expect(names).toEqual([]);
    expect(state()).toEqual([]);
  });

  it('uploads each file separately, at most 3 at once, showing 업로드 중', async () => {
    const { names, stats } = recordUploads(['1.png', '2.png', '3.png', '4.png', '5.png'], {
      wait: 30,
    });
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    const files = ['1.png', '2.png', '3.png', '4.png', '5.png'].map((n) => png(n));
    await user.upload(screen.getByLabelText('파일 선택'), files);
    expect(await screen.findAllByText(/업로드 중/)).not.toHaveLength(0);
    await waitFor(() => expect(state()).toHaveLength(5));
    expect(screen.queryByText(/업로드 중/)).not.toBeInTheDocument();
    expect(names).toEqual(['1.png', '2.png', '3.png', '4.png', '5.png']);
    expect(stats.peak).toBe(3);
    // 첫 이미지는 자동으로 대표가 된다
    const s = state() as [string, boolean, number][];
    expect(s.filter(([, primary]) => primary)).toHaveLength(1);
    expect(s[0][1]).toBe(true);
    expect(s.map(([, , order]) => order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('shows a failure per file and does not add that image', async () => {
    recordUploads(['ok.png', 'bad.png'], { fail: ['bad.png'] });
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.upload(screen.getByLabelText('파일 선택'), [png('ok.png'), png('bad.png')]);
    expect(await screen.findByText('bad.png: 업로드에 실패했습니다')).toBeInTheDocument();
    await waitFor(() => expect(state()).toEqual([['img-ok.png', true, 0]]));
  });

  it('shows fixed Korean copy (not server text) for a 400 on that file', async () => {
    server.use(
      http.post('/api/v1/products/images', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            code: 'VALIDATION_FAILED',
            message: 'x',
            details: [{ field: 'file', messages: ['file must be an image'] }],
          },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.upload(screen.getByLabelText('파일 선택'), [png('fake.png')]);
    expect(
      await screen.findByText('fake.png: 지원하지 않는 형식이거나 너무 큰 이미지입니다'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/file must be an image/)).not.toBeInTheDocument();
    expect(state()).toEqual([]);
  });

  it('shows the size message for a 413', async () => {
    server.use(
      http.post('/api/v1/products/images', () =>
        HttpResponse.json(
          { statusCode: 413, code: 'VALIDATION_FAILED', message: 'too large' },
          { status: 413 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.upload(screen.getByLabelText('파일 선택'), [png('huge.png')]);
    expect(await screen.findByText('huge.png: 5MB를 넘습니다')).toBeInTheDocument();
  });

  it('limits to 10 images in total', async () => {
    const { names } = recordUploads(['a.png']);
    const user = userEvent.setup();
    const initial = Array.from({ length: 9 }, (_, i) => image(`i${i}`, i === 0, i));
    renderWithQuery(<Harness initial={initial} />);
    await user.upload(screen.getByLabelText('파일 선택'), [png('a.png'), png('b.png')]);
    expect(screen.getByText('최대 10장까지 등록할 수 있습니다')).toBeInTheDocument();
    await waitFor(() => expect(state()).toHaveLength(10));
    expect(names).toEqual(['a.png']);
  });

  it('reorders, sets primary and removes; removing the primary promotes the new first', async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <Harness initial={[image('a', true, 0), image('b', false, 1), image('c', false, 2)]} />,
    );
    const list = screen.getByRole('list', { name: '등록된 이미지' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: '1번 이미지 앞으로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '3번 이미지 뒤로' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '3번 이미지 앞으로' }));
    expect(state()).toEqual([
      ['a', true, 0],
      ['c', false, 1],
      ['b', false, 2],
    ]);
    await user.click(screen.getByRole('button', { name: '1번 이미지 뒤로' }));
    expect(state()).toEqual([
      ['c', false, 0],
      ['a', true, 1],
      ['b', false, 2],
    ]);
    await user.click(screen.getByRole('button', { name: '3번 이미지 대표로 지정' }));
    expect(state()).toEqual([
      ['c', false, 0],
      ['a', false, 1],
      ['b', true, 2],
    ]);
    await user.click(screen.getByRole('button', { name: '3번 이미지 삭제' }));
    expect(state()).toEqual([
      ['c', true, 0],
      ['a', false, 1],
    ]);
  });

  it('hides controls when disabled', () => {
    renderWithQuery(<ImageUploader value={[image('a', true)]} onChange={() => {}} disabled />);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/media/a-thumb.webp');
    expect(screen.queryByLabelText('파일 선택')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
