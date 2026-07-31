/** Small, dependency-free numeric helpers used across the calculation layer. */

/** Clamp `value` into the inclusive [min, max] range. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Median of a numeric array. Returns null for an empty array. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Arithmetic mean. Returns null for an empty array. */
export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Percentile (linear interpolation), p in [0,1].
 * percentile([1,2,3,4], 0.25) === 1.75
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const idx = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const frac = idx - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

/**
 * Normalise a raw value onto [0, 100] using a logarithmic curve that saturates
 * near `full`. Good for volume / count metrics that span orders of magnitude.
 */
export function logScore(value: number, full: number): number {
  if (value <= 0 || full <= 0) return 0;
  const score = (Math.log1p(value) / Math.log1p(full)) * 100;
  return clamp(score, 0, 100);
}

/** Linear 0-100 score saturating at `full`. */
export function linearScore(value: number, full: number): number {
  if (full <= 0) return 0;
  return clamp((value / full) * 100, 0, 100);
}

/** Round to a fixed number of decimals without floating-point noise. */
export function round(value: number, decimals = 6): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Count distinct non-empty string values. */
export function distinctCount(values: readonly (string | null | undefined)[]): number {
  const set = new Set<string>();
  for (const v of values) {
    if (v) set.add(v.toLowerCase());
  }
  return set.size;
}
