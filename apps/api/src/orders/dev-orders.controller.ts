import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type OrderListItem } from '@bo/contracts';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { RandomOrdersDto } from './dto/random-orders.dto.js';
import { DevOnlyGuard } from './dev-only.guard.js';
import { DevOrdersService } from './dev-orders.service.js';

@ApiCookieAuth('bo_at')
@UseGuards(DevOnlyGuard)
@Controller('dev/orders')
export class DevOrdersController {
  constructor(private readonly dev: DevOrdersService) {}

  @Roles(Role.MANAGER)
  @Post('random')
  async random(
    @Body() dto: RandomOrdersDto,
    @CurrentUser() user: AuthUser,
  ): Promise<{ created: OrderListItem[] }> {
    return { created: await this.dev.createRandom(dto.count, user.id) };
  }
}
