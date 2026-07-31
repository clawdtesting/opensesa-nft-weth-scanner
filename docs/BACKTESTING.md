# Backtesting

This document describes the backtesting framework.

## Overview

The backtesting engine simulates historical performance of the strategy using stored market snapshots.

## Data Requirements

To run a backtest, we need:
- Hourly (or higher frequency) market snapshots for each collection in the lookback period.
- Snapshots include: floor, best bids, realistic exit, recommended bid, volume, sales, etc.

## Process

1. **Load Snapshots**: Read snapshots from the database for the date range.
2. **Generate Signals**: For each timestamp and collection, apply the strategy configuration to determine if an opportunity exists.
3. **Simulate Orders**: When an opportunity passes filters, place a simulated buy order at the recommended bid.
4. **Fill Model**: Determine if the order would have filled based on historical bid-ask data and volume.
   - We assume that if the recommended bid is at or above the historical ask price at that time, it fills immediately.
   - More sophisticated models can use order book depth and time.
5. **Track Position**: If filled, track the NFT until an exit condition is met.
6. **Exit Model**: Determine when the position would be sold.
   - Exit when market price reaches or exceeds the realistic exit price (from snapshot) for a sustained period.
   - Or when a listing appears at or below target price.
   - Or after a maximum holding period (configurable).
7. **Calculate P&L**: Compute gross profit, subtract fees and gas, compute net profit and ROI.

## Metrics

- Total return
- Annualized return
- Win rate (% of profitable trades)
- Average holding period
- Profit factor (gross profit / gross loss)
- Maximum drawdown
- Sharpe ratio (risk-adjusted return)
- Number of trades
- Average profit per trade
- Profit per WETH per day

## Configuration

Backtest parameters:
- Start date
- End date
- Initial capital (WETH)
- Max allocation per collection (percent of capital)
- Minimum opportunity score
- Minimum expected ROI
- Maximum number of concurrent positions
- Slippage model
- Fee model (OpenSea 2.5%, creator fee variable)
- Gas cost estimate (in WETH)

## Output

- Equity curve
- Trade list (entry/exit times, prices, P&L)
- Performance summary
- Per-collection performance
- Drawdown analysis

## Implementation

The backtesting engine can be run as a Node.js script or integrated into the web interface for interactive exploration.