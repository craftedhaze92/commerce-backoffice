import { Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

const systemClock: Clock = () => new Date();

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, { provide: CLOCK, useValue: systemClock }],
})
export class DashboardModule {}
