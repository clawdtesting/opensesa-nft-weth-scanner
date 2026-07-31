/**
 * Tiny structured logger with an in-memory ring buffer so the diagnostics view
 * can surface recent activity without wiring up an external log sink.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: Level;
  event: string;
  data?: Record<string, unknown>;
}

const RING_SIZE = 500;
const ring: LogEntry[] = [];

function emit(level: Level, event: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = { ts: new Date().toISOString(), level, event, data };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
  if (process.env.NODE_ENV !== 'test') {
    const line = `[${entry.ts}] ${level.toUpperCase()} ${event}`;
    const payload = data ? ` ${JSON.stringify(data)}` : '';
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(
      line + payload,
    );
  }
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => emit('debug', event, data),
  info: (event: string, data?: Record<string, unknown>) => emit('info', event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => emit('error', event, data),
  recent: (limit = 100): LogEntry[] => ring.slice(-limit).reverse(),
};
