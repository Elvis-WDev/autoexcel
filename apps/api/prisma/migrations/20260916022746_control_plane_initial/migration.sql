-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('draft', 'uploaded', 'sheet_selected', 'analyzing', 'reviewing_entities', 'reviewing_fields', 'reviewing_relations', 'reviewing_summary', 'creating', 'importing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "status" "project_status" NOT NULL DEFAULT 'draft',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_file" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet" (
    "id" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "headerRowIndex" INTEGER,
    "included" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_column" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "header" TEXT NOT NULL,
    "normalizedHeader" TEXT NOT NULL,
    "profile" JSONB NOT NULL,

    CONSTRAINT "source_column_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "project_schemaName_key" ON "project"("schemaName");

-- CreateIndex
CREATE INDEX "project_ownerId_createdAt_idx" ON "project"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_ownerId_slug_key" ON "project"("ownerId", "slug");

-- CreateIndex
CREATE INDEX "source_file_projectId_idx" ON "source_file"("projectId");

-- CreateIndex
CREATE INDEX "sheet_sourceFileId_idx" ON "sheet"("sourceFileId");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_sourceFileId_index_key" ON "sheet"("sourceFileId", "index");

-- CreateIndex
CREATE INDEX "source_column_sheetId_idx" ON "source_column"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "source_column_sheetId_index_key" ON "source_column"("sheetId", "index");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_file" ADD CONSTRAINT "source_file_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet" ADD CONSTRAINT "sheet_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "source_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_column" ADD CONSTRAINT "source_column_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
