import { describe, expect, it } from 'vitest';
import { byId } from '../record/record';
import { GROUPS, HEADER_H, anchorY, layout } from './layout';

describe('lane layout', () => {
  it('stacks every group header and row without gaps', () => {
    const l = layout(new Set());
    const total = GROUPS.reduce((a, g) => a + HEADER_H + g.rows.reduce((b, r) => b + r.h, 0), 0);
    expect(l.height).toBe(total);
    expect(l.rows[0].y).toBe(HEADER_H);
  });

  it('collapses a group to its header and moves everything below it up', () => {
    const open = layout(new Set());
    const shut = layout(new Set(['meds']));
    const medsHeight = GROUPS.find((g) => g.id === 'meds')!.rows.reduce((a, r) => a + r.h, 0);
    expect(shut.height).toBe(open.height - medsHeight);
    expect(shut.rowById.has('oxygen')).toBe(false);
    expect(shut.rowById.get('notes')!.y).toBe(open.rowById.get('notes')!.y - medsHeight);
  });

  it('anchors links to the row, or to the header when the row is hidden', () => {
    const y = (s: number) => s;
    const dose = byId.get('coamoxiclav@2-00:55')!;
    const open = layout(new Set());
    const row = open.rowById.get('coamoxiclav')!;
    expect(anchorY(dose, open, y)).toBe(row.y + row.h / 2);
    const shut = layout(new Set(['meds']));
    expect(anchorY(dose, shut, y)).toBe(shut.headerY.get('meds')! + HEADER_H / 2);
  });
});
