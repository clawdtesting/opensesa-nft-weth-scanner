import { ContractInspector } from '@/components/ContractInspector';
import { TokenPanel } from '@/components/TokenPanel';
import { WalletBalances } from '@/components/WalletBalances';

export const dynamic = 'force-dynamic';

// $YARD on Robinhood chain.
const YARD = '0xe3fa12da7fa026b21817f16622e8ae48fa785166';

// Known $YARD-related addresses to classify.
const INSPECT_LIST = [
  '0xe3fa12da7fa026b21817f16622e8ae48fa785166', // $YARD token
  '0x23fB0F997E05c5C43FB7FA8962E7D28349a16B5f', // BatchRouterV2
  '0xFe0b24A3b4052aD78f10fa75a27118c3e54a00e6', // NFTAMMVAULT
  '0x29b549Edc709CA2A3aE6Abb4AD49057a71CCb2dc', // TokenEscrowReserve
  '0x73D9291482c3be39572Ef89096c9e472CDF56348', // EOA (deployer?)
  '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', // WETH
].join('\n');

export default function YardPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-terminal-text">$YARD</h1>
        <p className="text-xs text-terminal-muted mt-1">
          Live watch for $YARD on Robinhood chain — deployment, whether trading has started, and the
          transfer count, updating every 5s.
        </p>
        <p className="text-[11px] text-terminal-muted mt-1 font-mono break-all">{YARD}</p>
      </div>

      <div className="max-w-3xl">
        <WalletBalances />
      </div>

      <ContractInspector initial={INSPECT_LIST} highlight={[YARD]} />

      <TokenPanel initialAddress={YARD} />
    </div>
  );
}
