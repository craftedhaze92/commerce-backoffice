import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdersConfirmedAtIndex1795562284885 implements MigrationInterface {
  name = 'AddOrdersConfirmedAtIndex1795562284885';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_orders_confirmed" ON "orders"  ("confirmedAt") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_confirmed"`);
  }
}
