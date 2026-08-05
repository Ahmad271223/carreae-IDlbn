-- CreateEnum
CREATE TYPE "OauthPurpose" AS ENUM ('LOGIN', 'LINK');

-- AlterEnum
ALTER TYPE "ActionTokenType" ADD VALUE 'MFA_CHALLENGE';

-- AlterTable
ALTER TABLE "auth_credentials" ADD COLUMN     "confirmed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "purpose" "OauthPurpose" NOT NULL,
    "user_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_state_hash_key" ON "oauth_states"("state_hash");
