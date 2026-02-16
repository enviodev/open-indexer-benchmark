module.exports = class Data1771247859560 {
    name = 'Data1771247859560'

    async up(db) {
        await db.query(`CREATE TABLE "account" ("id" character varying NOT NULL, "balance" numeric NOT NULL, CONSTRAINT "PK_54115ee388cdb6d86bb4bf5b2ea" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "transfer_event" ("id" character varying NOT NULL, "amount" numeric NOT NULL, "timestamp" integer NOT NULL, "from" text NOT NULL, "to" text NOT NULL, CONSTRAINT "PK_2a4e1dce9f72514cd28f554ee2d" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_e3f2115e36145e7e44e40f3d6e" ON "transfer_event" ("from") `)
        await db.query(`CREATE INDEX "IDX_d89c05d6a45f28bb97b161b696" ON "transfer_event" ("to") `)
        await db.query(`CREATE TABLE "allowance" ("id" character varying NOT NULL, "amount" numeric NOT NULL, "owner" text NOT NULL, "spender" text NOT NULL, CONSTRAINT "PK_198827bad8821d4045fd0f699c1" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_ab56aaf0b8e6bfd1974bee0ad6" ON "allowance" ("owner") `)
        await db.query(`CREATE INDEX "IDX_cb5deb3388ae9ce01aee0bd0b9" ON "allowance" ("spender") `)
        await db.query(`CREATE TABLE "approval_event" ("id" character varying NOT NULL, "amount" numeric NOT NULL, "timestamp" integer NOT NULL, "owner" text NOT NULL, "spender" text NOT NULL, CONSTRAINT "PK_4a04c4c5639ee9d282c55fac735" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_66738eac40ffe8cb9a983934ee" ON "approval_event" ("owner") `)
        await db.query(`CREATE INDEX "IDX_8639c37d511fdd6b468c0864d2" ON "approval_event" ("spender") `)
    }

    async down(db) {
        await db.query(`DROP TABLE "account"`)
        await db.query(`DROP TABLE "transfer_event"`)
        await db.query(`DROP INDEX "public"."IDX_e3f2115e36145e7e44e40f3d6e"`)
        await db.query(`DROP INDEX "public"."IDX_d89c05d6a45f28bb97b161b696"`)
        await db.query(`DROP TABLE "allowance"`)
        await db.query(`DROP INDEX "public"."IDX_ab56aaf0b8e6bfd1974bee0ad6"`)
        await db.query(`DROP INDEX "public"."IDX_cb5deb3388ae9ce01aee0bd0b9"`)
        await db.query(`DROP TABLE "approval_event"`)
        await db.query(`DROP INDEX "public"."IDX_66738eac40ffe8cb9a983934ee"`)
        await db.query(`DROP INDEX "public"."IDX_8639c37d511fdd6b468c0864d2"`)
    }
}
