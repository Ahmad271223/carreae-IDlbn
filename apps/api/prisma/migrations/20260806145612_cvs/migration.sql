-- CreateEnum
CREATE TYPE "CvItemSourceType" AS ENUM ('EXPERIENCE', 'EDUCATION', 'CREDENTIAL', 'LANGUAGE', 'SKILL', 'CUSTOM');

-- CreateTable
CREATE TABLE "cvs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "target_country_code" TEXT,
    "photo_enabled" BOOLEAN NOT NULL DEFAULT false,
    "section_order" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cvs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_items" (
    "id" TEXT NOT NULL,
    "cv_id" TEXT NOT NULL,
    "source_type" "CvItemSourceType" NOT NULL,
    "source_id" TEXT,
    "display_override" JSONB,
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cv_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cvs_user_id_idx" ON "cvs"("user_id");

-- CreateIndex
CREATE INDEX "cv_items_cv_id_order_idx" ON "cv_items"("cv_id", "order");

-- AddForeignKey
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_items" ADD CONSTRAINT "cv_items_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
