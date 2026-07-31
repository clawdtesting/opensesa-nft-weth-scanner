import type { SaleRecord, AcceptedOfferStats } from '@/domain/types';
import { median, mean, percentile } from '@/lib/math';

const HOUR = 3_600_000;

/**
 * Heuristic classifier: did a sale originate from an accepted offer/bid?
 *
 * On OpenSea, a buyer purchasing a listing pays in ETH, whereas an accepted
 * collection/token *offer* settles in WETH (offers must be WETH because ETH
 * cannot be escrowed for a bid). So a WETH-denominated sale is very likely an
 * accepted offer. This is the most reliable signal available without tracing
 * Seaport order fulfilment on-chain. The ingestion layer sets this flag; this
 * helper both re-derives it (for fixtures/backtests) and aggregates stats.
 */
export function looksLikeAcceptedOffer(sale: Pick<SaleRecord, 'currency'>): boolean {
  const c = sale.currency.toUpperCase();
  return c === 'WETH';
}

export function computeAcceptedOfferStats(
  sales: readonly SaleRecord[],
  now: Date = new Date(),
): AcceptedOfferStats {
  const t = now.getTime();
  const accepted = sales.filter((s) => s.fromAcceptedOffer);
  const within = (ms: number) => accepted.filter((s) => t - s.timestamp.getTime() <= ms);

  const prices = accepted.map((s) => s.priceEth);

  // Seller concession vs the floor at the time of the accepted sale, when known.
  const concessions: number[] = [];
  for (const s of accepted) {
    if (s.floorAtSale && s.floorAtSale > 0) {
      const concession = (s.floorAtSale - s.priceEth) / s.floorAtSale;
      // A negative concession (sold above floor) is possible but rare; keep it.
      concessions.push(concession);
    }
  }

  return {
    acceptedOffers1h: within(HOUR).length,
    acceptedOffers6h: within(6 * HOUR).length,
    acceptedOffers24h: within(24 * HOUR).length,
    acceptedOffers7d: within(7 * 24 * HOUR).length,
    medianAcceptedPrice: median(prices),
    meanAcceptedPrice: mean(prices),
    medianSellerConcession: median(concessions),
    concessionP25: percentile(concessions, 0.25),
    concessionP75: percentile(concessions, 0.75),
  };
}
