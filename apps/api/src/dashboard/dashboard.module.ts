import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, { provide: CLOCK, useValue: systemClock }],
})
export class DashboardModule {}
