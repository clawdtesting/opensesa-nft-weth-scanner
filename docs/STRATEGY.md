# Strategy

## Core Strategy

The core strategy is to identify NFT collections where deploying WETH in offers yields a statistically attractive expected return.

Steps:

1. Find liquid NFT collections with meaningful trading volume and active WETH bidding.
2. Analyze floor price, actual sales, and WETH offers.
3. Determine a realistic short-term exit price (realistic exit price).
4. Determine a competitive WETH bid that would likely be the top bid or near-top.
5. Calculate the executable spread between the bid and the realistic exit price.
6. Estimate the probability that the bid fills (fill probability).
7. Estimate the probability that the NFT can be exited at the target price within a horizon (exit probability).
8. Compute expected return: (exit price - bid) * fill probability * exit probability - fees - gas - risk buffer.
9. Rank opportunities by expected return per unit time and capital efficiency.

## Key Principles

- Avoid naive floor minus best bid calculations.
- Focus on executable spreads and realizable returns.
- Use historical data to estimate fill and exit probabilities.
- Incorporate fees, gas, and slippage.
- Prioritize capital efficiency: expected profit per WETH per hour.