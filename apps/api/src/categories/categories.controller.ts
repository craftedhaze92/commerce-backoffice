import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type Category } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { CategoriesService } from './categories.service.js';

@ApiCookieAuth('bo_at')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Roles(Role.VIEWER)
  @Get()
  list(): Promise<Category[]> {
    return this.categories.list();
  }
}
