import { parseAbi, parseAbiItem } from 'viem';

// --- Pool-creation events we listen for -----------------------------------

// ve(3,3)/Solidly-style factory (up. likely): includes a `stable` flag.
export const PAIR_CREATED_SOLIDLY = parseAbiItem(
  'event PairCreated(address indexed token0, address indexed token1, bool stable, address pair, uint256)',
);

// Classic Uniswap-V2 factory.
export const PAIR_CREATED_V2 = parseAbiItem(
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
);

// Uniswap-V3 / concentrated-liquidity factory.
export const POOL_CREATED_V3 = parseAbiItem(
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
);

// --- Router ABIs -----------------------------------------------------------

// Velodrome/Aerodrome (ve(3,3)) router: routes carry {from,to,stable,factory}.
export const VELODROME_ROUTER_ABI = parseAbi([
  'struct Route { address from; address to; bool stable; address factory; }',
  'function getAmountsOut(uint256 amountIn, Route[] routes) view returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, Route[] routes, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, Route[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
]);

// Classic Solidly router: routes are {from,to,stable} (no factory field).
export const SOLIDLY_ROUTER_ABI = parseAbi([
  'struct route { address from; address to; bool stable; }',
  'function getAmountsOut(uint256 amountIn, route[] routes) view returns (uint256[] amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, route[] routes, address to, uint256 deadline) payable returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, route[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
]);

// Uniswap-V2 router.
export const UNIV2_ROUTER_ABI = parseAbi([
  'function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
]);

// Uniswap-V3 SwapRouter + QuoterV2 (single-hop).
export const UNIV3_ROUTER_ABI = parseAbi([
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams params) payable returns (uint256 amountOut)',
]);
export const UNIV3_QUOTER_ABI = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

// --- ERC-20 ----------------------------------------------------------------
export const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
