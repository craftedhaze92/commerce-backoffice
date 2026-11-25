import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CLOCK, type Clock } from '../../common/clock.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../storage/object-storage.js';

/** 한 트랜잭션에서 지우는 최대 행 수. 키는 행당 2개라 S3 DeleteObjects 한도(1000)에 맞는다. */
const BATCH_SIZE = 500;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/** 정리 대상 조건. `img`는 product_images, `$1`은 기준 시각(now − 24h)이다. */
const ORPHAN_CONDITION = `(
  (img."productId" IS NULL AND img."createdAt" < $1)
  OR EXISTS (
    SELECT 1 FROM products p WHERE p.id = img."productId" AND p."deletedAt" < $1
  )
)`;

export interface ImageCleanupResult {
  deletedRows: number;
  deletedKeys: number;
}

/**
 * 어느 상품에도 쓰이지 않는 이미지를 지운다(설계서 §9-6).
 * - 24시간 넘게 연결되지 않은 업로드(저장하지 않은 업로드, PATCH로 떼어낸 이미지)
 * - 24시간 넘게 소프트 삭제 상태인 상품의 이미지
 *
 * 행은 트랜잭션 안에서 `FOR UPDATE SKIP LOCKED`로 잠가 지운다. 연결 중인 이미지(lockImages가 잠근 행)는
 * 건너뛰고, 정리가 먼저 지운 이미지는 연결 쪽이 "image not found"(400)로 실패한다.
 * 스토리지 오브젝트는 커밋 뒤에 지우므로 DB가 없는 키를 가리키는 일은 생기지 않는다.
 */
@Injectable()
export class ImageCleanupService {
  private readonly logger = new Logger(ImageCleanupService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // 테스트에서는 실제 시각에 따라 돌지 않도록 시작하지 않는다. e2e는 run()을 직접 부른다.
  @Cron('0 0 4 * * *', {
    name: 'image-cleanup',
    timeZone: 'Asia/Seoul',
    waitForCompletion: true,
    disabled: process.env.NODE_ENV === 'test',
  })
  async handleCron(): Promise<void> {
    try {
      const result = await this.run();
      this.logger.log(
        `Image cleanup done: ${result.deletedRows} rows, ${result.deletedKeys} objects`,
      );
    } catch (err) {
      this.logger.error('Image cleanup failed', err instanceof Error ? err.stack : String(err));
    }
  }

  async run(): Promise<ImageCleanupResult> {
    const cutoff = new Date(this.clock().getTime() - ORPHAN_AGE_MS);
    const total: ImageCleanupResult = { deletedRows: 0, deletedKeys: 0 };
    for (;;) {
      const { picked, deleted, keys } = await this.deleteBatch(cutoff);
      total.deletedRows += deleted;
      if (keys.length > 0) total.deletedKeys += await this.deleteObjects(keys);
      // 덜 찼으면 남은 대상이 없다(잠긴 행은 다음 실행에서 다시 본다).
      if (picked < BATCH_SIZE || deleted === 0) return total;
    }
  }

  /** 한 배치를 잠가 지우고 커밋한다. 반환된 키는 이미 커밋된 삭제의 것이다. */
  private deleteBatch(cutoff: Date): Promise<{ picked: number; deleted: number; keys: string[] }> {
    return this.dataSource.transaction(async (m) => {
      const rows = (await m.query(
        `SELECT img.id FROM product_images img
         WHERE ${ORPHAN_CONDITION}
         ORDER BY img.id
         LIMIT ${BATCH_SIZE}
         FOR UPDATE OF img SKIP LOCKED`,
        [cutoff],
      )) as Array<{ id: string }>;
      if (rows.length === 0) return { picked: 0, deleted: 0, keys: [] };

      // 조건을 다시 확인해 그 사이 연결된 이미지는 지우지 않는다.
      const [deleted] = (await m.query(
        `DELETE FROM product_images img
         WHERE img.id = ANY($2::uuid[]) AND ${ORPHAN_CONDITION}
         RETURNING img."objectKey", img."thumbKey"`,
        [cutoff, rows.map((r) => r.id)],
      )) as [Array<{ objectKey: string; thumbKey: string }>, number];
      return {
        picked: rows.length,
        deleted: deleted.length,
        keys: deleted.flatMap((d) => [d.objectKey, d.thumbKey]),
      };
    });
  }

  /** 실패해도 고아 오브젝트만 남으므로 경고만 남긴다. 지운 키 수를 돌려준다. */
  private async deleteObjects(keys: string[]): Promise<number> {
    try {
      await this.storage.delete(keys);
      return keys.length;
    } catch (err) {
      this.logger.warn(
        `Failed to delete ${keys.length} orphan objects from storage: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }
}
