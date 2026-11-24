import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type DashboardSummary } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { DashboardService } from './dashboard.service.js';

@ApiCookieAuth('bo_at')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(Role.VIEWER)
  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.dashboard.summary();
  }
}
