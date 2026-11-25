import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators.js';

@ApiTags('health')
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
