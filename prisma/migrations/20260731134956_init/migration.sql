-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('COLLECTION', 'TOKEN', 'TRAIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'ethereum',
    "slug" TEXT NOT NULL,
    "contract" TEXT,
    "name" TEXT NOT NULL,
    "totalSupply" INTEGER,
    "imageUrl" TEXT,
    "openseaUrl" TEXT,
    "marketplaceFeeBps" INTEGER NOT NULL DEFAULT 250,
    "creatorFeeBps" INTEGER NOT NULL DEFAULT 0,
    "discovered" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "transactionHash" TEXT,
    "buyer" TEXT,
    "seller" TEXT,
    "priceEth" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETH',
    "fromAcceptedOffer" BOOLEAN NOT NULL DEFAULT false,
    "floorAtSale" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "collectionRef" TEXT,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tokenId" TEXT,
    "orderHash" TEXT NOT NULL,
    "seller" TEXT,
    "priceEth" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETH',
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tokenId" TEXT,
    "orderHash" TEXT NOT NULL,
    "offerer" TEXT,
    "priceEth" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'WETH',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "offerType" "OfferType" NOT NULL DEFAULT 'COLLECTION',
    "expiration" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "floor" DOUBLE PRECISION,
    "realisticExit" DOUBLE PRECISION,
    "exitConfidence" DOUBLE PRECISION,
    "bestBid" DOUBLE PRECISION,
    "secondBid" DOUBLE PRECISION,
    "thirdBid" DOUBLE PRECISION,
    "offerCount" INTEGER NOT NULL DEFAULT 0,
    "distanceBestToSecond" DOUBLE PRECISION,
    "sales1h" INTEGER NOT NULL DEFAULT 0,
    "sales6h" INTEGER NOT NULL DEFAULT 0,
    "sales24h" INTEGER NOT NULL DEFAULT 0,
    "sales7d" INTEGER NOT NULL DEFAULT 0,
    "volume1h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volume7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uniqueBuyers24h" INTEGER NOT NULL DEFAULT 0,
    "uniqueSellers24h" INTEGER NOT NULL DEFAULT 0,
    "medianSale24h" DOUBLE PRECISION,
    "acceptedOffers1h" INTEGER NOT NULL DEFAULT 0,
    "acceptedOffers24h" INTEGER NOT NULL DEFAULT 0,
    "acceptedOffers7d" INTEGER NOT NULL DEFAULT 0,
    "medianSellerConcession" DOUBLE PRECISION,
    "floorDepth1" INTEGER NOT NULL DEFAULT 0,
    "floorDepth2" INTEGER NOT NULL DEFAULT 0,
    "floorDepth5" INTEGER NOT NULL DEFAULT 0,
    "floorDepth10" INTEGER NOT NULL DEFAULT 0,
    "bidDepth1" INTEGER NOT NULL DEFAULT 0,
    "bidDepth2" INTEGER NOT NULL DEFAULT 0,
    "bidDepth5" INTEGER NOT NULL DEFAULT 0,
    "bidDepth10" INTEGER NOT NULL DEFAULT 0,
    "recommendedBid" DOUBLE PRECISION,
    "expectedProfit" DOUBLE PRECISION,
    "expectedRoi" DOUBLE PRECISION,
    "fillProbability" DOUBLE PRECISION,
    "exitProbability24h" DOUBLE PRECISION,
    "exitProbability72h" DOUBLE PRECISION,
    "estimatedHoldingHours" DOUBLE PRECISION,
    "capitalEfficiency" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "scoreDetail" JSONB,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER,
    "passesFilter" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "detail" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatedOrder" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "runId" TEXT,
    "tokenId" TEXT,
    "bidEth" DOUBLE PRECISION NOT NULL,
    "bidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "filledAt" TIMESTAMP(3),
    "fillEth" DOUBLE PRECISION,
    "detail" JSONB,

    CONSTRAINT "SimulatedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatedPosition" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "runId" TEXT,
    "entryEth" DOUBLE PRECISION NOT NULL,
    "entryAt" TIMESTAMP(3) NOT NULL,
    "exitEth" DOUBLE PRECISION,
    "exitAt" TIMESTAMP(3),
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "grossProfit" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "gas" DOUBLE PRECISION,
    "netProfit" DOUBLE PRECISION,
    "roi" DOUBLE PRECISION,
    "holdingHours" DOUBLE PRECISION,

    CONSTRAINT "SimulatedPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyConfiguration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_chain_active_idx" ON "Collection"("chain", "active");

-- CreateIndex
CREATE INDEX "Collection_updatedAt_idx" ON "Collection"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_eventId_key" ON "Sale"("eventId");

-- CreateIndex
CREATE INDEX "Sale_collectionId_timestamp_idx" ON "Sale"("collectionId", "timestamp");

-- CreateIndex
CREATE INDEX "Sale_collectionId_fromAcceptedOffer_timestamp_idx" ON "Sale"("collectionId", "fromAcceptedOffer", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_orderHash_key" ON "Listing"("orderHash");

-- CreateIndex
CREATE INDEX "Listing_collectionId_active_priceEth_idx" ON "Listing"("collectionId", "active", "priceEth");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_orderHash_key" ON "Offer"("orderHash");

-- CreateIndex
CREATE INDEX "Offer_collectionId_active_offerType_priceEth_idx" ON "Offer"("collectionId", "active", "offerType", "priceEth");

-- CreateIndex
CREATE INDEX "MarketSnapshot_collectionId_timestamp_idx" ON "MarketSnapshot"("collectionId", "timestamp");

-- CreateIndex
CREATE INDEX "MarketSnapshot_timestamp_idx" ON "MarketSnapshot"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_collectionId_key" ON "Opportunity"("collectionId");

-- CreateIndex
CREATE INDEX "Opportunity_score_idx" ON "Opportunity"("score");

-- CreateIndex
CREATE INDEX "SimulatedOrder_runId_idx" ON "SimulatedOrder"("runId");

-- CreateIndex
CREATE INDEX "SimulatedOrder_collectionId_status_idx" ON "SimulatedOrder"("collectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SimulatedPosition_orderId_key" ON "SimulatedPosition"("orderId");

-- CreateIndex
CREATE INDEX "SimulatedPosition_runId_status_idx" ON "SimulatedPosition"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyConfiguration_name_key" ON "StrategyConfiguration"("name");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatedOrder" ADD CONSTRAINT "SimulatedOrder_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatedPosition" ADD CONSTRAINT "SimulatedPosition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SimulatedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
