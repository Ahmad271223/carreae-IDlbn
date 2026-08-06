-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('JOB', 'UNIVERSITY', 'GENERAL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "ApplicationItemType" AS ENUM ('CV', 'COVER_LETTER', 'DOCUMENT', 'CREDENTIAL', 'REFERENCE', 'PORTFOLIO', 'SECTION');

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "recipient_name" TEXT,
    "job_description" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_items" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "item_type" "ApplicationItemType" NOT NULL,
    "item_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "application_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_user_id_idx" ON "applications"("user_id");

-- CreateIndex
CREATE INDEX "application_items_application_id_order_idx" ON "application_items"("application_id", "order");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_items" ADD CONSTRAINT "application_items_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
