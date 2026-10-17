/**
 * The timeline's geometry: a view is a window of minutes, drawn across a width in pixels.
 * Zoom changes what is worth drawing, not just its size (semantic zoom).
 */

export interface View {
  start: number;
  end: number;
}

export const MIN_SPAN = 45; // minutes
export type Level = 'stay' | 'day' | 'shift';

export function clampView(v: View, domain: View, minSpan = MIN_SPAN): View {
  const full = domain.end - domain.start;
  const span = Math.min(full, Math.max(minSpan, v.end - v.start));
  let start = v.start;
  if (start < domain.start) start = domain.start;
  if (start + span > domain.end) start = domain.end - span;
  return { start, end: start + span };
}

/** Zoom by factor (below 1 zooms in) keeping the minute under the pointer where it is. */
export function zoomAt(v: View, factor: number, anchor: number, domain: View): View {
  const f = (anchor - v.start) / (v.end - v.start);
  const span = (v.end - v.start) * factor;
  return clampView({ start: anchor - f * span, end: anchor - f * span + span }, domain);
}

export function pan(v: View, minutes: number, domain: View): View {
  return clampView({ start: v.start + minutes, end: v.end + minutes }, domain);
}

export function centreOn(t: number, span: number, domain: View): View {
  return clampView({ start: t - span / 2, end: t + span / 2 }, domain);
}

export const xScale = (v: View, width: number) => (t: number) => ((t - v.start) / (v.end - v.start)) * width;
export const tScale = (v: View, width: number) => (x: number) => v.start + (x / width) * (v.end - v.start);

const STEPS = [15, 30, 60, 120, 180, 360, 720, 1440];

/** Tick spacing: the finest step that leaves at least minPx between labels. */
export function tickStep(v: View, width: number, minPx = 64): number {
  const ppm = width / (v.end - v.start);
  return STEPS.find((s) => s * ppm >= minPx) ?? 1440;
}

export function ticks(v: View, width: number, minPx = 64): { step: number; at: number[] } {
  const step = tickStep(v, width, minPx);
  const out: number[] = [];
  for (let t = Math.ceil(v.start / step) * step; t <= v.end; t += step) out.push(t);
  return { step, at: out };
}

/** What to draw depends on minutes per pixel, so a phone and a wide screen show the same view the same way. */
export function level(v: View, width: number): Level {
  const mpp = (v.end - v.start) / width; // minutes per pixel
  if (mpp > 2.2) return 'stay';
  if (mpp > 0.6) return 'day';
  return 'shift';
}

export interface Cluster<T> {
  items: T[];
  x: number;
  start: number;
  end: number;
}

/** Marks closer than gap pixels merge into one, so a busy hour reads as "6 notes" at a distance. */
export function cluster<T extends { t: number }>(items: T[], x: (t: number) => number, gap: number): Cluster<T>[] {
  const sorted = [...items].sort((a, b) => a.t - b.t);
  const out: Cluster<T>[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && x(it.t) - x(last.items[last.items.length - 1].t) < gap) {
      last.items.push(it);
      last.end = it.t;
      last.x = (x(last.start) + x(last.end)) / 2;
    } else out.push({ items: [it], x: x(it.t), start: it.t, end: it.t });
  }
  return out;
}

/** Eased transition between two views. */
export function lerpView(a: View, b: View, f: number): View {
  const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  return { start: a.start + (b.start - a.start) * e, end: a.end + (b.end - a.end) * e };
}
