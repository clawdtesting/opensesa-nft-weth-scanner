# Deployment

This document outlines the steps to deploy the OpenSea NFT WETH Scan application.

## Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Redis (optional, for caching)
- Git
- An OpenSea API key (from https://opensea.io/developers)

## Local Development

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/opensea-nft-weth-scanner.git
cd opensea-nft-weth-scanner
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/opensea_scanner"

# Redis (optional)
REDIS_URL="redis://localhost:6379"

# OpenSea API
OPENSEA_API_KEY="your_api_key_here"

# Server
PORT=3000
NODE_ENV=development
```

### 4. Initialize the database

Run Prisma migrations to create the schema:

```bash
npx prisma migrate dev
```

### 5. Start the development server

```bash
npm run dev
```

The application will be available at http://localhost:3000

## Production Deployment

### Option 1: Vercel (Recommended for frontend)

1. Push your code to GitHub
2. Import the project in Vercel
3. Set the environment variables in the Vercel dashboard
4. Vercel will automatically build and deploy

### Option 2: Docker

Build the Docker image:

```bash
docker build -t opensea-scanner .
```

Run with docker-compose (see docker-compose.yml) or directly:

```bash
docker run -p 3000:3000 --env-file .env opensea-scanner
```

### Option 3: Manual Server

1. Install Node.js and PM2 (for process management)
2. Clone the repo and install dependencies
3. Set environment variables
4. Build the Next.js app: `npm run build`
5. Start the server: `npm start` or use PM2: `pm2 start npm -- start`

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| DATABASE_URL | PostgreSQL connection string | Yes |
| REDIS_URL | Redis connection string (optional) | No |
| OPENSEA_API_KEY | API key from OpenSea | Yes |
| NEXT_PUBLIC_API_URL | URL of the backend API (for frontend) | Yes (in production) |
| PORT | Port to listen on | No (defaults to 3000) |
| NODE_ENV | Environment (development/production) | No |

## Database Setup

The application uses Prisma ORM. The schema is defined in `prisma/schema.prisma`.

To create a new migration:

```bash
npx prisma migrate dev --name migration_name
```

To generate Prisma client:

```bash
npx prisma generate
```

## Testing

Run unit and integration tests:

```bash
npm test
```

## Monitoring

- Enable logging to a service like Loggly or Datadog
- Monitor API rate limits and response times
- Set up alerts for downtime or high error rates

## Updating

To update to the latest version:

```bash
git pull origin main
npm install
npx prisma migrate deploy
npm run build
pm2 restart all
```

## Troubleshooting

- **Database connection errors**: Verify DATABASE_URL and that PostgreSQL is running.
- **API rate limits**: Check Opensea API usage and ensure you're not exceeding limits.
- **Memory leaks**: Monitor memory usage and restart periodically if needed.