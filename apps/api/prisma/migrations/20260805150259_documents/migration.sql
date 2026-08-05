-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('CV', 'COVER_LETTER', 'CERTIFICATE', 'TRANSCRIPT', 'REFERENCE', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentOrigin" AS ENUM ('USER_UPLOADED', 'PLATFORM_GENERATED', 'INSTITUTION_ISSUED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "category" "DocumentCategory" NOT NULL,
    "origin" "DocumentOrigin" NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "storage_key" TEXT NOT NULL,
    "checksum_sha256" TEXT,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "encryption_key_ref" TEXT,
    "language" TEXT,
    "version_of_id" TEXT,
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_owner_user_id_category_idx" ON "documents"("owner_user_id", "category");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_version_of_id_fkey" FOREIGN KEY ("version_of_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
