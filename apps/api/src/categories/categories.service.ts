import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Category as CategoryDto } from '@bo/contracts';
import { Repository } from 'typeorm';
import { Category } from './category.entity.js';

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(Category) private readonly categories: Repository<Category>) {}

  async list(): Promise<CategoryDto[]> {
    const rows = await this.categories.find({ order: { name: 'ASC' } });
    return rows.map((c) => ({ id: c.id, name: c.name }));
  }
}
