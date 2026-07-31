# Database Schema

This document describes the database schema for the NFT WETH Scan application.

## Tables

### collections
- id (PK)
- chain (e.g., 1 for Ethereum)
- contract_address (unique)
- name
- symbol
- total_supply
- description
- image_url
- opensea_url
- twitter_username
- discord_url
- created_at
- updated_at

### nfts
- id (PK)
- collection_id (FK to collections.id)
- token_id (unique within collection)
- metadata (JSON)
- created_at

### sales
- id (PK)
- nft_id (FK to nfts.id)
- buyer_address
- seller_address
- price_amount (in wei of payment token)
- payment_token_address
- transaction_hash (unique)
- block_number
- timestamp
- auction_type

### listings (asks)
- id (PK)
- nft_id (FK to nfts.id)
- seller_address
- price_amount (wei)
- payment_token_address
- transaction_hash (when created)
- expiry_timestamp
- created_at
- updated_at

### offers (bids)
- id (PK)
- nft_id (FK to nfts.id, nullable for collection offers)
- bidder_address
- price_amount (wei)
- payment_token_address
- expiration_timestamp
- created_at
- updated_at

### market_snapshots
- id (PK)
- collection_id (FK)
- timestamp
- floor_price (from listings)
- real_time_price (volume-weighted average price of recent sales)
- best_bid (highest bid)
- second_best_bid
- third_best_bid
- bid_depth_1pct (total bid value within 1% of floor)
- bid_depth_5pct
- bid_depth_10pct
- ask_depth_1pct (total ask value within 1% of floor)
- ask_depth_5pct
- ask_depth_10pct
- sales_count_1h
- sales_count_24h
- volume_1h
- volume_24h
- unique_buyers_24h
- unique_sellers_24h
- average_sale_price_1h
- average_sale_price_24h
- recommended_bid
- expected_profit
- expected_roi
- opportunity_score

### opportunities
- id (PK)
- collection_id (FK)
- timestamp
- score
- rank
- passes_filter (boolean)
- notes

### strategy_config
- id (PK)
- key (unique)
- value
- description

### simulated_orders
- id (PK)
- collection_id
- token_id
- bid_amount
- bid_timestamp
- filled (boolean)
- fill_timestamp
- fill_price
- exit_price
- exit_timestamp
- profit_loss

### simulated_positions
- id (PK)
- simulation_run_id
- entry_order_id
- exit_order_id
- entry_price
- exit_price
- quantity
- profit_loss
- duration_hours