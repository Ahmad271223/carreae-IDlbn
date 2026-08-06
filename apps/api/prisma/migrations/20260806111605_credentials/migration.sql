-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('SCHOOL_LEAVING', 'DEGREE', 'TRANSCRIPT', 'ENROLLMENT', 'LANGUAGE', 'COURSE', 'CERTIFICATE', 'EMPLOYMENT');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('OFFERED', 'ACTIVE', 'DECLINED_BY_SUBJECT', 'EXPIRED', 'REVOKED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "credentials" (
    "id" TEXT NOT NULL,
    "issuer_organization_id" TEXT NOT NULL,
    "subject_user_id" TEXT NOT NULL,
    "credential_type" "CredentialType" NOT NULL,
    "payload" JSONB NOT NULL,
    "country_code" TEXT,
    "education_system" TEXT,
    "credential_framework" TEXT,
    "language" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "status" "CredentialStatus" NOT NULL DEFAULT 'OFFERED',
    "superseded_by_id" TEXT,
    "verification_method" TEXT NOT NULL DEFAULT 'ISSUER_VERIFIED',
    "evidence" JSONB,
    "document_id" TEXT,
    "signature" JSONB NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_status_history" (
    "id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "from_status" "CredentialStatus",
    "to_status" "CredentialStatus" NOT NULL,
    "actor_user_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credentials_superseded_by_id_key" ON "credentials"("superseded_by_id");

-- CreateIndex
CREATE INDEX "credentials_subject_user_id_status_idx" ON "credentials"("subject_user_id", "status");

-- CreateIndex
CREATE INDEX "credentials_issuer_organization_id_idx" ON "credentials"("issuer_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "credentials_issuer_organization_id_idempotency_key_key" ON "credentials"("issuer_organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "credential_status_history_credential_id_created_at_idx" ON "credential_status_history"("credential_id", "created_at");

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_issuer_organization_id_fkey" FOREIGN KEY ("issuer_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_status_history" ADD CONSTRAINT "credential_status_history_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
