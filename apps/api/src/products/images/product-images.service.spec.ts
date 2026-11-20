import type { Repository } from 'typeorm';
import type { ObjectStorage } from '../../storage/object-storage.js';
import { pngOf } from '../../../test/fixtures/images.js';
import type { ProductImage } from '../product-image.entity.js';
import { ProductImagesService } from './product-images.service.js';

function setup(opts: { failPutAt?: number; failSave?: boolean }) {
  let puts = 0;
  const storage = {
    put: vi.fn(async () => {
      puts += 1;
      if (opts.failPutAt === puts) throw new Error('put failed');
    }),
    delete: vi.fn(async () => undefined),
  } satisfies ObjectStorage;
  const images = {
    create: vi.fn((v: object) => v),
    save: vi.fn(async (v: object) => {
      if (opts.failSave) throw new Error('db failed');
      return { id: 'id', createdAt: new Date(), ...v };
    }),
  } as unknown as Repository<ProductImage>;
  return { storage, service: new ProductImagesService(images, storage) };
}

describe('ProductImagesService cleanup', () => {
  it('deletes both keys when the thumb put fails', async () => {
    const { service, storage } = setup({ failPutAt: 2 });
    await expect(service.upload(await pngOf(50, 50))).rejects.toThrow('put failed');
    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    const keys = storage.delete.mock.calls[0]![0] as string[];
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/\.webp$/);
    expect(keys[1]).toMatch(/_thumb\.webp$/);
  });

  it('deletes both keys when the DB insert fails', async () => {
    const { service, storage } = setup({ failSave: true });
    await expect(service.upload(await pngOf(50, 50))).rejects.toThrow('db failed');
    expect(storage.delete).toHaveBeenCalledWith([
      expect.stringMatching(/\.webp$/),
      expect.stringMatching(/_thumb\.webp$/),
    ]);
  });

  it('does not touch storage when the file is invalid', async () => {
    const { service, storage } = setup({});
    await expect(service.upload(Buffer.from('nope'))).rejects.toMatchObject({ status: 400 });
    expect(storage.put).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
