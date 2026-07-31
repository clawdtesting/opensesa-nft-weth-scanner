import { describe, it, expect } from 'vitest';
import { clamp, median, mean, percentile, logScore, linearScore, distinctCount } from '@/lib/math';

describe('math helpers', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(NaN, 0, 10)).toBe(0);
  });

  it('computes median for odd and even arrays', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('computes mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBeNull();
  });

  it('computes interpolated percentiles', () => {
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 5);
    expect(percentile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25, 5);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([], 0.5)).toBeNull();
  });

  it('log and linear scores saturate at 100', () => {
    expect(logScore(0, 100)).toBe(0);
    expect(logScore(1000, 100)).toBe(100);
    expect(linearScore(50, 100)).toBe(50);
    expect(linearScore(200, 100)).toBe(100);
  });

  it('counts distinct case-insensitively, ignoring nullish', () => {
    expect(distinctCount(['0xA', '0xa', null, undefined, '0xB'])).toBe(2);
  });
});
