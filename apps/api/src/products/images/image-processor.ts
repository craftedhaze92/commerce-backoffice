import sharp from 'sharp';
import { AppException } from '../../common/app-exception.js';

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_INPUT_PIXELS = 40_000_000;

export interface ProcessedImage {
  main: { data: Buffer; width: number; height: number };
  thumb: { data: Buffer };
}

const invalid = (message: string) =>
  new AppException(400, 'VALIDATION_FAILED', message, [{ field: 'file', messages: [message] }]);

const resized = (input: Buffer, size: number, quality?: number) =>
  sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp(quality ? { quality } : undefined)
    .toBuffer({ resolveWithObject: true });

/** Validates, normalizes (EXIF rotation, no metadata) and renders the main and thumbnail webp. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    const { format } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    }).metadata();
    if (!format || !ALLOWED_FORMATS.has(format)) {
      throw invalid('지원하지 않는 이미지 형식입니다');
    }
    const [main, thumb] = await Promise.all([resized(input, 1600, 82), resized(input, 320)]);
    return {
      main: { data: main.data, width: main.info.width, height: main.info.height },
      thumb: { data: thumb.data },
    };
  } catch (err) {
    if (err instanceof AppException) throw err;
    const exceeded = err instanceof Error && /pixel limit/i.test(err.message);
    throw invalid(exceeded ? '이미지 해상도가 너무 큽니다' : '이미지를 읽을 수 없습니다');
  }
}
