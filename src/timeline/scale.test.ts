import { describe, expect, it } from 'vitest';
import { centreOn, clampView, cluster, level, lerpView, pan, tickStep, ticks, xScale, zoomAt } from './scale';

const domain = { start: 0, end: 6000 };

describe('views', () => {
  it('stay inside the record and never zoom closer than 45 minutes', () => {
    expect(clampView({ start: -100, end: 200 }, domain)).toEqual({ start: 0, end: 300 });
    expect(clampView({ start: 5900, end: 6200 }, domain)).toEqual({ start: 5700, end: 6000 });
    expect(clampView({ start: 100, end: 110 }, domain)).toEqual({ start: 100, end: 145 });
    expect(clampView({ start: -1e6, end: 1e6 }, domain)).toEqual(domain);
  });

  it('zoom around the pointer, keeping the minute under it in place', () => {
    const v = { start: 1000, end: 2000 };
    const z = zoomAt(v, 0.5, 1250, domain);
    expect(z).toEqual({ start: 1125, end: 1625 });
    const x = xScale(v, 800)(1250);
    expect(xScale(z, 800)(1250)).toBeCloseTo(x);
  });

  it('pan without changing the span, stopping at the edges', () => {
    expect(pan({ start: 1000, end: 2000 }, 300, domain)).toEqual({ start: 1300, end: 2300 });
    expect(pan({ start: 1000, end: 2000 }, -5000, domain)).toEqual({ start: 0, end: 1000 });
  });

  it('centre on a moment', () => {
    expect(centreOn(3000, 600, domain)).toEqual({ start: 2700, end: 3300 });
    expect(centreOn(100, 600, domain)).toEqual({ start: 0, end: 600 });
  });

  it('ease between views and arrive exactly', () => {
    const a = { start: 0, end: 6000 };
    const b = { start: 2000, end: 2600 };
    expect(lerpView(a, b, 0)).toEqual(a);
    expect(lerpView(a, b, 1)).toEqual(b);
    const mid = lerpView(a, b, 0.5);
    expect(mid.start).toBeCloseTo(1000);
  });
});

describe('ticks and semantic zoom', () => {
  it('pick the finest step that leaves room for a label', () => {
    expect(tickStep({ start: 0, end: 7920 }, 900)).toBe(720);
    expect(tickStep({ start: 0, end: 1440 }, 900)).toBe(120);
    expect(tickStep({ start: 0, end: 240 }, 900)).toBe(30);
    expect(tickStep({ start: 0, end: 60 }, 900)).toBe(15);
  });

  it('place ticks on round times inside the view', () => {
    expect(ticks({ start: 50, end: 400 }, 350, 60).at).toEqual([60, 120, 180, 240, 300, 360]);
  });

  it('choose the level of detail from minutes per pixel, not from the screen size', () => {
    expect(level({ start: 0, end: 7920 }, 900)).toBe('stay');
    expect(level({ start: 0, end: 1440 }, 900)).toBe('day');
    expect(level({ start: 0, end: 360 }, 900)).toBe('shift');
    expect(level({ start: 0, end: 360 }, 360)).toBe('day'); // a phone shows six hours at day detail
  });
});

describe('clustering', () => {
  const items = [0, 5, 9, 40, 41, 100].map((t) => ({ t }));
  it('merges marks closer than the gap and keeps distant ones apart', () => {
    const c = cluster(items, (t) => t, 6);
    expect(c.map((k) => k.items.length)).toEqual([3, 2, 1]);
    expect(c[0]).toMatchObject({ start: 0, end: 9, x: 4.5 });
  });

  it('separates everything when zoomed in far enough', () => {
    expect(cluster(items, (t) => t * 10, 6)).toHaveLength(6);
  });
});
