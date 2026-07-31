import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0e14',
          panel: '#111721',
          border: '#1e2733',
          muted: '#5c6b7a',
          text: '#c7d1db',
          accent: '#4da3ff',
          green: '#26d07c',
          red: '#ff5c72',
          amber: '#ffb454',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
