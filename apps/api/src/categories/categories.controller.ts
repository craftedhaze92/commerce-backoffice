import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-error.schema.js';
import { Role, type Category } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { CategoriesService } from './categories.service.js';

@ApiCookieAuth('bo_at')
@ApiTags('categories')
@ApiErrors()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Roles(Role.VIEWER)
  @Get()
  list(): Promise<Category[]> {
    return this.categories.list();
  }
}
