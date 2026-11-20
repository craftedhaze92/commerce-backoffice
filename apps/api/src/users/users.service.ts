import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Paginated, UserListItem } from '@bo/contracts';
import { Repository } from 'typeorm';
import { normalizeEmail } from '../common/email.js';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

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
    return {
      items: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt.toISOString(),
      })),
      meta: { page, size, total, totalPages: Math.ceil(total / size) },
    };
  }
}
