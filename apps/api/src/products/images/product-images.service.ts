import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ProductImage as ProductImageDto } from '@bo/contracts';
import { Repository } from 'typeorm';
import { AppException } from '../../common/app-exception.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';
import { ProductImage } from '../product-image.entity.js';
import { toImage } from '../product-mapper.js';
import { processImage } from './image-processor.js';

@Injectable()
export class ProductImagesService {
  constructor(
    @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async upload(file: Buffer | undefined): Promise<ProductImageDto> {
    if (!file) {
      throw new AppException(400, 'VALIDATION_FAILED', '파일이 필요합니다', [
        { field: 'file', messages: ['파일이 필요합니다'] },
      ]);
    }
    // Fully process in memory first so validation failures never touch storage.
    const { main, thumb } = await processImage(file);

    const now = new Date();
    const dir = `products/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const id = randomUUID();
    const objectKey = `${dir}/${id}.webp`;
    const thumbKey = `${dir}/${id}_thumb.webp`;

    try {
      await this.storage.put(objectKey, main.data, 'image/webp');
      await this.storage.put(thumbKey, thumb.data, 'image/webp');
      const saved = await this.images.save(
        this.images.create({
          objectKey,
          thumbKey,
          width: main.width,
          height: main.height,
          sortOrder: 0,
          isPrimary: false,
          productId: null,
        }),
      );
      return toImage(saved);
    } catch (err) {
      await this.storage.delete([objectKey, thumbKey]).catch(() => undefined);
      throw err;
    }
  }
}
