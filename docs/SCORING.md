# Opportunity Scoring


<tool_call>
<function=write_file>
<parameter=content>
# Scoring Model

This document describes the opportunity scoring algorithm.

## Components

The opportunity score is a weighted sum of normalized factors, each scaled 0-100.

### 1. Liquidity (25%)
Based on trading volume and transaction count.
- Volume score: log(volume_24h_eth) normalized across collections
- Transaction score: log(sales_count_24h) normalized
- Combined: average of volume and transaction scores

### 2. Executable Spread (20%)
The spread between recommended bid and realistic exit price, minus fees and gas.
- spread = (realistic_exit - recommended_bid - fees - gas) / recommended_bid
- Normalized: spread * 100 (capped at 200% for scoring)

### 3. Accepted Bid Activity (15%)
Measures how often sellers accept bids below floor.
- accepted_offers_24h count
- average discount to floor of accepted offers
- Higher count and higher discount -> higher score

### 4. Fill Probability (15%)
Estimated likelihood that a bid at the recommended price will be accepted.
- Based on historical fill rates for similar bid competitiveness
- Factors: bid depth, distance from best bid, seller acceptance history

### 5. Exit Probability (10%)
Estimated likelihood that an acquired NFT can be sold at the realistic exit price within a horizon.
- Based on sales velocity, floor depth, and buyer demand

### 6. Floor Structure (5%)
Evaluates the density of listings near floor.
- Listings within 5% of floor: fewer is better (indicates less sell pressure)
- Ratio of listingsWithin5pct to sales24h (lower ratio = healthier)

### igher Momentum (5%)
Recent price trend and volume momentum.
- price_change_1h
- volume_change_1h
- Combined with decay.

### 8. Capital Efficiency (5%)
Expected profit per WETH per hour.
- (expected_profit * fill_probability * exit_probability) / (recommended_bid * expected_holding_hours)

## Risk Penalties

Subtract points for risk factors:
- No sales in last 6h: -10
- Very low transaction count (<5 in 24h): -10
- Rapidly falling floor (>10% drop in 6h): -15
- Thin order book (bid depth < 0.5 ETH): -5
- Extreme holder concentration (top 10 owners hold >90%): -10 (if data available)
- Wash trading detected (unusual patterns): -20

## Final Score

Score = sum(weighted components) - risk penalties
Clamped between 0 and 100.

## Example Calculation

See docs/EXAMPLE_SCORING.md for a walkthrough.