import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1795154380466 implements MigrationInterface {
  name = 'CreateRefreshTokens1795154380466';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "userId" uuid NOT NULL, "tokenHash" character varying NOT NULL, "familyId" uuid NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "replacedById" uuid, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_610102b60fea1455310ccd299d" ON "refresh_tokens" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c25bc63d248ca90e8dcc1d92d0" ON "refresh_tokens" ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40e9a8b923a1b3fb4429a5c624" ON "refresh_tokens" ("familyId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_40e9a8b923a1b3fb4429a5c624"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c25bc63d248ca90e8dcc1d92d0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_610102b60fea1455310ccd299d"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
