import { describe, it, expect, vi, afterEach } from 'vitest';
import { cuando, puntos } from './formato';

describe('puntos', () => {
  it('singular, plural y negativos', () => {
    expect(puntos(1)).toBe('1 punto');
    expect(puntos(0)).toBe('0 puntos');
    expect(puntos(-1)).toBe('-1 punto');
    expect(puntos(70)).toBe('70 puntos');
  });
});

describe('cuando (hora de Argentina, 24 h)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hoy, ayer y fecha corta', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T18:00:00Z')); // 15:00 en AR
    expect(cuando('2026-11-23T17:42:00Z')).toBe('hoy 14:42');
    expect(cuando('2026-11-22T21:30:00Z')).toBe('ayer 18:30');
    expect(cuando('2026-11-12T13:15:00Z')).toBe('12/11 10:15');
    expect(cuando(null)).toBe('');
  });
});
