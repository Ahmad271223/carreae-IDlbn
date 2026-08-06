-- CreateEnum
CREATE TYPE "CoverLetterConvention" AS ENUM ('DE', 'FR', 'EN', 'AR');

-- CreateEnum
CREATE TYPE "CoverLetterBlockType" AS ENUM ('RECIPIENT', 'SUBJECT', 'SALUTATION', 'OPENING', 'BODY', 'CLOSING', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "BlockOrigin" AS ENUM ('USER', 'AI_GENERATED', 'AI_EDITED');

-- CreateTable
CREATE TABLE "cover_letters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "application_id" TEXT,
    "layout_template" TEXT NOT NULL,
    "convention" "CoverLetterConvention" NOT NULL,
    "language" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cover_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cover_letter_blocks" (
    "id" TEXT NOT NULL,
    "cover_letter_id" TEXT NOT NULL,
    "type" "CoverLetterBlockType" NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "draft_content" TEXT,
    "origin" "BlockOrigin" NOT NULL DEFAULT 'USER',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cover_letter_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cover_letters_user_id_idx" ON "cover_letters"("user_id");

-- CreateIndex
CREATE INDEX "cover_letter_blocks_cover_letter_id_order_idx" ON "cover_letter_blocks"("cover_letter_id", "order");

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letter_blocks" ADD CONSTRAINT "cover_letter_blocks_cover_letter_id_fkey" FOREIGN KEY ("cover_letter_id") REFERENCES "cover_letters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
