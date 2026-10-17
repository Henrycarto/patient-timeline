/** The side panel: the selected event and its reasons, then the state of the patient at the playhead. */
import { PARAM_LABEL, type Param } from '../clinical/news2';
import { LINKS, byId, drugById, type Event } from '../record/record';
import { periodsAtOrAbove, sepsisSix, stateAt, timeToReview, type MedState } from '../record/state';
import { clock, duration, stamp, stayDay } from '../record/time';
import { OBS } from '../record/vitals';

const RISK: Record<string, string> = { low: 'Low', 'low-medium': 'Low-medium', medium: 'Medium', high: 'High' };
const KIND: Record<Event['kind'], string> = {
  place: 'Location', obs: 'Observations', dose: 'Medicine', infusion: 'Medicine', stop: 'Medicine', lab: 'Result', micro: 'Result', note: 'Note',
};
const MED: Record<MedState, string> = { running: 'Running', given: 'Given', held: 'Held', 'not-retained': 'Not retained', stopped: 'Stopped', finished: 'Finished' };

function LinkList({ title, items, onPick }: { title: string; items: Array<{ id: string; why: string }>; onPick: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="links">
      <h4>{title}</h4>
      <ul>
        {items.map((l) => {
          const e = byId.get(l.id)!;
          return (
            <li key={l.id}>
              <button onClick={() => onPick(l.id)}>
                <span className="when">{clock(e.t)}</span>
                <span className="what">{e.title}</span>
                <span className="why">{l.why}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ORDER: Param[] = ['respRate', 'spo2', 'air', 'systolic', 'pulse', 'consciousness', 'temp'];

export function Selected({ id, onPick, onClose }: { id: string; onPick: (id: string) => void; onClose: () => void }) {
  const e = byId.get(id);
  if (!e) return null;
  const because = LINKS.filter((l) => l.to === id).map((l) => ({ id: l.from, why: l.why }));
  const led = LINKS.filter((l) => l.from === id).map((l) => ({ id: l.to, why: l.why }));
  const obs = e.kind === 'obs' ? OBS.find((o) => o.id === id) : undefined;
  const drug = e.lane === 'meds' ? drugById(e.row) : undefined;
  return (
    <section className="card selected" aria-live="polite">
      <div className="card-head">
        <span className="kicker">{e.author ?? KIND[e.kind]}</span>
        <button className="x" onClick={onClose} aria-label="Clear selection">×</button>
      </div>
      <h3>{e.title}</h3>
      <p className="when">{stamp(e.t)}{e.end && e.kind !== 'place' ? ` to ${clock(e.end)}, ${duration(e.end - e.t)}` : ''}</p>
      {e.detail && <p>{e.detail}</p>}
      {drug && e.kind === 'dose' && <p className="muted">{drug.name} {drug.dose}, {drug.how}.</p>}
      {obs && (
        <table className="pts-table">
          <tbody>
            {ORDER.map((k) => (
              <tr key={k}>
                <td>{PARAM_LABEL[k]}</td>
                <td className="v">{k === 'air' ? (obs.v.onOxygen ? 'Oxygen' : 'Air') : k === 'consciousness' ? (obs.v.consciousness === 'alert' ? 'Alert' : 'New confusion') : k === 'systolic' ? `${obs.v.systolic}/${obs.v.diastolic}` : k === 'temp' ? obs.v.temp.toFixed(1) : obs.v[k]}</td>
                <td><span className={`pts p${obs.s.points[k]}`}>{obs.s.points[k]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <LinkList title="Because of" items={because} onPick={onPick} />
      <LinkList title="Led to" items={led} onPick={onPick} />
      {!because.length && !led.length && e.kind !== 'obs' && <p className="muted small">No decision recorded as linked to this.</p>}
    </section>
  );
}

export function Now({ t, onPick }: { t: number; onPick: (id: string) => void }) {
  const s = stateAt(t);
  const meds = s.meds.filter((m) => m.state !== 'finished');
  return (
    <section className="card now">
      <div className="card-head">
        <span className="kicker">At the playhead</span>
      </div>
      <h3>{stamp(t)}</h3>
      <p className="when">{s.place?.title}{s.place && s.place.id !== 'home' ? `, day ${stayDay(t)} of the stay` : ''}</p>

      {s.obs && s.place?.id !== 'home' && (
        <button className={`news-now ${s.obs.s.risk}`} onClick={() => onPick(s.obs!.id)}>
          <span className="num">{s.obs.s.total}</span>
          <span>
            <b>NEWS2, {RISK[s.obs.s.risk].toLowerCase()} risk</b>
            <small>Observations at {clock(s.obs.t)}. {s.obs.s.frequency}.</small>
          </span>
        </button>
      )}
      {s.curb && s.place?.id !== 'home' && (
        <p className="curb">
          <b>CURB-65 {s.curb.total}</b>, {s.curb.severity} severity{s.curb.criteria.length ? `: ${s.curb.criteria.join(', ')}` : ''}.
        </p>
      )}

      {meds.length > 0 && (
        <>
          <h4>Medicines</h4>
          <ul className="meds-now">
            {meds.map((m) => (
              <li key={m.drug.id}>
                <button onClick={() => onPick(m.last.id)}>
                  <span className={`state ${m.state}`}>{MED[m.state]}</span>
                  <span className="what">{m.drug.name}</span>
                  <span className="when">{m.state === 'running' ? `since ${clock(m.last.t)}` : clock(m.last.t)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {s.results.length > 0 && (
        <>
          <h4>Latest results</h4>
          <ul className="results-now">
            {s.results.map((r) => {
              const v = r.last.value!;
              const p = r.previous?.value;
              const dir = p === undefined ? '' : v > p ? '↑' : v < p ? '↓' : '→';
              return (
                <li key={r.test.id}>
                  <button onClick={() => onPick(r.last.id)}>
                    <span className="what">{r.test.name}</span>
                    <span className={`v ${r.last.flag ?? ''}`}>{v} <small>{r.test.unit}</small> {dir && <i aria-label={dir === '↑' ? 'rising' : dir === '↓' ? 'falling' : 'unchanged'}>{dir}</i>}</span>
                    <span className="when">{t - r.last.t < 1440 ? clock(r.last.t) : `${duration(t - r.last.t)} ago`}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {s.note && (
        <>
          <h4>Last note</h4>
          <button className="last-note" onClick={() => onPick(s.note!.id)}>
            <span className="when">{clock(s.note.t)}, {s.note.author}</span>
            <span>{s.note.detail}</span>
          </button>
        </>
      )}
    </section>
  );
}

export function Response({ onPick }: { onPick: (id: string) => void }) {
  const steps = sepsisSix();
  const high = periodsAtOrAbove(7);
  const review = timeToReview(5);
  const met = steps.filter((s) => s.met).length;
  return (
    <section className="card response">
      <div className="card-head">
        <span className="kicker">Response, measured from the record</span>
      </div>
      <h3>Sepsis Six: {met} of 6 within the hour</h3>
      <p className="muted small">Minutes from the positive screen at {clock(byId.get('sepsis')!.t)}.</p>
      <ol className="bundle">
        {steps.map((s) => (
          <li key={s.name}>
            <button onClick={() => onPick(s.id)} className={s.met ? 'met' : 'late'}>
              <span>{s.name}</span>
              <b>{s.minutes} min</b>
            </button>
          </li>
        ))}
      </ol>
      <dl className="facts">
        {review && (
          <div>
            <dt>First NEWS2 of 5 or more to clinical review</dt>
            <dd>{duration(review.minutes)} <small>({clock(review.trigger.t)} to {clock(review.review.t)})</small></dd>
          </div>
        )}
        {high.map(([a, b]) => (
          <div key={a}>
            <dt>Time at high risk</dt>
            <dd>{duration(b - a)} <small>({clock(a)} to {clock(b)})</small></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
