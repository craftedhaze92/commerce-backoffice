import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { User } from '../users/user.entity.js';
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
    manager: EntityManager = this.repo.manager,
  ): Promise<{ raw: string; record: RefreshToken }> {
    const repo = manager.getRepository(RefreshToken);
    const raw = randomBytes(32).toString('base64url');
    const record = await repo.save(
      repo.create({
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

  /**
   * Rotates a refresh token inside one transaction. The presented row is locked so
   * concurrent requests with the same token serialize; the loser sees it as revoked.
   * Reuse revokes the whole family and commits that revocation before throwing.
   */
  async rotate(raw: string): Promise<{ userId: string; next: { raw: string } }> {
    type Outcome =
      | { kind: 'ok'; userId: string; nextRaw: string }
      | { kind: 'reused' }
      | { kind: 'invalid' };

    const outcome = await this.repo.manager.transaction(async (manager): Promise<Outcome> => {
      const repo = manager.getRepository(RefreshToken);
      const rec = await repo.findOne({
        where: { tokenHash: hashToken(raw) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!rec) return { kind: 'invalid' };
      if (rec.revokedAt) {
        await this.revokeFamilyWith(manager, rec.familyId);
        return { kind: 'reused' };
      }
      if (rec.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' };
      const user = await manager.getRepository(User).findOneBy({ id: rec.userId });
      if (!user || !user.isActive) return { kind: 'invalid' };

      const next = await this.issue(rec.userId, rec.familyId, manager);
      await repo.update({ id: rec.id }, { revokedAt: new Date(), replacedById: next.record.id });
      return { kind: 'ok', userId: rec.userId, nextRaw: next.raw };
    });

    if (outcome.kind === 'reused') {
      throw new AppException(401, 'TOKEN_REUSED', 'Refresh token reuse detected');
    }
    if (outcome.kind === 'invalid') {
      throw new AppException(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    return { userId: outcome.userId, next: { raw: outcome.nextRaw } };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.revokeFamilyWith(this.repo.manager, familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Revokes every still-active token in the family of the given raw token. */
  async revokeFamilyByRaw(raw: string): Promise<void> {
    const rec = await this.repo.findOneBy({ tokenHash: hashToken(raw) });
    if (!rec) return;
    await this.revokeFamily(rec.familyId);
  }

  private async revokeFamilyWith(manager: EntityManager, familyId: string): Promise<void> {
    await manager
      .getRepository(RefreshToken)
      .update({ familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }
}
