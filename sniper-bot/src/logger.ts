/** Tiny timestamped console logger. */
function ts(): string {
  return new Date().toISOString();
}

export const log = {
  info: (msg: string, extra?: unknown) => console.log(`[${ts()}] ℹ️  ${msg}`, extra ?? ''),
  ok: (msg: string, extra?: unknown) => console.log(`[${ts()}] ✅ ${msg}`, extra ?? ''),
  warn: (msg: string, extra?: unknown) => console.warn(`[${ts()}] ⚠️  ${msg}`, extra ?? ''),
  error: (msg: string, extra?: unknown) => console.error(`[${ts()}] ⛔ ${msg}`, extra ?? ''),
  hit: (msg: string, extra?: unknown) => console.log(`[${ts()}] 🎯 ${msg}`, extra ?? ''),
};
