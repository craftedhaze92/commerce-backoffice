import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryHistory } from './inventory-history.entity.js';
import { InventoryLedger } from './inventory-ledger.js';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryHistory])],
  providers: [InventoryLedger],
  exports: [InventoryLedger],
})
export class InventoryModule {}
