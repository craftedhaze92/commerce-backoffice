import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalog1795158425859 implements MigrationInterface {
  name = 'CreateCatalog1795158425859';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" character varying(50) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_images" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "productId" uuid, "objectKey" character varying NOT NULL, "thumbKey" character varying NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "sortOrder" integer NOT NULL DEFAULT '0', "isPrimary" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_77d245a524a076317245280de4e" UNIQUE ("objectKey"), CONSTRAINT "PK_1974264ea7265989af8392f63a1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."products_status_enum" AS ENUM('DRAFT', 'ON_SALE', 'SOLD_OUT', 'HIDDEN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "sku" character varying(32) NOT NULL, "name" character varying(100) NOT NULL, "categoryId" uuid NOT NULL, "price" integer NOT NULL, "status" "public"."products_status_enum" NOT NULL DEFAULT 'DRAFT', "description" text NOT NULL DEFAULT '', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "CHK_products_price_nonneg" CHECK ("price" >= 0), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "inventories" ("productId" uuid NOT NULL, "quantity" integer NOT NULL, "safetyStock" integer NOT NULL DEFAULT '0', "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_inventories_safety_stock_nonneg" CHECK ("safetyStock" >= 0), CONSTRAINT "CHK_inventories_quantity_nonneg" CHECK ("quantity" >= 0), CONSTRAINT "PK_19f6e91bd3b53e47103305f3f84" PRIMARY KEY ("productId"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_products_sku_live" ON "products" ("sku") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "FK_b367708bf720c8dd62fc6833161" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_ff56834e735fa78a15d0cf21926" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventories" ADD CONSTRAINT "FK_19f6e91bd3b53e47103305f3f84" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_products_sku_live"`);
    await queryRunner.query(
      `ALTER TABLE "inventories" DROP CONSTRAINT "FK_19f6e91bd3b53e47103305f3f84"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_ff56834e735fa78a15d0cf21926"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_b367708bf720c8dd62fc6833161"`,
    );
    await queryRunner.query(`DROP TABLE "inventories"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
