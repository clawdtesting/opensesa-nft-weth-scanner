import { describe, it, expect } from 'vitest';
import { parseSaleEvent, saleEventId, parseListing, parseOffer, parseFees } from '@/lib/opensea/parse';
import type { OSEvent, OSListing, OSOffer, OSCollection } from '@/lib/opensea/types';

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

describe('parseSaleEvent', () => {
  it('parses an ETH sale and marks it not-from-offer', () => {
    const ev: OSEvent = {
      event_type: 'sale',
      transaction: '0xabc',
      event_timestamp: 1_700_000_000,
      nft: { identifier: '42', contract: '0xnft' },
      payment: { quantity: '1000000000000000000', token_address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH' },
      buyer: '0xbuyer',
      seller: '0xseller',
    };
    const sale = parseSaleEvent(ev);
    expect(sale).not.toBeNull();
    expect(sale!.priceEth).toBeCloseTo(1, 9);
    expect(sale!.currency).toBe('ETH');
    expect(sale!.fromAcceptedOffer).toBe(false);
    expect(sale!.tokenId).toBe('42');
  });

  it('parses a WETH sale and marks it as an accepted offer', () => {
    const ev: OSEvent = {
      event_type: 'sale',
      transaction: '0xdef',
      event_timestamp: 1_700_000_500,
      nft: { identifier: '7' },
      payment: { quantity: '780000000000000000', token_address: WETH, decimals: 18, symbol: 'WETH' },
    };
    const sale = parseSaleEvent(ev)!;
    expect(sale.priceEth).toBeCloseTo(0.78, 9);
    expect(sale.currency).toBe('WETH');
    expect(sale.fromAcceptedOffer).toBe(true);
  });

  it('rejects non-sale events and zero-priced sales', () => {
    expect(parseSaleEvent({ event_type: 'transfer', event_timestamp: 1 } as OSEvent)).toBeNull();
    expect(
      parseSaleEvent({
        event_type: 'sale',
        event_timestamp: 1,
        payment: { quantity: '0', token_address: WETH, decimals: 18, symbol: 'WETH' },
      } as OSEvent),
    ).toBeNull();
  });

  it('produces deterministic event ids for dedup', () => {
    const ev: OSEvent = { event_type: 'sale', transaction: '0xabc', event_timestamp: 1, nft: { identifier: '42' } };
    expect(saleEventId(ev)).toBe(saleEventId({ ...ev }));
    expect(saleEventId(ev)).toContain('0xabc');
  });
});

describe('parseListing', () => {
  it('reads the current price block', () => {
    const l: OSListing = {
      order_hash: '0x1',
      price: { current: { currency: 'ETH', decimals: 18, value: '1500000000000000000' } },
    };
    const parsed = parseListing(l)!;
    expect(parsed.priceEth).toBeCloseTo(1.5, 9);
  });

  it('returns null for a zero price', () => {
    expect(parseListing({ order_hash: '0x2' })).toBeNull();
  });
});

describe('parseOffer', () => {
  it('normalises a collection offer to a per-item WETH price', () => {
    const o: OSOffer = {
      order_hash: '0xo1',
      criteria: { collection: { slug: 'x' } },
      price: { currency: 'WETH', decimals: 18, value: '1440000000000000000' },
      protocol_data: {
        parameters: {
          offerer: '0xbidder',
          offer: [],
          consideration: [{ itemType: 4, token: '0xnft', identifierOrCriteria: '0', startAmount: '2', endAmount: '2' }],
          startTime: '0',
          endTime: '9999999999',
        },
      },
    };
    const parsed = parseOffer(o)!;
    // 1.44 WETH total for quantity 2 => 0.72 per item.
    expect(parsed.priceEth).toBeCloseTo(0.72, 9);
    expect(parsed.currency).toBe('WETH');
    expect(parsed.offerType).toBe('COLLECTION');
    expect(parsed.quantity).toBe(2);
  });
});

describe('parseFees', () => {
  it('splits OpenSea marketplace fee from creator royalties', () => {
    const c: OSCollection = {
      collection: 'x',
      name: 'X',
      fees: [
        { fee: 2.5, recipient: '0x0000a26b00c1f0df003000390027140000faa719', required: true },
        { fee: 5, recipient: '0xcreator', required: false },
      ],
    };
    const { marketplaceFeeBps, creatorFeeBps } = parseFees(c);
    expect(marketplaceFeeBps).toBe(250);
    expect(creatorFeeBps).toBe(500);
  });

  it('defaults to 2.5% marketplace fee when none provided', () => {
    const { marketplaceFeeBps, creatorFeeBps } = parseFees({ collection: 'x', name: 'X' });
    expect(marketplaceFeeBps).toBe(250);
    expect(creatorFeeBps).toBe(0);
  });
});
