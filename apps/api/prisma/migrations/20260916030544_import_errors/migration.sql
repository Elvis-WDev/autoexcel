-- AlterTable
ALTER TABLE "job" ADD COLUMN     "result" JSONB;

-- CreateTable
CREATE TABLE "import_row_error" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "entityLabel" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "rawRow" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_error_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_row_error_jobId_idx" ON "import_row_error"("jobId");

-- AddForeignKey
ALTER TABLE "import_row_error" ADD CONSTRAINT "import_row_error_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
