import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators.js';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', db: 'up' };
  }
}
