/**
 * The scrubbable timeline: a time axis, the lanes, the playhead and the decision chain of the
 * selected event. Drag the lanes to pan, drag the axis to scrub, pinch or Ctrl + scroll to zoom.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { byId, type Link } from '../record/record';
import { DAY, DISCHARGED, clock, dayLabel, stamp } from '../record/time';
import { anchorY, type Layout } from '../timeline/layout';
import { level as levelOf, tScale, ticks, xScale, type View } from '../timeline/scale';
import { Backdrop, Rows, news2Y } from './Lanes';

export const AXIS_H = 44;

interface Props {
  view: View;
  width: number;
  layout: Layout;
  playhead: number;
  selected: string | null;
  focus: { ids: Set<string>; links: Link[] } | null;
  onPan: (minutes: number) => void;
  onZoom: (factor: number, anchor: number) => void;
  onScrub: (t: number) => void;
  onPick: (id: string | null, t: number) => void;
  onCluster: (start: number, end: number) => void;
}

interface Drag {
  mode: 'pan' | 'scrub';
  x0: number;
  last: number;
  moved: boolean;
  target: Element | null;
}

export function Timeline({ view, width, layout, playhead, selected, focus, onPan, onZoom, onScrub, onPick, onCluster }: Props) {
  const x = useMemo(() => xScale(view, width), [view, width]);
  const toT = useMemo(() => tScale(view, width), [view, width]);
  const lvl = levelOf(view, width);
  const tk = ticks(view, width, width < 500 ? 56 : 68);
  const pointers = useRef(new Map<number, number>());
  const pinch = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const [hover, setHover] = useState<{ id: string; px: number; py: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const localX = (clientX: number, el: Element) => clientX - el.getBoundingClientRect().left;

  const down = (mode: Drag['mode']) => (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.abs(a - b);
      drag.current = null;
      return;
    }
    drag.current = { mode, x0: e.clientX, last: e.clientX, moved: false, target: e.target as Element };
    if (mode === 'scrub') onScrub(toT(localX(e.clientX, e.currentTarget)));
  };

  const move = (e: RPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, e.clientX);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.max(10, Math.abs(a - b));
      onZoom(pinch.current / dist, toT(localX((a + b) / 2, e.currentTarget)));
      pinch.current = dist;
      return;
    }
    const d = drag.current;
    if (d) {
      if (Math.abs(e.clientX - d.x0) > 4) d.moved = true;
      if (d.mode === 'scrub') onScrub(toT(localX(e.clientX, e.currentTarget)));
      else if (d.moved) onPan(-((e.clientX - d.last) / width) * (view.end - view.start));
      d.last = e.clientX;
      setHover(null);
      return;
    }
    const hit = (e.target as Element).closest('[data-id]');
    const r = wrap.current?.getBoundingClientRect();
    if (hit && r) setHover({ id: hit.getAttribute('data-id')!, px: e.clientX - r.left, py: e.clientY - r.top });
    else if (hover) setHover(null);
  };

  const up = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.mode === 'scrub') return;
    const c = d.target?.closest('[data-cluster]');
    if (c) {
      const [s, en] = c.getAttribute('data-cluster')!.split(':').map(Number);
      onCluster(s, en);
      return;
    }
    const hit = d.target?.closest('[data-id]');
    onPick(hit ? hit.getAttribute('data-id') : null, toT(localX(e.clientX, e.currentTarget)));
  };

  // a native listener, because React's wheel handlers are passive and cannot stop the page zooming
  const wheel = useRef<(e: WheelEvent) => void>(() => {});
  wheel.current = (e: WheelEvent) => {
    const el = wrap.current;
    if (!el) return;
    const anchor = toT(e.clientX - el.getBoundingClientRect().left);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onZoom(Math.exp(e.deltaY * 0.0025), anchor);
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      e.preventDefault();
      onPan(((e.shiftKey ? e.deltaY : e.deltaX) / width) * (view.end - view.start));
    }
  };
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const h = (e: WheelEvent) => wheel.current(e);
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  const hy = news2Y(layout.rowById.get('news2')?.h ?? 96);
  const pos = (id: string) => {
    const ev = byId.get(id)!;
    return { x: x(ev.t), y: anchorY(ev, layout, hy) };
  };
  const arcs = focus?.links ?? [];
  const hovered = hover ? byId.get(hover.id) : undefined;
  const px = x(playhead);

  // day labels: the day each label belongs to, pinned to the left edge while its day is in view
  const dayStarts: number[] = [];
  for (let d = Math.floor(view.start / DAY); d * DAY < view.end; d++) dayStarts.push(d * DAY);

  return (
    <div className="timeline" ref={wrap}>
      <svg
        className="axis"
        width={width}
        height={AXIS_H}
        role="slider"
        aria-label="Time in the stay. Drag to move the playhead."
        aria-valuemin={view.start}
        aria-valuemax={view.end}
        aria-valuenow={Math.round(playhead)}
        aria-valuetext={stamp(playhead)}
        onPointerDown={down('scrub')}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <rect width={width} height={AXIS_H} className="axis-bg" />
        {dayStarts.map((t, i) => {
          const lx = Math.max(6, x(t) + 6);
          const nextX = i < dayStarts.length - 1 ? x(dayStarts[i + 1]) : width;
          if (nextX - lx < 60) return null;
          return <text key={t} x={lx} y={16} className="day">{lvl === 'stay' && width < 600 ? dayLabel(t).split(' ').slice(0, 2).join(' ') : dayLabel(t)}</text>;
        })}
        {tk.at.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={t % DAY === 0 ? 0 : 28} y2={AXIS_H} className={t % DAY === 0 ? 'tick day' : 'tick'} />
            {tk.step < DAY && t % DAY !== 0 && x(t) > 20 && x(t) < width - 20 && <text x={x(t)} y={38} className="tick-lbl" textAnchor="middle">{clock(t)}</text>}
          </g>
        ))}
        {DISCHARGED >= view.start && DISCHARGED <= view.end && <line x1={x(DISCHARGED)} x2={x(DISCHARGED)} y1={20} y2={AXIS_H} className="discharge" />}
        <g className="playhead-pill" transform={`translate(${Math.min(width - 34, Math.max(34, px))},0)`}>
          <rect x={-33} y={20} width={66} height={22} rx={11} />
          <text x={0} y={35} textAnchor="middle">{clock(playhead)}</text>
        </g>
      </svg>

      <svg
        className="lanes"
        width={width}
        height={layout.height}
        onPointerDown={down('pan')}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="arrowhead" />
          </marker>
        </defs>
        <Backdrop x={x} width={width} height={layout.height} start={view.start} end={view.end} />
        <Rows x={x} width={width} level={lvl} layout={layout} focus={focus?.ids ?? null} selected={selected} />
        <g className="arcs">
          {arcs.map((l) => {
            const a = pos(l.from);
            const b = pos(l.to);
            const near = l.from === selected || l.to === selected;
            const k = (b.x - a.x) * 0.5;
            return (
              <path
                key={`${l.from}>${l.to}`}
                d={`M${a.x} ${a.y} C${a.x + k} ${a.y}, ${b.x - k} ${b.y}, ${b.x} ${b.y}`}
                className={near ? 'arc near' : 'arc'}
                markerEnd="url(#arrow)"
              />
            );
          })}
        </g>
        <line x1={px} x2={px} y1={0} y2={layout.height} className="playhead" />
      </svg>

      {hovered && hover && (
        <div className="tip" style={{ left: Math.min(hover.px + 14, width - 250), top: hover.py + AXIS_H + 14 }} role="tooltip">
          <b>{hovered.title}</b>
          <span>{stamp(hovered.t)}{hovered.end && hovered.kind !== 'place' ? ` to ${clock(hovered.end)}` : ''}</span>
          {hovered.detail && <span>{hovered.detail}</span>}
        </div>
      )}
    </div>
  );
}

/** Lane labels, drawn as HTML beside the SVG so they stay crisp, selectable and accessible. */
export function LaneLabels({ layout, onToggle, latest }: { layout: Layout; onToggle: (g: string) => void; latest: Record<string, string> }) {
  return (
    <div className="labels" style={{ height: layout.height + AXIS_H }}>
      <div className="labels-axis" style={{ height: AXIS_H }} />
      {layout.headers.map((h) => (
        <div key={h.group.id} style={{ position: 'absolute', top: h.y + AXIS_H, left: 0, right: 0 }}>
          <button className="group" aria-expanded={!h.collapsed} onClick={() => onToggle(h.group.id)}>
            <span className="chev" aria-hidden>{h.collapsed ? '▸' : '▾'}</span>
            {h.group.label}
          </button>
        </div>
      ))}
      {layout.rows.map((r) => (
        <div key={r.id} className={`rowlabel ${r.kind}`} style={{ top: r.y + AXIS_H, height: r.h }}>
          <span>{r.label}</span>
          {latest[r.id] && <b>{latest[r.id]}</b>}
        </div>
      ))}
    </div>
  );
}
