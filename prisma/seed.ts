/**
 * Seed script.
 *
 * Generates a realistic synthetic market so the entire pipeline — dashboard,
 * collection pages, paper trading and backtesting — works from a clean checkout
 * without an OpenSea API key. Data is produced by the same deterministic
 * archetypes used in the test suite, extended to a 7-day sales history so the
 * backtester has something to chew on.
 *
 * Run: npm run db:seed
 */
import { PrismaClient, OfferType, type Prisma } from '@prisma/client';
import { DEFAULT_STRATEGY } from '../src/config/strategy';
import { analyzeCollection } from '../src/domain/analyze';
import { ALL_FIXTURES, mulberry32, type MarketFixture } from '../src/lib/sim/fixtures';
import { evaluateFill, evaluateExit } from '../src/lib/sim/simengine';
import type { SaleRecord } from '../src/domain/types';

const prisma = new PrismaClient();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Extend a fixture's recent sales into a 7-day history by resampling its price
 * distribution backwards in time, so early snapshots have both trailing history
 * and subsequent sales for the backtester to fill against.
 */
function sevenDayHistory(fixture: MarketFixture, now: Date, seed: number): SaleRecord[] {
  const rng = mulberry32(seed);
  const recent = fixture.sales;
  if (recent.length === 0) return [];
  const prices = recent.map((s) => s.priceEth);
  const acceptedRate = recent.filter((s) => s.fromAcceptedOffer).length / recent.length;
  const perDay = Math.max(recent.length, 4);

  const out: SaleRecord[] = [...recent];
  // Days 1..6 back: resample similar prices.
  for (let day = 1; day <= 6; day += 1) {
    for (let i = 0; i < perDay; i += 1) {
      const base = prices[Math.floor(rng() * prices.length)]!;
      const price = base * (0.95 + rng() * 0.1);
      const age = day * DAY + rng() * DAY;
      const accepted = rng() < acceptedRate;
      out.push({
        tokenId: String(Math.floor(rng() * 10000)),
        priceEth: price,
        currency: accepted ? 'WETH' : 'ETH',
        buyer: `0xb${day}_${i}`,
        seller: `0xs${day}_${i}`,
        fromAcceptedOffer: accepted,
        floorAtSale: base,
        timestamp: new Date(now.getTime() - age),
      });
    }
  }
  return out.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

async function main() {
  console.log('Seeding database...');
  const now = new Date();

  // Default strategy configuration row.
  await prisma.strategyConfiguration.upsert({
    where: { name: 'default' },
    create: { name: 'default', isDefault: true, config: DEFAULT_STRATEGY as object },
    update: { config: DEFAULT_STRATEGY as object, isDefault: true },
  });

  // Wipe prior synthetic data for idempotency.
  await prisma.simulatedPosition.deleteMany({});
  await prisma.simulatedOrder.deleteMany({});
  await prisma.marketSnapshot.deleteMany({});
  await prisma.opportunity.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.listing.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.collection.deleteMany({});

  let seed = 1;
  for (const factory of ALL_FIXTURES) {
    const fixture = factory({ now, seed });
    seed += 7;
    const slug = slugify(fixture.name);
    const history = sevenDayHistory(fixture, now, seed);

    const collection = await prisma.collection.create({
      data: {
        slug,
        chain: 'ethereum',
        contract: `0x${seed.toString(16).padStart(40, '0')}`,
        name: fixture.name,
        totalSupply: 10000,
        imageUrl: null,
        openseaUrl: `https://opensea.io/collection/${slug}`,
        marketplaceFeeBps: fixture.marketplaceFeeBps,
        creatorFeeBps: fixture.creatorFeeBps,
        discovered: true,
        active: true,
      },
    });

    // Persist sales.
    for (const s of history) {
      await prisma.sale.create({
        data: {
          collectionId: collection.id,
          tokenId: s.tokenId,
          eventId: `seed:${slug}:${s.tokenId}:${s.timestamp.getTime()}`,
          buyer: s.buyer,
          seller: s.seller,
          priceEth: s.priceEth,
          currency: s.currency,
          fromAcceptedOffer: s.fromAcceptedOffer,
          floorAtSale: s.floorAtSale,
          timestamp: s.timestamp,
        },
      });
    }

    // Persist current listing book.
    for (const [i, l] of fixture.listings.entries()) {
      await prisma.listing.create({
        data: {
          collectionId: collection.id,
          orderHash: `seed-listing:${slug}:${i}`,
          priceEth: l.priceEth,
          currency: l.currency,
          active: true,
        },
      });
    }

    // Persist current offer book.
    for (const [i, o] of fixture.offers.entries()) {
      await prisma.offer.create({
        data: {
          collectionId: collection.id,
          orderHash: `seed-offer:${slug}:${i}`,
          offerer: o.offerer,
          priceEth: o.priceEth,
          currency: o.currency,
          quantity: o.quantity,
          offerType: o.offerType as OfferType,
          active: true,
        },
      });
    }

    // Build a snapshot history every 6h across the last 3 days.
    let lastAnalysis = null as ReturnType<typeof analyzeCollection> | null;
    let latestSnapshotId: string | null = null;
    for (let hoursAgo = 72; hoursAgo >= 0; hoursAgo -= 6) {
      const at = new Date(now.getTime() - hoursAgo * HOUR);
      const salesUpTo = history.filter((s) => s.timestamp.getTime() <= at.getTime());
      const analysis = analyzeCollection(
        {
          sales: salesUpTo,
          listings: fixture.listings,
          offers: fixture.offers,
          marketplaceFeeBps: fixture.marketplaceFeeBps,
          creatorFeeBps: fixture.creatorFeeBps,
          now: at,
        },
        DEFAULT_STRATEGY,
      );
      lastAnalysis = analysis;
      const a = analysis;
      const snap = await prisma.marketSnapshot.create({
        data: {
          collectionId: collection.id,
          timestamp: at,
          floor: a.floorBook.floor,
          realisticExit: a.realisticExit.price,
          exitConfidence: a.realisticExit.confidence,
          bestBid: a.bidBook.bestBid,
          secondBid: a.bidBook.secondBid,
          thirdBid: a.bidBook.thirdBid,
          offerCount: a.bidBook.offerCount,
          distanceBestToSecond: a.bidBook.distanceBestToSecond,
          sales1h: a.velocity.sales1h,
          sales6h: a.velocity.sales6h,
          sales24h: a.velocity.sales24h,
          sales7d: a.velocity.sales7d,
          volume1h: a.velocity.volume1h,
          volume24h: a.velocity.volume24h,
          volume7d: a.velocity.volume7d,
          uniqueBuyers24h: a.velocity.uniqueBuyers24h,
          uniqueSellers24h: a.velocity.uniqueSellers24h,
          medianSale24h: a.velocity.medianSale24h,
          acceptedOffers1h: a.accepted.acceptedOffers1h,
          acceptedOffers24h: a.accepted.acceptedOffers24h,
          acceptedOffers7d: a.accepted.acceptedOffers7d,
          medianSellerConcession: a.accepted.medianSellerConcession,
          floorDepth1: a.floorBook.floorDepth1,
          floorDepth2: a.floorBook.floorDepth2,
          floorDepth5: a.floorBook.floorDepth5,
          floorDepth10: a.floorBook.floorDepth10,
          bidDepth1: a.bidBook.bidDepth1,
          bidDepth2: a.bidBook.bidDepth2,
          bidDepth5: a.bidBook.bidDepth5,
          bidDepth10: a.bidBook.bidDepth10,
          recommendedBid: a.recommendedBid.bid,
          expectedProfit: a.spread.expectedNetProfit,
          expectedRoi: a.spread.expectedRoi,
          fillProbability: a.probabilities.fillProbability,
          exitProbability24h: a.probabilities.exitProbability24h,
          exitProbability72h: a.probabilities.exitProbability72h,
          estimatedHoldingHours: a.probabilities.estimatedHoldingHours,
          capitalEfficiency: a.capitalEfficiency,
          score: a.opportunity.score,
          scoreDetail: {
            components: a.opportunity.components,
            weightedComponents: a.opportunity.weightedComponents,
            riskPenalties: a.opportunity.riskPenalties,
            reason: a.opportunity.reason,
            realisticExit: {
              inputs: a.realisticExit.inputs,
              weights: a.realisticExit.weights,
              explanation: a.realisticExit.explanation,
            },
            recommendedBid: { basis: a.recommendedBid.basis, explanation: a.recommendedBid.explanation },
            spread: a.spread,
            trend: a.trend,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      latestSnapshotId = snap.id;
    }

    if (lastAnalysis && latestSnapshotId) {
      const a = lastAnalysis;
      const passes =
        a.velocity.sales24h >= DEFAULT_STRATEGY.filters.minSales24h &&
        a.velocity.volume24h >= DEFAULT_STRATEGY.filters.minVolume24hEth &&
        a.accepted.acceptedOffers24h >= DEFAULT_STRATEGY.filters.minAcceptedOffers24h &&
        (a.spread.rawSpread ?? 0) >= DEFAULT_STRATEGY.filters.minRawSpread &&
        (a.spread.expectedRoi ?? -Infinity) >= DEFAULT_STRATEGY.filters.minExpectedRoi &&
        a.opportunity.score >= DEFAULT_STRATEGY.filters.minOpportunityScore;

      await prisma.opportunity.create({
        data: {
          collectionId: collection.id,
          snapshotId: latestSnapshotId,
          score: a.opportunity.score,
          passesFilter: passes,
          reason: a.opportunity.reason,
          detail: { components: a.opportunity.components, riskPenalties: a.opportunity.riskPenalties },
        },
      });

      // Generate a few closed paper positions for the qualifying collections so
      // the portfolio view is populated.
      if (passes && a.recommendedBid.bid && a.realisticExit.price) {
        const bid = a.recommendedBid.bid;
        const order = await prisma.simulatedOrder.create({
          data: {
            collectionId: collection.id,
            bidEth: bid,
            bidAt: new Date(now.getTime() - 3 * DAY),
            status: 'OPEN',
            detail: { realisticExit: a.realisticExit.price },
          },
        });
        const fill = evaluateFill(bid, order.bidAt, history, 72);
        if (fill.filled && fill.filledAt) {
          await prisma.simulatedOrder.update({
            where: { id: order.id },
            data: { status: 'FILLED', filledAt: fill.filledAt, fillEth: fill.fillEth },
          });
          const exit = evaluateExit({
            entry: fill.fillEth ?? bid,
            target: a.realisticExit.price,
            filledAt: fill.filledAt,
            subsequentSales: history,
            maxHoldHours: 168,
            fees: DEFAULT_STRATEGY.fees,
            marketplaceFeeBps: fixture.marketplaceFeeBps,
            creatorFeeBps: fixture.creatorFeeBps,
            fallbackPrice: a.floorBook.floor,
          });
          await prisma.simulatedPosition.create({
            data: {
              orderId: order.id,
              entryEth: fill.fillEth ?? bid,
              entryAt: fill.filledAt,
              exitEth: exit.exitEth,
              exitAt: exit.exitAt,
              status: 'CLOSED',
              grossProfit: exit.grossProfit,
              fees: exit.fees,
              gas: exit.gas,
              netProfit: exit.netProfit,
              roi: exit.roi,
              holdingHours: exit.holdingHours,
            },
          });
        }
      }
    }

    console.log(`  seeded ${fixture.name} (${history.length} sales)`);
  }

  // Rank opportunities.
  const opps = await prisma.opportunity.findMany({ orderBy: { score: 'desc' } });
  for (let i = 0; i < opps.length; i += 1) {
    await prisma.opportunity.update({ where: { id: opps[i]!.id }, data: { rank: i + 1 } });
  }

  console.log(`Seed complete: ${opps.length} opportunities ranked.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
