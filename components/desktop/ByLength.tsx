import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { useHistory } from '../../contexts/HistoryContext';
import { getTypeMeta, Recording, TYPE_META } from '../../data/types';
import { durationSec } from '../../utils/durations';
import { Empty, Icon, LectureTable, Page, PageHead } from './ui';

const QUICK = [10, 20, 30, 45, 60, 90];
const WINDOWS = [2, 5, 10];
const PER_SECTION = 8;
const TYPE_ORDER = Object.keys(TYPE_META);

interface Hit { rec: Recording; sec: number; diff: number }

function DiffCell({ diff }: { diff: number }) {
  const c = useThemeColors();
  const dm = Math.round(diff / 60);
  const t = dm === 0 ? 'exact' : dm > 0 ? `+${dm} min` : `−${-dm} min`;
  return <span style={{ fontWeight: 700, color: dm === 0 ? c.success : 'var(--textMuted)' }}>{t}</span>;
}

/** Desktop "Find by length" — same matching as app/by-length.tsx, results as tables. */
export default function DesktopByLength() {
  const c = useThemeColors();
  const { all } = useAllRecordings();
  const { historyMap } = useHistory();
  const [text, setText] = useState('');
  const [windowMin, setWindowMin] = useState(5);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60); }, []);

  const minutes = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && minutes > 0 && minutes < 1000;

  const timed = useMemo(() => {
    const out: { rec: Recording; sec: number }[] = [];
    for (const rec of all) { const sec = durationSec(rec); if (sec && sec > 30) out.push({ rec, sec }); }
    return out;
  }, [all]);

  const { groups, totalHits, nearest } = useMemo(() => {
    if (!valid) return { groups: [] as [string, Hit[]][], totalHits: 0, nearest: [] as Hit[] };
    const target = minutes * 60;
    const win = windowMin * 60;
    const scored: Hit[] = timed.map(t => ({ ...t, diff: t.sec - target }));
    const within = scored.filter(h => Math.abs(h.diff) <= win);
    const byType = new Map<string, Hit[]>();
    for (const h of within) { const l = byType.get(h.rec.type) ?? []; l.push(h); byType.set(h.rec.type, l); }
    for (const l of byType.values()) l.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
    const rank = (t: string) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? 999 : i; };
    const g = [...byType.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
    const near = within.length ? [] : [...scored].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff)).slice(0, 10);
    return { groups: g, totalHits: within.length, nearest: near };
  }, [valid, minutes, windowMin, timed]);

  const filterStale = !!typeFilter && !groups.some(([t]) => t === typeFilter);
  useEffect(() => { if (filterStale) setTypeFilter(null); }, [filterStale]);
  const shown = typeFilter && !filterStale ? groups.filter(([t]) => t === typeFilter) : groups;

  const diffCol = (hits: Hit[]) => {
    const m = new Map(hits.map(h => [h.rec, h.diff]));
    return { title: 'vs. target', width: 100, render: (r: Recording) => <DiffCell diff={m.get(r) ?? 0} /> };
  };

  return (
    <Page>
      <PageHead eyebrow="Find a lecture" title="Find by length" sub="How many minutes do you have? Lectures closest to that length come first, grouped by collection." />

      <div className="pv-card" style={{ padding: 22, display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="time-outline" size={30} color={c.accent} />
          <input
            ref={inputRef}
            className="pv-input"
            style={{ width: 110, height: 52, fontSize: 28, fontWeight: 800, textAlign: 'center', borderRadius: 12 }}
            value={text}
            inputMode="numeric"
            maxLength={4}
            placeholder="30"
            onChange={e => { setText(e.target.value.replace(/[^0-9.,]/g, '')); setExpanded({}); }}
            aria-label="Minutes"
          />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--textMuted)' }}>minutes</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUICK.map(q => (
            <button key={q} className={`pv-chip ${valid && minutes === q ? 'on' : ''}`} onClick={() => { setText(String(q)); setExpanded({}); }}>{q} min</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span className="pv-filter-label">Within</span>
          <div className="pv-seg">
            {WINDOWS.map(w => <button key={w} className={windowMin === w ? 'on' : ''} onClick={() => setWindowMin(w)}>±{w} min</button>)}
          </div>
        </div>
      </div>

      {!valid ? (
        <Empty icon="hourglass-outline" title="Type a length or pick one above" text="Lectures closest to it are listed first, grouped by Bhagavad-gita, Srimad-Bhagavatam, Caitanya-caritamrta and the rest." />
      ) : totalHits > 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '22px 0 4px' }}>
            <span style={{ fontWeight: 700, color: 'var(--textMuted)', marginRight: 6 }}>
              {totalHits.toLocaleString('en-IN')} lectures between {Math.max(minutes - windowMin, 0)} and {minutes + windowMin} minutes
            </span>
            <button className={`pv-chip ${!typeFilter ? 'on' : ''}`} onClick={() => setTypeFilter(null)}>All {totalHits}</button>
            {groups.map(([t, hits]) => {
              const m = getTypeMeta(t);
              return (
                <button key={t} className={`pv-chip ${typeFilter === t ? 'on' : ''}`} style={{ ['--tint' as any]: m.color } as React.CSSProperties} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
                  {m.badge} {hits.length}
                </button>
              );
            })}
          </div>
          {shown.map(([t, hits]) => {
            const m = getTypeMeta(t);
            const open = expanded[t] || !!typeFilter;
            const list = open ? hits : hits.slice(0, PER_SECTION);
            return (
              <div key={t} className="pv-section" style={{ marginTop: 26 }}>
                <div className="pv-section-head">
                  <span className="pv-badge" style={{ color: m.color, background: m.color + '22' }}>{m.badge}</span>
                  <div className="pv-section-title">{m.label}</div>
                  <div className="pv-count" style={{ color: m.color, background: m.color + '1f' }}>{hits.length}</div>
                  {hits.length > PER_SECTION && !typeFilter ? (
                    <button className="pv-link" style={{ color: m.color }} onClick={() => setExpanded(e => ({ ...e, [t]: !open }))}>
                      {open ? 'Show fewer' : `Show all ${hits.length}`}
                    </button>
                  ) : null}
                </div>
                <LectureTable rows={list.map(h => h.rec)} historyMap={historyMap} tint={m.color} numbered={false} extraCol={diffCol(list)} />
              </div>
            );
          })}
        </>
      ) : (
        <div className="pv-section" style={{ marginTop: 22 }}>
          <div className="pv-section-head"><div className="pv-section-title" style={{ fontSize: 15 }}>Nothing within ±{windowMin} min of {minutes} minutes. Closest lectures:</div></div>
          <LectureTable rows={nearest.map(h => h.rec)} historyMap={historyMap} showType numbered={false} extraCol={diffCol(nearest)} />
        </div>
      )}
    </Page>
  );
}
