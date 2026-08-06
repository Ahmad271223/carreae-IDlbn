-- CreateEnum
CREATE TYPE "RenderSourceType" AS ENUM ('CV', 'COVER_LETTER');

-- CreateEnum
CREATE TYPE "RenderJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "source_type" "RenderSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "rendered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "render_jobs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" "RenderSourceType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "RenderJobStatus" NOT NULL DEFAULT 'QUEUED',
    "document_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_versions_source_type_source_id_rendered_at_idx" ON "document_versions"("source_type", "source_id", "rendered_at");

-- CreateIndex
CREATE INDEX "render_jobs_user_id_created_at_idx" ON "render_jobs"("user_id", "created_at");
