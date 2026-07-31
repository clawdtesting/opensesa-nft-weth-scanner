# Architecture

This document describes the architecture of the OpenSea NFT WETH Spread & Liquidity Scanner.

## Overview

The application is built with a modern stack:

- **Frontend**: Next.js React application
- **Backend**: Node.js server with Express (or Next.js API routes)
- **Database**: PostgreSQL with Prisma ORM
- **Caching**: Redis (optional)
- **Job Queues**: BullMQ (optional)
- **API Client**: Custom OpenSea API client

## Modules

1. **Collection Discovery** - Discovers NFT collections based on volume and sales velocity.
2. **Data Ingestion** - Collects sales, listings, and offers from OpenSea API.
3. **Market Analysis** - Calculates floor price, bid-ask spread, liquidity metrics.
4. **Opportunity Scoring** - Scores collections based on liquidity, spread, fill probability, etc.
5. **Dashboard** - Displays top opportunities and collection details.
6. **Simulation Engine** - Paper-trading and backtesting modules.

## Data Flow

1. Discovery worker identifies candidate collections.
2. Ingestion workers fetch data for each collection via OpenSea API.
3. Data is stored in PostgreSQL.
4. Analysis workers compute metrics and store snapshots.
5. Scoring engine computes opportunity scores.
6. API serves data to the frontend.
7. Frontend displays rankings and details.

## Security

- API keys stored server-side only.
- No private keys or wallet secrets exposed to client.
- Rate limiting and caching to protect API keys.

## Deployment

The application can be deployed to Vercel, Render, Railway, or similar platforms.