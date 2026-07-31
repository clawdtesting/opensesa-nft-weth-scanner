-- CreateTable
CREATE TABLE "DropRecord" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'ethereum',
    "data" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DropFetchMeta" (
    "category" TEXT NOT NULL,
    "lastRefreshAt" TIMESTAMP(3) NOT NULL,
    "prevRefreshAt" TIMESTAMP(3),
    "source" TEXT,
    "note" TEXT,

    CONSTRAINT "DropFetchMeta_pkey" PRIMARY KEY ("category")
);

-- CreateIndex
CREATE INDEX "DropRecord_category_lastSeenAt_idx" ON "DropRecord"("category", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "DropRecord_category_slug_key" ON "DropRecord"("category", "slug");
