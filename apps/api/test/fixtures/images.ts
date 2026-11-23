import sharp from 'sharp';

export const pngOf = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .png()
    .toBuffer();

/** 200x100 JPEG whose EXIF orientation is 6 (rotate 90deg), so it displays as 100x200. */
export const jpegWithExifRotation = (): Promise<Buffer> =>
  sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .withExif({ IFD0: { Copyright: 'bo-test' } })
    .jpeg()
    .toBuffer()
    .then((buf) => sharp(buf).withMetadata({ orientation: 6 }).jpeg().toBuffer());

export const fakePngText = (): Buffer => Buffer.from('this is plain text, not an image');

/** 8000x6000 = 48M pixels, over the 40M input limit. Solid color keeps it small. */
export const hugePixelsPng = (): Promise<Buffer> =>
  sharp({ create: { width: 8000, height: 6000, channels: 3, background: '#fff' } })
    .png({ compressionLevel: 9 })
    .toBuffer();
