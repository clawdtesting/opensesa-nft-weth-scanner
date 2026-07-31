/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.seadn.io' },
      { protocol: 'https', hostname: 'i.seadn.io' },
      { protocol: 'https', hostname: 'openseauserdata.com' },
      { protocol: 'https', hostname: '**.opensea.io' },
    ],
  },
};

module.exports = nextConfig;
