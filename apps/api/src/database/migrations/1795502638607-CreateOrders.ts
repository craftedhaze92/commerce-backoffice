import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1795502638607 implements MigrationInterface {
  name = 'CreateOrders1795502638607';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderId" uuid NOT NULL, "productId" uuid NOT NULL, "sku" character varying(32) NOT NULL, "productName" character varying(100) NOT NULL, "quantity" integer NOT NULL, "unitPrice" integer NOT NULL, CONSTRAINT "CHK_order_items_unit_price_nonneg" CHECK ("unitPrice" >= 0), CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_order_items_order" ON "order_items" ("orderId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_product" ON "order_items" ("productId")`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_sequences" ("day" date NOT NULL, "last" integer NOT NULL, CONSTRAINT "PK_48b14b2a187da7079bd80c4e05e" PRIMARY KEY ("day"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_histories_fromstatus_enum" AS ENUM('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_histories_tostatus_enum" AS ENUM('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_status_histories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderId" uuid NOT NULL, "fromStatus" "public"."order_status_histories_fromstatus_enum", "toStatus" "public"."order_status_histories_tostatus_enum" NOT NULL, "actorId" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_28cee84c06f647cf7c806645b68" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_status_histories_order_created" ON "order_status_histories" ("orderId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "orderNo" character varying(20) NOT NULL, "customerName" character varying(50) NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "totalAmount" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "confirmedAt" TIMESTAMP WITH TIME ZONE, "cancelledAt" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_9e116d4adfd60229dc662a81b03" UNIQUE ("orderNo"), CONSTRAINT "CHK_orders_total_nonneg" CHECK ("totalAmount" >= 0), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_orders_created" ON "orders" ("createdAt" DESC)`);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_status_created" ON "orders" ("status", "createdAt" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_histories" ADD CONSTRAINT "FK_inventory_histories_order" FOREIGN KEY ("refOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_product" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_histories" ADD CONSTRAINT "FK_order_status_histories_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_histories" ADD CONSTRAINT "FK_order_status_histories_actor" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_status_histories" DROP CONSTRAINT "FK_order_status_histories_actor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_status_histories" DROP CONSTRAINT "FK_order_status_histories_order"`,
    );
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_product"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order"`);
    await queryRunner.query(
      `ALTER TABLE "inventory_histories" DROP CONSTRAINT "FK_inventory_histories_order"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_status_created"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_orders_created"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_status_histories_order_created"`);
    await queryRunner.query(`DROP TABLE "order_status_histories"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_histories_tostatus_enum"`);
    await queryRunner.query(`DROP TYPE "public"."order_status_histories_fromstatus_enum"`);
    await queryRunner.query(`DROP TABLE "order_sequences"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_product"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_order_items_order"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
  }
}
