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

const startsWith = (buf: Buffer, bytes: number[], offset = 0): boolean =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

/** Cheap signature check so other formats (SVG, TIFF, HEIF...) never reach their libvips loaders. */
function hasAllowedSignature(buf: Buffer): boolean {
  return (
    startsWith(buf, [0xff, 0xd8, 0xff]) ||
    startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8))
  );
}

const resized = (input: Buffer, size: number, quality?: number) =>
  sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp(quality ? { quality } : undefined)
    .toBuffer({ resolveWithObject: true });

/** Validates, normalizes (EXIF rotation, no metadata) and renders the main and thumbnail webp. */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  try {
    if (!hasAllowedSignature(input)) throw invalid('지원하지 않는 이미지 형식입니다');
    const { format } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'error',
    }).metadata();
    if (!format || !ALLOWED_FORMATS.has(format)) {
      throw invalid('지원하지 않는 이미지 형식입니다');
    }
    // The thumbnail comes from the already rotated 1600px main, so the input is decoded once.
    const main = await resized(input, 1600, 82);
    const thumb = await resized(main.data, 320);
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
