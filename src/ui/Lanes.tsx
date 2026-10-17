/** The rows of the timeline, drawn in SVG for one view. Pure rendering: no state. */
import { Fragment, type ReactNode } from 'react';
import type { Param } from '../clinical/news2';
import { EVENTS, type Event } from '../record/record';
import { DAY, DISCHARGED } from '../record/time';
import { OBS, type ObsSet } from '../record/vitals';
import { HEADER_H, NOTE_MARK_Y, type Layout, type PlacedRow } from '../timeline/layout';
import { cluster, type Level } from '../timeline/scale';

const NEWS_MAX = 18;
export const news2Y = (h: number) => (score: number) => 8 + (1 - Math.min(score, NEWS_MAX) / NEWS_MAX) * (h - 16);

export interface LaneProps {
  x: (t: number) => number;
  width: number;
  level: Level;
  layout: Layout;
  focus: Set<string> | null; // events in the selected chain; everything else is dimmed
  selected: string | null;
}

const byRow = new Map<string, Event[]>();
for (const e of EVENTS) byRow.set(e.row, [...(byRow.get(e.row) ?? []), e]);

const visibleIn = (x: (t: number) => number, width: number) => (t: number, end = t) => x(end) >= -40 && x(t) <= width + 40;

function dim(id: string, focus: Set<string> | null) {
  return focus && !focus.has(id) ? 0.28 : 1;
}

const pointsClass = (p: number) => (p >= 3 ? 'p3' : p >= 1 ? 'p1' : 'p0');

function Ring({ cx, cy, r = 8 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} className="ring" />;
}

/** Labels only where they fit: each one needs `gap` pixels from the last one drawn. */
function spaced<T>(items: T[], x: (it: T) => number, gap: number): Set<T> {
  const out = new Set<T>();
  let last = -Infinity;
  for (const it of items) {
    if (x(it) - last >= gap) {
      out.add(it);
      last = x(it);
    }
  }
  return out;
}

function PlaceRow({ row, x, width }: { row: PlacedRow } & LaneProps) {
  return (
    <g transform={`translate(0,${row.y})`}>
      {(byRow.get('place') ?? []).map((e) => {
        const x0 = Math.max(-2, x(e.t));
        const x1 = Math.min(width + 2, x(e.end!));
        if (x1 < 0 || x0 > width) return null;
        const w = x1 - x0;
        return (
          <g key={e.id} data-id={e.id} className={`place ${e.id}`}>
            <rect x={x0 + 1} y={5} width={Math.max(0, w - 2)} height={row.h - 10} rx={6} />
            {w > 70 && <text x={x0 + 10} y={row.h / 2 + 4} className="lbl">{w > 150 ? e.title : e.title.split(',')[0]}</text>}
          </g>
        );
      })}
    </g>
  );
}

function News2Row({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const y = news2Y(row.h);
  const vis = visibleIn(x, width);
  let d = '';
  OBS.forEach((o, i) => {
    const nx = i < OBS.length - 1 ? x(OBS[i + 1].t) : x(DISCHARGED);
    d += `${i ? 'L' : 'M'}${x(o.t).toFixed(1)} ${y(o.s.total).toFixed(1)} H${nx.toFixed(1)} `;
  });
  const area = `${d} V${y(0)} H${x(OBS[0].t).toFixed(1)} Z`;
  const shown = OBS.filter((o) => vis(o.t));
  const labelled = spaced(shown, (o) => x(o.t), level === 'shift' ? 16 : 26);
  return (
    <g transform={`translate(0,${row.y})`}>
      <rect x={0} y={y(NEWS_MAX)} width={width} height={y(7) - y(NEWS_MAX)} className="band-high" />
      <rect x={0} y={y(7)} width={width} height={y(5) - y(7)} className="band-medium" />
      <text x={width - 6} y={y(NEWS_MAX) + 11} className="axislbl" textAnchor="end">High, 7 or more</text>
      <text x={width - 6} y={y(5) + 11} className="axislbl" textAnchor="end">5</text>
      <path d={area} className="news-area" opacity={focus ? 0.5 : 1} />
      <path d={d} className="news-line" opacity={focus ? 0.5 : 1} />
      {shown.map((o) => (
        <g key={o.id} data-id={o.id} opacity={dim(o.id, focus)}>
          <circle cx={x(o.t)} cy={y(o.s.total)} r={level === 'stay' ? 3 : 4} className={`obs-dot ${o.s.risk}`} />
          <circle cx={x(o.t)} cy={y(o.s.total)} r={9} className="hit" />
          {level !== 'stay' && labelled.has(o) && o.s.total > 0 && (
            <text x={x(o.t)} y={y(o.s.total) - 8} className={`val news ${o.s.risk}`} textAnchor="middle">{o.s.total}</text>
          )}
          {selected === o.id && <Ring cx={x(o.t)} cy={y(o.s.total)} />}
        </g>
      ))}
    </g>
  );
}

const PARAM_OF: Record<string, Param> = { respRate: 'respRate', spo2: 'spo2', pulse: 'pulse', temp: 'temp' };

function VitalRow({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const [lo, hi] = row.range!;
  const y = (v: number) => 6 + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (row.h - 12);
  const vis = visibleIn(x, width);
  const value = (o: ObsSet) => o.v[row.id as 'respRate' | 'spo2' | 'pulse' | 'temp'];
  const shown = OBS.filter((o) => vis(o.t));
  const labelled = spaced(shown, (o) => x(o.t), row.id === 'temp' ? 34 : 26);
  const param = PARAM_OF[row.id];
  return (
    <g transform={`translate(0,${row.y})`}>
      <polyline points={OBS.map((o) => `${x(o.t).toFixed(1)},${y(value(o)).toFixed(1)}`).join(' ')} className="vital-line" opacity={focus ? 0.4 : 1} />
      {shown.map((o) => {
        const p = o.s.points[param];
        return (
          <g key={o.id} data-id={o.id} opacity={dim(o.id, focus)}>
            <circle cx={x(o.t)} cy={y(value(o))} r={level === 'stay' ? 2.2 : 3} className={`vdot ${pointsClass(p)}`} />
            <circle cx={x(o.t)} cy={y(value(o))} r={8} className="hit" />
            {level !== 'stay' && labelled.has(o) && (
              <text x={x(o.t)} y={y(value(o)) < 16 ? y(value(o)) + 13 : y(value(o)) - 6} className={`val ${pointsClass(p)}`} textAnchor="middle">{row.id === 'temp' ? value(o).toFixed(1) : value(o)}</text>
            )}
            {selected === o.id && <Ring cx={x(o.t)} cy={y(value(o))} r={6} />}
          </g>
        );
      })}
    </g>
  );
}

function BpRow({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const [lo, hi] = row.range!;
  const y = (v: number) => 5 + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (row.h - 10);
  const vis = visibleIn(x, width);
  const shown = OBS.filter((o) => vis(o.t));
  const labelled = spaced(shown, (o) => x(o.t), 62);
  return (
    <g transform={`translate(0,${row.y})`}>
      <line x1={0} x2={width} y1={y(90)} y2={y(90)} className="ref" />
      {shown.map((o) => {
        const p = o.s.points.systolic;
        const cx = x(o.t);
        return (
          <g key={o.id} data-id={o.id} opacity={dim(o.id, focus)}>
            <line x1={cx} x2={cx} y1={y(o.v.systolic)} y2={y(o.v.diastolic)} className={`bp ${pointsClass(p)}`} />
            <path d={`M${cx - 3} ${y(o.v.systolic) + 3} L${cx} ${y(o.v.systolic)} L${cx + 3} ${y(o.v.systolic) + 3}`} className={`bp ${pointsClass(p)}`} />
            <path d={`M${cx - 3} ${y(o.v.diastolic) - 3} L${cx} ${y(o.v.diastolic)} L${cx + 3} ${y(o.v.diastolic) - 3}`} className="bp p0" />
            <rect x={cx - 6} y={y(o.v.systolic) - 4} width={12} height={y(o.v.diastolic) - y(o.v.systolic) + 8} className="hit" />
            {level !== 'stay' && labelled.has(o) && (
              <text x={cx + 5} y={y(o.v.systolic) + 4} className={`val small ${pointsClass(p)}`}>{o.v.systolic}/{o.v.diastolic}</text>
            )}
            {selected === o.id && <Ring cx={cx} cy={(y(o.v.systolic) + y(o.v.diastolic)) / 2} r={10} />}
          </g>
        );
      })}
    </g>
  );
}

function ConsciousnessRow({ row, x, width }: { row: PlacedRow } & LaneProps) {
  const spans: Array<[number, number]> = [];
  let start: number | null = null;
  for (const o of OBS) {
    if (o.v.consciousness !== 'alert' && start === null) start = o.t;
    if (o.v.consciousness === 'alert' && start !== null) {
      spans.push([start, o.t]);
      start = null;
    }
  }
  return (
    <g transform={`translate(0,${row.y})`}>
      <line x1={x(OBS[0].t)} x2={Math.min(width, x(DISCHARGED))} y1={row.h / 2} y2={row.h / 2} className="alert-line" />
      {spans.map(([a, b]) => (
        <g key={a} data-id={`obs@${a}`}>
          <rect x={x(a)} y={5} width={Math.max(3, x(b) - x(a))} height={row.h - 10} rx={4} className="confused" />
          {x(b) - x(a) > 96 && <text x={x(a) + 8} y={row.h / 2 + 4} className="lbl on-alarm">New confusion</text>}
        </g>
      ))}
    </g>
  );
}

function DoseMark({ e, cx, cy }: { e: Event; cx: number; cy: number }) {
  const cls = `dose ${e.status}`;
  if (e.route === 'iv') return <rect x={cx - 2.5} y={cy - 7} width={5} height={14} rx={1.5} className={cls} />;
  if (e.route === 'sc') return <path d={`M${cx} ${cy - 6} L${cx + 6} ${cy} L${cx} ${cy + 6} L${cx - 6} ${cy} Z`} className={cls} />;
  return <circle cx={cx} cy={cy} r={4.5} className={cls} />;
}

function MedRow({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const evs = byRow.get(row.id) ?? [];
  const vis = visibleIn(x, width);
  const cy = row.h / 2;
  const course = evs.filter((e) => e.status !== 'planned');
  const first = course[0];
  const last = course[course.length - 1];
  return (
    <g transform={`translate(0,${row.y})`}>
      {first && last && <line x1={x(first.t)} x2={x(last.end ?? last.t)} y1={cy} y2={cy} className="course" />}
      {evs.map((e) => {
        if (!vis(e.t, e.end)) return null;
        const cx = x(e.t);
        return (
          <g key={e.id} data-id={e.id} opacity={dim(e.id, focus)}>
            {e.kind === 'dose' && <DoseMark e={e} cx={cx} cy={cy} />}
            {e.kind === 'dose' && e.status === 'held' && <line x1={cx - 4} y1={cy + 4} x2={cx + 4} y2={cy - 4} className="held-slash" />}
            {e.kind === 'infusion' && (
              <>
                <rect x={cx} y={cy - 5} width={Math.max(4, x(e.end!) - cx)} height={10} rx={5} className="infusion" />
                {level !== 'stay' && x(e.end!) - cx > 90 && row.id === 'oxygen' && <text x={cx + 8} y={cy + 4} className="lbl tiny">2 L/min</text>}
              </>
            )}
            {e.kind === 'stop' && <path d={`M${cx} ${cy - 7} V${cy + 7} M${cx - 6} ${cy} H${cx}`} className="stop" />}
            <rect x={cx - 7} y={2} width={e.kind === 'infusion' ? Math.max(14, x(e.end!) - cx + 7) : 14} height={row.h - 4} className="hit" />
            {selected === e.id && <Ring cx={cx} cy={cy} />}
          </g>
        );
      })}
    </g>
  );
}

function LabRow({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const evs = (byRow.get(row.id) ?? []).filter((e) => visibleIn(x, width)(e.t));
  const labelled = spaced(evs, (e) => x(e.t), level === 'stay' ? 40 : 34);
  const cy = row.h / 2;
  return (
    <g transform={`translate(0,${row.y})`}>
      {evs.map((e) => (
        <g key={e.id} data-id={e.id} opacity={dim(e.id, focus)}>
          <circle cx={x(e.t)} cy={cy} r={3.5} className={`lab ${e.flag ?? 'normal'}`} />
          {labelled.has(e) && <text x={x(e.t) + 7} y={cy + 4} className={`val lab ${e.flag ?? 'normal'}`}>{e.value}</text>}
          <rect x={x(e.t) - 6} y={2} width={36} height={row.h - 4} className="hit" />
          {selected === e.id && <Ring cx={x(e.t)} cy={cy} r={7} />}
        </g>
      ))}
    </g>
  );
}

function MicroRow({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const evs = (byRow.get('micro') ?? []).filter((e) => visibleIn(x, width)(e.t));
  const labelled = spaced(evs, (e) => x(e.t), 150);
  const cy = row.h / 2;
  return (
    <g transform={`translate(0,${row.y})`}>
      {evs.map((e) => (
        <g key={e.id} data-id={e.id} opacity={dim(e.id, focus)}>
          <rect x={x(e.t) - 4} y={cy - 4} width={8} height={8} rx={2} className={`micro ${e.flag ?? 'plain'}`} />
          {level === 'shift' && labelled.has(e) && <text x={x(e.t) + 9} y={cy + 4} className="lbl tiny">{e.title}</text>}
          <rect x={x(e.t) - 7} y={2} width={14} height={row.h - 4} className="hit" />
          {selected === e.id && <Ring cx={x(e.t)} cy={cy} r={8} />}
        </g>
      ))}
    </g>
  );
}

function NotesRow({ row, x, width, level, focus, selected }: { row: PlacedRow } & LaneProps) {
  const evs = (byRow.get('notes') ?? []).filter((e) => visibleIn(x, width)(e.t));
  const cy = NOTE_MARK_Y;
  const groups = cluster(evs, x, level === 'stay' ? 16 : 11);
  // labels go on two lines below the marks; each takes the first line with room for it
  const trackEnd = [-Infinity, -Infinity];
  const CHAR = 6.4;
  return (
    <g transform={`translate(0,${row.y})`}>
      {groups.map((g) => {
        if (g.items.length > 1) {
          const inFocus = !focus || g.items.some((e) => focus.has(e.id));
          return (
            <g key={g.start} data-cluster={`${g.start}:${g.end}`} opacity={inFocus ? 1 : 0.28} className="cluster">
              <circle cx={g.x} cy={cy} r={9} />
              <text x={g.x} y={cy + 4} textAnchor="middle">{g.items.length}</text>
            </g>
          );
        }
        const e = g.items[0];
        const cx = x(e.t);
        let label: { text: string; track: number } | null = null;
        if (level !== 'stay') {
          const text = e.title.length > 26 ? `${e.title.slice(0, 25).trimEnd()}…` : e.title;
          const track = trackEnd.findIndex((end) => cx - 4 >= end + 8);
          if (track >= 0) {
            trackEnd[track] = cx - 4 + text.length * CHAR;
            label = { text, track };
          }
        }
        return (
          <g key={e.id} data-id={e.id} opacity={dim(e.id, focus)}>
            <path d={`M${cx} ${cy - 6} L${cx + 6} ${cy} L${cx} ${cy + 6} L${cx - 6} ${cy} Z`} className="note" />
            {label && <text x={cx - 4} y={cy + 21 + label.track * 15} className="lbl tiny">{label.text}</text>}
            <rect x={cx - 8} y={2} width={label ? Math.min(170, label.text.length * CHAR + 8) : 16} height={row.h - 4} className="hit" />
            {selected === e.id && <Ring cx={cx} cy={cy} r={9} />}
          </g>
        );
      })}
    </g>
  );
}

const RENDER: Record<string, (p: { row: PlacedRow } & LaneProps) => ReactNode> = {
  place: PlaceRow,
  news2: News2Row,
  vital: VitalRow,
  bp: BpRow,
  conc: ConsciousnessRow,
  med: MedRow,
  lab: LabRow,
  micro: MicroRow,
  notes: NotesRow,
};

/** Backdrop: nights shaded 20:00 to 08:00, midnight rules, the time at home after discharge. */
export function Backdrop({ x, width, height, start, end }: { x: (t: number) => number; width: number; height: number; start: number; end: number }) {
  const days: number[] = [];
  for (let d = Math.floor(start / DAY) - 1; d * DAY <= end + DAY; d++) days.push(d);
  return (
    <g>
      {days.map((d) => (
        <Fragment key={d}>
          <rect x={x(d * DAY + 20 * 60)} y={0} width={x(d * DAY + 32 * 60) - x(d * DAY + 20 * 60)} height={height} className="night" />
          <line x1={x(d * DAY)} x2={x(d * DAY)} y1={0} y2={height} className="midnight" />
        </Fragment>
      ))}
      <rect x={x(DISCHARGED)} y={0} width={Math.max(0, width - x(DISCHARGED))} height={height} className="after" />
    </g>
  );
}

export function Rows(p: LaneProps) {
  return (
    <>
      {p.layout.headers.map((h) => (
        <line key={h.group.id} x1={0} x2={p.width} y1={h.y + HEADER_H - 0.5} y2={h.y + HEADER_H - 0.5} className="group-rule" />
      ))}
      {p.layout.rows.map((row) => {
        const R = RENDER[row.kind];
        return <R key={row.id} row={row} {...p} />;
      })}
    </>
  );
}
