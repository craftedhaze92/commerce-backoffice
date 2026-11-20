import sharp from 'sharp';
import { AppException } from '../../common/app-exception.js';
import {
  fakePngText,
  hugePixelsPng,
  jpegWithExifRotation,
  pngOf,
} from '../../../test/fixtures/images.js';
import { processImage } from './image-processor.js';

describe('processImage', () => {
  it('png 2000x1000 -> main 1600x800 webp, thumb 320x160 webp', async () => {
    const out = await processImage(await pngOf(2000, 1000));
    expect(out.main.width).toBe(1600);
    expect(out.main.height).toBe(800);
    const main = await sharp(out.main.data).metadata();
    const thumb = await sharp(out.thumb.data).metadata();
    expect([main.format, main.width, main.height]).toEqual(['webp', 1600, 800]);
    expect([thumb.format, thumb.width, thumb.height]).toEqual(['webp', 320, 160]);
  });

  it('does not enlarge a small 200x100 image', async () => {
    const out = await processImage(await pngOf(200, 100));
    expect([out.main.width, out.main.height]).toEqual([200, 100]);
    const thumb = await sharp(out.thumb.data).metadata();
    expect([thumb.width, thumb.height]).toEqual([200, 100]);
  });

  it('applies EXIF orientation and strips metadata', async () => {
    const out = await processImage(await jpegWithExifRotation());
    expect([out.main.width, out.main.height]).toEqual([100, 200]);
    expect((await sharp(out.main.data).metadata()).exif).toBeUndefined();
    expect((await sharp(out.thumb.data).metadata()).exif).toBeUndefined();
  });

  it('rejects text renamed to .png with 400 on field file', async () => {
    const err = await processImage(fakePngText()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect(err).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'file', messages: [expect.any(String)] }],
    });
    expect((err as AppException).getStatus()).toBe(400);
  });

  it('rejects an image over 40M pixels with 400', async () => {
    const err = await processImage(await hugePixelsPng()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getStatus()).toBe(400);
  });

  it('rejects an unsupported format (gif) with 400', async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    const err = await processImage(gif).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(400);
  });
});
