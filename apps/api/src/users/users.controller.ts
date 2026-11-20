import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type Paginated, type UserListItem } from '@bo/contracts';
import { Roles } from '../auth/decorators.js';
import { ListUsersQuery } from './dto/list-users.query.js';
import { UsersService } from './users.service.js';

@ApiCookieAuth('bo_at')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  list(@Query() q: ListUsersQuery): Promise<Paginated<UserListItem>> {
    return this.users.list(q.page, q.size);
  }
}
