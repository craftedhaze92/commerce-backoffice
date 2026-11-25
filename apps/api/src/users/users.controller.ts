import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-error.schema.js';
import { Role, type Paginated, type UserListItem } from '@bo/contracts';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQuery } from './dto/list-users.query.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@ApiCookieAuth('bo_at')
@ApiTags('users')
@ApiErrors()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Roles(Role.ADMIN)
  @Get()
  list(@Query() q: ListUsersQuery): Promise<Paginated<UserListItem>> {
    return this.users.list(q.page, q.size);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto): Promise<UserListItem> {
    return this.users.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ): Promise<UserListItem> {
    return this.users.update(user.id, id, dto);
  }
}
