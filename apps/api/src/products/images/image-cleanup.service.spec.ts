import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ObjectStorage } from '../../storage/object-storage.js';
import { ImageCleanupService } from './image-cleanup.service.js';

describe('ImageCleanupService.handleCron', () => {
  it('swallows a failed run and logs it, so the cron never crashes the app', async () => {
    const dataSource = {
      transaction: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as DataSource;
    const del = vi.fn();
    const storage: ObjectStorage = { put: vi.fn(), delete: del };
    const service = new ImageCleanupService(dataSource, storage, () => new Date());
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      await expect(service.handleCron()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledTimes(1);
      expect(del).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
