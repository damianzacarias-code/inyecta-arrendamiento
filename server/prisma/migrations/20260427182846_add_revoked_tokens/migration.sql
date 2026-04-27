-- CreateTable
CREATE TABLE "revoked_tokens" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "revoked_tokens_expiresAt_idx" ON "revoked_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "revoked_tokens_userId_idx" ON "revoked_tokens"("userId");

-- AddForeignKey
ALTER TABLE "revoked_tokens" ADD CONSTRAINT "revoked_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
