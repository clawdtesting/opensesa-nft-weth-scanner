import 'server-only';
import { ethers } from 'ethers';
import { Seaport } from '@opensea/seaport-js';
import type { OrderWithCounter } from '@opensea/seaport-js/lib/types';
import { getOpenSeaClient } from '@/lib/opensea/client';
import { env, buyerReady } from '@/config/env';
import { robinhoodChain } from '@/lib/chain/robinhood';
import { logger } from '@/lib/logger';

export interface BuyResult {
  ok: boolean;
  txHash?: string;
  explorerUrl?: string;
  spentEth?: number;
  slug?: string;
  error?: string;
}

const EXPLORER = 'https://robinhoodchain.blockscout.com/tx/';

/**
 * Buy the current floor NFT of a collection with one call.
 *
 * Safety model (funds are protected even though this path can't be tested
 * against live Robinhood chain here):
 *  1. Re-fetches the floor fresh, so we never act on stale data.
 *  2. Aborts if the total spend exceeds the caller's max-price cap.
 *  3. Runs a static-call SIMULATION before broadcasting — if fulfillment would
 *     revert (bad encoding, listing gone, etc.) we stop before spending gas.
 *  4. Only native-ETH listings are executed; anything needing an ERC-20
 *     approval is refused rather than silently approving spend.
 */
export async function executeFloorBuy(
  contract: string,
  chain: string,
  maxPriceEth: number,
): Promise<BuyResult> {
  if (!buyerReady()) {
    return { ok: false, error: 'Wallet not configured — set PRIVATE_KEY and RPC_URL.' };
  }
  if (!Number.isFinite(maxPriceEth) || maxPriceEth <= 0) {
    return { ok: false, error: 'Set a valid max price (ETH).' };
  }

  const client = getOpenSeaClient();

  // 1) Resolve slug + fetch the freshest floor listing (with full order data).
  let slug: string;
  try {
    const c = await client.getContract(contract, chain);
    if (!c.collection) return { ok: false, error: 'No OpenSea collection for this contract yet.' };
    slug = c.collection;
  } catch (err) {
    return { ok: false, error: `Could not resolve collection: ${errMsg(err)}` };
  }

  let listing;
  try {
    const res = await client.getBestListings(slug, { limit: 1 });
    listing = res.listings?.[0];
  } catch (err) {
    return { ok: false, slug, error: `Could not load floor listing: ${errMsg(err)}` };
  }
  if (!listing?.protocol_data?.parameters || !listing.protocol_data.signature) {
    return { ok: false, slug, error: 'No fulfillable floor listing available right now.' };
  }
  const protocolAddress = listing.protocol_address;
  if (!protocolAddress) {
    return { ok: false, slug, error: 'Listing is missing its Seaport protocol address.' };
  }

  // 2) Total buyer spend = sum of the consideration amounts. Enforce the cap.
  const params = listing.protocol_data.parameters;
  let totalWei = 0n;
  for (const item of params.consideration ?? []) {
    try {
      totalWei += BigInt(item.startAmount);
    } catch {
      /* skip non-numeric */
    }
  }
  const spentEth = Number(ethers.formatEther(totalWei));
  if (spentEth <= 0) {
    return { ok: false, slug, error: 'Could not determine listing price; refusing to buy.' };
  }
  if (spentEth > maxPriceEth) {
    return {
      ok: false,
      slug,
      spentEth,
      error: `Floor ${spentEth.toFixed(5)} ETH is above your max ${maxPriceEth} ETH — aborted.`,
    };
  }

  // 3) Build signer + Seaport bound to the listing's protocol contract.
  const pk = env.buyer.privateKey.startsWith('0x') ? env.buyer.privateKey : `0x${env.buyer.privateKey}`;
  const network = ethers.Network.from({ chainId: robinhoodChain.id, name: robinhoodChain.name });
  const provider = new ethers.JsonRpcProvider(env.buyer.rpcUrl, network, { staticNetwork: network });
  const wallet = new ethers.Wallet(pk, provider);
  // seaport-js ships CJS ethers types; our ethers resolves to the same runtime
  // instance, so this cast only reconciles the ESM/CJS .d.ts duality.
  const signer = wallet as unknown as ConstructorParameters<typeof Seaport>[0];
  const seaport = new Seaport(signer, { overrides: { contractAddress: protocolAddress } });

  const order = {
    parameters: params,
    signature: listing.protocol_data.signature,
  } as unknown as OrderWithCounter;

  try {
    const { actions } = await seaport.fulfillOrder({ order, accountAddress: wallet.address });

    // Refuse anything that would require approving ERC-20 spend (non-ETH buy).
    if (actions.some((a) => a.type === 'approval')) {
      return { ok: false, slug, spentEth, error: 'Listing needs an ERC-20 approval; only native-ETH buys are supported.' };
    }
    const exchange = actions.find((a) => a.type === 'exchange');
    if (!exchange) return { ok: false, slug, spentEth, error: 'No exchange action produced for this order.' };

    // 4) SIMULATE — throws if the fulfillment would revert. Nothing spent yet.
    await exchange.transactionMethods.staticCall();

    // Broadcast.
    const tx = await exchange.transactionMethods.transact();
    logger.info('buyer.submitted', { slug, txHash: tx.hash, spentEth });

    return { ok: true, slug, spentEth, txHash: tx.hash, explorerUrl: `${EXPLORER}${tx.hash}` };
  } catch (err) {
    logger.warn('buyer.failed', { slug, error: errMsg(err) });
    return { ok: false, slug, spentEth, error: `Buy failed (nothing spent if pre-broadcast): ${errMsg(err)}` };
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return String(err).slice(0, 300);
}
