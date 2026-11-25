import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DEMO_ACCOUNT_EMAILS,
  Role,
  type ConflictReason,
  type Paginated,
  type UserListItem,
} from '@bo/contracts';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { normalizeEmail } from '../common/email.js';
import { toPaginated } from '../common/pagination.js';
import { hashPassword } from '../common/password.js';
import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './user.entity.js';

const DEMO_EMAILS: ReadonlySet<string> = new Set(DEMO_ACCOUNT_EMAILS);

/** With `DEMO_MODE=true`, `POST /users` is rejected once the table holds this many rows. */
export const DEMO_MAX_USERS = 20;

const conflict = (reason: ConflictReason, message: string) =>
  new AppException(409, 'CONFLICT', message, { reason });

function toItem(u: User): UserListItem {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  async list(page: number, size: number): Promise<Paginated<UserListItem>> {
    const [rows, total] = await this.users.findAndCount({
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * size,
      take: size,
    });
    return toPaginated(rows.map(toItem), total, page, size);
  }

  /**
   * With `DEMO_MODE=true` the public demo caps the users table at `DEMO_MAX_USERS`. The count and
   * the insert share one transaction behind an advisory lock, so concurrent creates cannot both
   * pass the check.
   */
  async create(dto: CreateUserDto): Promise<UserListItem> {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.dataSource.transaction(async (m) => {
        if (this.env.DEMO_MODE) {
          await m.query(`SELECT pg_advisory_xact_lock(hashtext('users:create'))`);
          const count = await m.count(User);
          if (count >= DEMO_MAX_USERS) {
            throw new AppException(
              403,
              'DEMO_PROTECTED',
              `Demo mode allows at most ${DEMO_MAX_USERS} users`,
            );
          }
        }
        const user = await m.save(
          m.create(User, { email: dto.email, name: dto.name, role: dto.role, passwordHash }),
        );
        return toItem(user);
      });
    } catch (err) {
      // The only unique key on users besides the generated id is the (normalized) email.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw conflict('EMAIL_TAKEN', 'Email already exists');
      }
      throw err;
    }
  }

  /**
   * Checks run in this order: 404 → SELF_CHANGE → DEMO_PROTECTED (any change to a demo account) → LAST_ADMIN (under a lock on
   * every active ADMIN row) → update → revoke refresh tokens on deactivation. Every rejection
   * happens before any write, so the transaction simply rolls back.
   */
  async update(actorId: string, id: string, dto: UpdateUserDto): Promise<UserListItem> {
    const { role, isActive, name } = dto;
    if (role === undefined && isActive === undefined && name === undefined) {
      throw new AppException(400, 'VALIDATION_FAILED', 'At least one field is required');
    }
    const changesAccess = role !== undefined || isActive !== undefined;

    return this.dataSource.transaction(async (m) => {
      const target = await m.findOneBy(User, { id });
      if (!target) throw new AppException(404, 'NOT_FOUND', 'User not found');

      if (changesAccess && actorId === id) {
        throw conflict('SELF_CHANGE', 'Cannot change your own role or active state');
      }
      if (this.env.DEMO_MODE && DEMO_EMAILS.has(target.email)) {
        throw new AppException(403, 'DEMO_PROTECTED', 'Demo accounts cannot be changed');
      }

      if (changesAccess) {
        // Locking every active ADMIN serializes concurrent demotions: the second one re-reads
        // the set after the first commits and sees the target as the last admin.
        const admins = (await m.query(
          `SELECT id FROM users WHERE role = $1 AND "isActive" ORDER BY id FOR UPDATE`,
          [Role.ADMIN],
        )) as Array<{ id: string }>;
        const isActiveAdmin = admins.some((a) => a.id === id);
        const staysActiveAdmin = (role ?? Role.ADMIN) === Role.ADMIN && (isActive ?? true) === true;
        if (isActiveAdmin && !staysActiveAdmin && admins.length <= 1) {
          throw conflict('LAST_ADMIN', 'Cannot demote or deactivate the last active admin');
        }
      }

      const patch: Partial<Pick<User, 'role' | 'isActive' | 'name'>> = {};
      if (role !== undefined) patch.role = role;
      if (isActive !== undefined) patch.isActive = isActive;
      if (name !== undefined) patch.name = name;
      await m.update(User, { id }, patch);

      if (isActive === false) {
        await m.query(
          `UPDATE refresh_tokens SET "revokedAt" = now() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
          [id],
        );
      }

      return toItem(await m.findOneByOrFail(User, { id }));
    });
  }
}
