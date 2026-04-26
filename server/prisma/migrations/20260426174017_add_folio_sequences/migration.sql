-- CreateTable
CREATE TABLE "folio_sequences" (
    "scope" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folio_sequences_pkey" PRIMARY KEY ("scope","year")
);
