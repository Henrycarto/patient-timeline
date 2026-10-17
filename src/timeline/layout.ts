/** Vertical layout of the lanes: groups of rows, each group collapsible to its header. */
import { DRUGS, TESTS, type Event } from '../record/record';

export type RowKind = 'place' | 'news2' | 'vital' | 'bp' | 'conc' | 'med' | 'lab' | 'micro' | 'notes';

export interface RowDef {
  id: string;
  label: string;
  unit?: string;
  h: number;
  kind: RowKind;
  range?: [number, number];
}

export interface GroupDef {
  id: string;
  label: string;
  rows: RowDef[];
}

export const HEADER_H = 26;
/** Notes sit near the top of their row, with their labels underneath. */
export const NOTE_MARK_Y = 14;

export const GROUPS: GroupDef[] = [
  { id: 'place', label: 'Where', rows: [{ id: 'place', label: 'Location', h: 30, kind: 'place' }] },
  { id: 'news2', label: 'Early warning', rows: [{ id: 'news2', label: 'NEWS2', h: 96, kind: 'news2' }] },
  {
    id: 'vitals',
    label: 'Vital signs',
    rows: [
      { id: 'respRate', label: 'Respiration', unit: '/min', h: 40, kind: 'vital', range: [8, 32] },
      { id: 'spo2', label: 'SpO₂', unit: '%', h: 40, kind: 'vital', range: [86, 100] },
      { id: 'bp', label: 'Blood pressure', unit: 'mmHg', h: 48, kind: 'bp', range: [40, 160] },
      { id: 'pulse', label: 'Pulse', unit: '/min', h: 40, kind: 'vital', range: [60, 140] },
      { id: 'temp', label: 'Temperature', unit: '°C', h: 40, kind: 'vital', range: [36, 40] },
      { id: 'consciousness', label: 'Consciousness', h: 24, kind: 'conc' },
    ],
  },
  { id: 'meds', label: 'Medicines', rows: DRUGS.map((d) => ({ id: d.id, label: d.name, h: 26, kind: 'med' as const })) },
  {
    id: 'results',
    label: 'Results',
    rows: [
      ...TESTS.map((t) => ({ id: t.id, label: t.name, unit: t.unit, h: 26, kind: 'lab' as const })),
      { id: 'micro', label: 'Microbiology, imaging', h: 28, kind: 'micro' as const },
    ],
  },
  { id: 'notes', label: 'Notes', rows: [{ id: 'notes', label: 'Clinical notes', h: 60, kind: 'notes' }] },
];

export interface PlacedRow extends RowDef {
  y: number;
  group: string;
}

export interface Layout {
  rows: PlacedRow[];
  headers: Array<{ group: GroupDef; y: number; collapsed: boolean }>;
  height: number;
  rowById: Map<string, PlacedRow>;
  headerY: Map<string, number>;
}

export function layout(collapsed: ReadonlySet<string>, groups: GroupDef[] = GROUPS): Layout {
  let y = 0;
  const rows: PlacedRow[] = [];
  const headers: Layout['headers'] = [];
  const headerY = new Map<string, number>();
  for (const g of groups) {
    const c = collapsed.has(g.id);
    headers.push({ group: g, y, collapsed: c });
    headerY.set(g.id, y);
    y += HEADER_H;
    if (c) continue;
    for (const r of g.rows) {
      rows.push({ ...r, y, group: g.id });
      y += r.h;
    }
  }
  return { rows, headers, height: y, rowById: new Map(rows.map((r) => [r.id, r])), headerY };
}

const groupOfRow = new Map(GROUPS.flatMap((g) => g.rows.map((r) => [r.id, g.id] as const)));

/** Where a link attaches to an event: its row, or its group header when the group is collapsed. */
export function anchorY(e: Event, l: Layout, news2Y: (score: number) => number): number {
  const row = l.rowById.get(e.row);
  if (row) {
    if (e.kind === 'obs') return row.y + news2Y(e.value ?? 0);
    if (e.kind === 'note') return row.y + NOTE_MARK_Y;
    return row.y + row.h / 2;
  }
  return (l.headerY.get(groupOfRow.get(e.row) ?? '') ?? 0) + HEADER_H / 2;
}
