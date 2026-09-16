-- CreateEnum
CREATE TYPE "blueprint_status" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "blueprint_origin" AS ENUM ('inferred', 'fallback');

-- CreateEnum
CREATE TYPE "field_type" AS ENUM ('text', 'integer', 'decimal', 'boolean', 'date', 'datetime', 'email', 'phone', 'select', 'relation');

-- CreateEnum
CREATE TYPE "entity_origin" AS ENUM ('sheet', 'derived');

-- CreateEnum
CREATE TYPE "relation_type" AS ENUM ('one_to_many', 'many_to_one');

-- CreateEnum
CREATE TYPE "job_kind" AS ENUM ('analysis', 'build', 'import');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'completed', 'partial', 'failed');

-- CreateTable
CREATE TABLE "blueprint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "applicationName" TEXT NOT NULL,
    "status" "blueprint_status" NOT NULL DEFAULT 'draft',
    "origin" "blueprint_origin" NOT NULL,
    "notes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blueprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bp_entity" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "origin" "entity_origin" NOT NULL,
    "sourceSheetIndex" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "displayFieldId" TEXT,
    "dedupeFieldId" TEXT,

    CONSTRAINT "bp_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bp_field" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "field_type" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "targetEntityId" TEXT,
    "sourceSheetIndex" INTEGER,
    "sourceColumnIndex" INTEGER,
    "isInferred" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bp_field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bp_relation" (
    "id" TEXT NOT NULL,
    "blueprintId" TEXT NOT NULL,
    "fromEntityId" TEXT NOT NULL,
    "toEntityId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "type" "relation_type" NOT NULL DEFAULT 'many_to_one',

    CONSTRAINT "bp_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "job_kind" NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blueprint_projectId_key" ON "blueprint"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "bp_entity_displayFieldId_key" ON "bp_entity"("displayFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "bp_entity_dedupeFieldId_key" ON "bp_entity"("dedupeFieldId");

-- CreateIndex
CREATE INDEX "bp_entity_blueprintId_idx" ON "bp_entity"("blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "bp_entity_blueprintId_name_key" ON "bp_entity"("blueprintId", "name");

-- CreateIndex
CREATE INDEX "bp_field_entityId_idx" ON "bp_field"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "bp_field_entityId_name_key" ON "bp_field"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bp_relation_fieldId_key" ON "bp_relation"("fieldId");

-- CreateIndex
CREATE INDEX "bp_relation_blueprintId_idx" ON "bp_relation"("blueprintId");

-- CreateIndex
CREATE UNIQUE INDEX "bp_relation_blueprintId_fromEntityId_toEntityId_fieldId_key" ON "bp_relation"("blueprintId", "fromEntityId", "toEntityId", "fieldId");

-- CreateIndex
CREATE INDEX "job_projectId_createdAt_idx" ON "job"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "blueprint" ADD CONSTRAINT "blueprint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_entity" ADD CONSTRAINT "bp_entity_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_entity" ADD CONSTRAINT "bp_entity_displayFieldId_fkey" FOREIGN KEY ("displayFieldId") REFERENCES "bp_field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_entity" ADD CONSTRAINT "bp_entity_dedupeFieldId_fkey" FOREIGN KEY ("dedupeFieldId") REFERENCES "bp_field"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_field" ADD CONSTRAINT "bp_field_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "bp_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_field" ADD CONSTRAINT "bp_field_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "bp_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_relation" ADD CONSTRAINT "bp_relation_blueprintId_fkey" FOREIGN KEY ("blueprintId") REFERENCES "blueprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_relation" ADD CONSTRAINT "bp_relation_fromEntityId_fkey" FOREIGN KEY ("fromEntityId") REFERENCES "bp_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_relation" ADD CONSTRAINT "bp_relation_toEntityId_fkey" FOREIGN KEY ("toEntityId") REFERENCES "bp_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bp_relation" ADD CONSTRAINT "bp_relation_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "bp_field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
