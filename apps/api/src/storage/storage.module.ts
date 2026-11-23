import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { OBJECT_STORAGE, S3ObjectStorage } from './object-storage.js';

@Global()
@Module({
  providers: [
    { provide: OBJECT_STORAGE, inject: [ENV], useFactory: (env: Env) => new S3ObjectStorage(env) },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
