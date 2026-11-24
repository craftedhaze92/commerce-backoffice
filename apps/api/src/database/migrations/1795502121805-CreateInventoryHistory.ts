import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryHistory1795502121805 implements MigrationInterface {
  name = 'CreateInventoryHistory1795502121805';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."inventory_histories_reason_enum" AS ENUM('ORDER_CONFIRM', 'ORDER_CANCEL', 'MANUAL_ADJUST')`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventory_histories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "productId" uuid NOT NULL, "delta" integer NOT NULL, "quantityAfter" integer NOT NULL, "reason" "public"."inventory_histories_reason_enum" NOT NULL, "note" character varying(200), "refOrderId" uuid, "actorId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_inventory_histories_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_inventory_histories_product_created" ON "inventory_histories" ("productId", "createdAt" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_histories" ADD CONSTRAINT "FK_inventory_histories_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_histories" ADD CONSTRAINT "FK_inventory_histories_actor" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_histories" DROP CONSTRAINT "FK_inventory_histories_actor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_histories" DROP CONSTRAINT "FK_inventory_histories_product"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_inventory_histories_product_created"`);
    await queryRunner.query(`DROP TABLE "inventory_histories"`);
    await queryRunner.query(`DROP TYPE "public"."inventory_histories_reason_enum"`);
  }
}
