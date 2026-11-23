import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImagesProductIdIndex1795300000000 implements MigrationInterface {
  name = 'AddProductImagesProductIdIndex1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_product_images_productId" ON "product_images" ("productId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_product_images_productId"`);
  }
}
