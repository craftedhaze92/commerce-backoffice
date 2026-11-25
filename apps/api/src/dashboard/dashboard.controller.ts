import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-error.schema.js';
import { Role, type CategorySales, type DashboardSummary, type SalesTrend } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { PeriodQuery } from './dto/period.query.js';
import { DashboardService } from './dashboard.service.js';

@ApiCookieAuth('bo_at')
@ApiTags('dashboard')
@ApiErrors()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Roles(Role.VIEWER)
  @Get('summary')
  summary(): Promise<DashboardSummary> {
    return this.dashboard.summary();
  }

  @Roles(Role.VIEWER)
  @Get('sales-trend')
  salesTrend(@Query() q: PeriodQuery): Promise<SalesTrend> {
    return this.dashboard.salesTrend(q.days);
  }

  @Roles(Role.VIEWER)
  @Get('category-sales')
  categorySales(@Query() q: PeriodQuery): Promise<CategorySales> {
    return this.dashboard.categorySales(q.days);
  }
}
