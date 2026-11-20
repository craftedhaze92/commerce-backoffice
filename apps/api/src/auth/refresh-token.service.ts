import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { RefreshToken } from './refresh-token.entity.js';

export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken) private readonly repo: Repository<RefreshToken>,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(
    userId: string,
    familyId: string = randomUUID(),
  ): Promise<{ raw: string; record: RefreshToken }> {
    const raw = randomBytes(32).toString('base64url');
    const record = await this.repo.save(
      this.repo.create({
        userId,
        familyId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_SEC * 1000),
        revokedAt: null,
        replacedById: null,
      }),
    );
    return { raw, record };
  }

  /** Revokes every still-active token in the family of the given raw token. */
  async revokeFamilyByRaw(raw: string): Promise<void> {
    const rec = await this.repo.findOneBy({ tokenHash: hashToken(raw) });
    if (!rec) return;
    await this.repo.update({ familyId: rec.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
