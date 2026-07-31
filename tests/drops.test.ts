import { describe, it, expect } from 'vitest';
import { parseDrops, isEthereumChain, computeIsLive } from '@/lib/opensea/dropsParse';

const NOW = new Date('2026-02-01T00:00:00Z');

describe('isEthereumChain', () => {
  it('accepts ethereum aliases only', () => {
    expect(isEthereumChain('ethereum')).toBe(true);
    expect(isEthereumChain('ETH')).toBe(true);
    expect(isEthereumChain('mainnet')).toBe(true);
    expect(isEthereumChain('base')).toBe(false);
    expect(isEthereumChain('matic')).toBe(false);
    expect(isEthereumChain(undefined)).toBe(false);
  });
});

describe('computeIsLive', () => {
  it('is live only when a known start has passed and end has not', () => {
    expect(computeIsLive('2026-01-01T00:00:00Z', '2026-03-01T00:00:00Z', NOW)).toBe(true);
    expect(computeIsLive('2026-03-01T00:00:00Z', null, NOW)).toBe(false); // future start
    expect(computeIsLive('2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z', NOW)).toBe(false); // ended
    expect(computeIsLive(null, null, NOW)).toBe(false); // unknown start
  });
});

describe('parseDrops', () => {
  it('filters out non-Ethereum chains', () => {
    const raw = {
      drops: [
        { slug: 'eth-one', name: 'Eth One', chain: 'ethereum' },
        { slug: 'base-one', name: 'Base One', chain: 'base' },
        { slug: 'poly-one', name: 'Poly One', chain: 'matic' },
      ],
    };
    const items = parseDrops(raw, 'upcoming', NOW);
    expect(items.map((i) => i.slug)).toEqual(['eth-one']);
    expect(items[0]!.chain).toBe('ethereum');
  });

  it('reads chain from nested contracts when top-level chain is absent', () => {
    const raw = [{ slug: 'x', name: 'X', contracts: [{ address: '0xabc', chain: 'ethereum' }] }];
    const items = parseDrops(raw, 'featured', NOW);
    expect(items).toHaveLength(1);
    expect(items[0]!.contract).toBe('0xabc');
    expect(items[0]!.featured).toBe(true);
  });

  it('maps varied field names and normalises unix timestamps', () => {
    const raw = {
      collections: [
        {
          collection: 'cool-cats',
          name: 'Cool Cats',
          chain: 'ethereum',
          image_url: 'https://img',
          drop: {
            stages: [
              {
                start_time: 1_770_000_000, // unix seconds
                end_time: 1_770_100_000,
                mint_price: 0.05,
                max_per_wallet: 3,
                stage: 'Public',
              },
            ],
          },
          total_supply: 5000,
        },
      ],
    };
    const items = parseDrops(raw, 'upcoming', NOW);
    expect(items).toHaveLength(1);
    const d = items[0]!;
    expect(d.slug).toBe('cool-cats');
    expect(d.mintPriceEth).toBe(0.05);
    expect(d.maxPerWallet).toBe(3);
    expect(d.mintStage).toBe('Public');
    expect(d.totalSupply).toBe(5000);
    expect(d.mintStart).toMatch(/^20\d\d-/); // ISO string
    expect(d.imageUrl).toBe('https://img');
  });

  it('never fabricates values — missing fields become null', () => {
    const raw = [{ slug: 'bare', name: 'Bare', chain: 'ethereum' }];
    const d = parseDrops(raw, 'upcoming', NOW)[0]!;
    expect(d.mintPriceEth).toBeNull();
    expect(d.mintStart).toBeNull();
    expect(d.maxPerWallet).toBeNull();
    expect(d.totalSupply).toBeNull();
    expect(d.openseaUrl).toContain('bare');
  });

  it('handles malformed input without throwing', () => {
    expect(parseDrops(null, 'upcoming', NOW)).toEqual([]);
    expect(parseDrops({}, 'featured', NOW)).toEqual([]);
    expect(parseDrops('nonsense', 'recently_minted', NOW)).toEqual([]);
    expect(parseDrops({ drops: [{ name: 'no slug', chain: 'ethereum' }] }, 'upcoming', NOW)).toEqual([]);
  });
});
