-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "application_submissions" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "share_package_id" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'RECEIVED',
    "note" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_submissions_organization_id_status_submitted_at_idx" ON "application_submissions"("organization_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "application_submissions_application_id_organization_id_key" ON "application_submissions"("application_id", "organization_id");

-- AddForeignKey
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_submissions" ADD CONSTRAINT "application_submissions_share_package_id_fkey" FOREIGN KEY ("share_package_id") REFERENCES "share_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
