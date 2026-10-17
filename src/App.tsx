import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EVENTS, MOMENTS, PATIENT, byId, chain } from './record/record';
import { medsAt, resultsAt } from './record/state';
import { ADMITTED, DISCHARGED, DOMAIN, clock, duration, parseAt, stamp, weekday } from './record/time';
import { obsAtOrBefore } from './record/vitals';
import { GROUPS, layout as layoutOf } from './timeline/layout';
import { centreOn, clampView, lerpView, pan, zoomAt, type View } from './timeline/scale';
import { Now, Response, Selected } from './ui/Panel';
import { LaneLabels, Timeline } from './ui/Timeline';

const STAY: View = { start: DOMAIN.start, end: DOMAIN.end };
const OPENING = MOMENTS.find((m) => m.label === 'Sepsis flagged')!;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function initial(): { view: View; playhead: number; selected: string | null; intro: boolean } {
  const q = new URLSearchParams(window.location.search);
  const ev = q.get('event');
  const t = parseAt(q.get('at'));
  if (ev && byId.has(ev)) {
    const m = MOMENTS.find((x) => x.id === ev);
    const view = m ? clampView({ start: m.view[0], end: m.view[1] }, STAY) : centreOn(byId.get(ev)!.t, 8 * 60, STAY);
    return { view, playhead: byId.get(ev)!.t, selected: ev, intro: false };
  }
  if (t !== null) return { view: centreOn(t, 8 * 60, STAY), playhead: t, selected: null, intro: false };
  return { view: STAY, playhead: byId.get(OPENING.id)!.t, selected: null, intro: true };
}

export default function App() {
  const init = useMemo(initial, []);
  const [view, setView] = useState<View>(init.view);
  const [playhead, setPlayhead] = useState(init.playhead);
  const [selected, setSelected] = useState<string | null>(init.selected);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [trackRef, width] = useWidth<HTMLDivElement>();
  const anim = useRef<number | null>(null);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
  }, [theme]);
  const dimmed = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;

  const viewRef = useRef(view);
  viewRef.current = view;

  const animateTo = useCallback((target: View) => {
    const to = clampView(target, STAY);
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = null;
    if (reducedMotion()) return setView(to);
    const from = viewRef.current;
    const t0 = performance.now();
    const step = (now: number) => {
      const f = Math.min(1, (now - t0) / 650);
      setView(lerpView(from, to, f));
      anim.current = f < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, []);

  const stopAnim = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  // first visit: the whole stay, then a slow zoom into the night it went wrong
  useEffect(() => {
    if (!init.intro) return;
    const id = window.setTimeout(() => {
      animateTo({ start: OPENING.view[0] - 60, end: OPENING.view[1] + 30 });
      setSelected(OPENING.id);
    }, 900);
    return () => window.clearTimeout(id);
  }, [init.intro, animateTo]);

  useEffect(() => {
    const q = new URLSearchParams();
    q.set('at', `${weekday(playhead).toLowerCase()}-${clock(playhead)}`);
    if (selected) q.set('event', selected);
    const id = window.setTimeout(() => window.history.replaceState(null, '', `?${q}`), 250);
    return () => window.clearTimeout(id);
  }, [playhead, selected]);

  const layout = useMemo(() => layoutOf(collapsed), [collapsed]);
  const focus = useMemo(() => {
    if (!selected) return null;
    const c = chain(selected);
    return c.links.length ? c : null;
  }, [selected]);

  const pick = useCallback(
    (id: string | null, t?: number) => {
      setSelected(id);
      if (id) {
        const e = byId.get(id)!;
        setPlayhead(e.t);
        const v = viewRef.current;
        const span = v.end - v.start;
        if (e.t < v.start + span * 0.05 || e.t > v.end - span * 0.05) animateTo(centreOn(e.t, span, STAY));
      } else if (t !== undefined) setPlayhead(Math.min(DOMAIN.end, Math.max(DOMAIN.start, t)));
    },
    [animateTo],
  );

  const zoomBy = useCallback((f: number, anchor?: number) => {
    stopAnim();
    setView((v) => zoomAt(v, f, anchor ?? Math.min(v.end, Math.max(v.start, playhead)), STAY));
  }, [playhead]);

  const visibleEvents = useMemo(() => {
    const hiddenRows = new Set(GROUPS.filter((g) => collapsed.has(g.id)).flatMap((g) => g.rows.map((r) => r.id)));
    return EVENTS.filter((e) => e.kind !== 'place' && !hiddenRows.has(e.row) && !(hiddenRows.has('news2') && e.kind === 'obs'));
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const fwd = e.key === 'ArrowRight';
        const cur = selected ? byId.get(selected)! : null;
        const ref = cur ? cur.t : playhead;
        const list = fwd ? visibleEvents : [...visibleEvents].reverse();
        const idx = cur ? list.indexOf(cur) : -1;
        const next = cur && idx >= 0 ? list[idx + 1] : list.find((x) => (fwd ? x.t > ref : x.t < ref));
        if (next) pick(next.id);
      } else if (e.key === '+' || e.key === '=') zoomBy(0.6);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 0.6);
      else if (e.key === '0') animateTo(STAY);
      else if (e.key === 'Escape') setSelected(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, playhead, visibleEvents, pick, zoomBy, animateTo]);

  // the value of each row at the playhead, shown beside its label
  const latest = useMemo(() => {
    const out: Record<string, string> = {};
    const o = obsAtOrBefore(playhead);
    if (o && playhead < DISCHARGED) {
      out.news2 = String(o.s.total);
      out.respRate = String(o.v.respRate);
      out.spo2 = String(o.v.spo2);
      out.bp = `${o.v.systolic}/${o.v.diastolic}`;
      out.pulse = String(o.v.pulse);
      out.temp = o.v.temp.toFixed(1);
      out.consciousness = o.v.consciousness === 'alert' ? 'Alert' : 'New';
    }
    for (const r of resultsAt(playhead)) out[r.test.id] = String(r.last.value);
    for (const m of medsAt(playhead)) if (m.state === 'running') out[m.drug.id] = 'on';
    return out;
  }, [playhead]);

  const span = view.end - view.start;
  const toggle = (g: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(g)) n.delete(g);
    else n.add(g);
    return n;
  });

  return (
    <div className="shell">
      <header className="banner">
        <div className="who">
          <h1>{PATIENT.name}</h1>
          <span>{PATIENT.age}, {PATIENT.sex}. {PATIENT.number}</span>
        </div>
        <div className="dx">
          <b>{PATIENT.diagnosis}</b>
          <span>Admitted {stamp(ADMITTED)}. Discharged {stamp(DISCHARGED)}. Stay {duration(DISCHARGED - ADMITTED)}.</span>
        </div>
        <span className="allergy">{PATIENT.allergies}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setTheme(dimmed ? 'light' : 'dark')} aria-pressed={dimmed}>
          {dimmed ? 'Bright display' : 'Dim display'}
        </button>
      </header>

      <nav className="moments" aria-label="Key moments">
        <span className="moments-lbl">Key moments</span>
        <div className="chips">
          {MOMENTS.map((m) => (
            <button key={m.id} className={`chip${selected === m.id ? ' on' : ''}`} onClick={() => { animateTo({ start: m.view[0], end: m.view[1] }); pick(m.id); }}>
              {m.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="zoom" role="group" aria-label="Zoom">
          <button className={`btn small${span >= STAY.end - STAY.start - 1 ? ' on' : ''}`} onClick={() => animateTo(STAY)}>Whole stay</button>
          <button className="btn small" onClick={() => animateTo(centreOn(playhead, 1440, STAY))}>24 h</button>
          <button className="btn small" onClick={() => animateTo(centreOn(playhead, 360, STAY))}>6 h</button>
          <button className="btn small icon" onClick={() => zoomBy(1 / 0.6)} aria-label="Zoom out">−</button>
          <button className="btn small icon" onClick={() => zoomBy(0.6)} aria-label="Zoom in">+</button>
        </div>
      </nav>

      <main className="main">
        <div className="chart">
          <LaneLabels layout={layout} onToggle={toggle} latest={latest} />
          <div className="track" ref={trackRef}>
            <Timeline
              view={view}
              width={width}
              layout={layout}
              playhead={playhead}
              selected={selected}
              focus={focus}
              onPan={(m) => { stopAnim(); setView((v) => pan(v, m, STAY)); }}
              onZoom={(f, a) => zoomBy(f, a)}
              onScrub={(t) => setPlayhead(Math.min(DOMAIN.end, Math.max(DOMAIN.start, t)))}
              onPick={(id, t) => pick(id, t)}
              onCluster={(s, e) => animateTo({ start: s - 90, end: e + 90 })}
            />
          </div>
          <p className="hint">
            Drag the lanes to move through time, drag the time bar to scrub. Pinch or Ctrl and scroll to zoom. Click anything to see what
            prompted it and what it led to. Keyboard: arrow keys step through events, + and − zoom, 0 shows the whole stay.
          </p>
        </div>

        <aside className="panel">
          {selected && <Selected id={selected} onPick={(id) => pick(id)} onClose={() => setSelected(null)} />}
          <Now t={playhead} onPick={(id) => pick(id)} />
          <Response onPick={(id) => { pick(id); animateTo(centreOn(byId.get(id)!.t, 300, STAY)); }} />
          <p className="foot">
            A fictional patient and a simulated record, for demonstrating interface design. Not a medical device. NEWS2 from the Royal College
            of Physicians (2017), CURB-65 from the British Thoracic Society. The same patient is Bed 3 in the ward monitor.
          </p>
        </aside>
      </main>
    </div>
  );
}
