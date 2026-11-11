import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useHistory, HistoryEntry, HistoryRetention } from '../../contexts/HistoryContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getTypeMeta } from '../../data/types';
import { formatMs, formatRelativeTime } from '../../utils/time';
import { Cover, Empty, Icon, Page, PageHead, ProgressCell, durationText, openLecture, usePlayRecording } from './ui';

export const RETENTION_OPTIONS: { label: string; value: HistoryRetention }[] = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '3 months', value: 90 },
  { label: 'Forever', value: -1 },
];

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, y)) return 'Yesterday';
  const diff = (today.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Desktop History: grouped by day, with the same retention control and Clear. */
export default function DesktopHistory() {
  const c = useThemeColors();
  const { history, settings, clearHistory, updateSettings } = useHistory();
  const { getById } = useAllRecordings();
  const { play } = usePlayRecording();

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryEntry[] }[] = [];
    for (const e of history) {
      const label = dayLabel(e.playedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [history]);

  const handleClear = () => {
    Alert.alert('Clear History', 'Remove all watch history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);
  };

  return (
    <Page>
      <PageHead
        eyebrow="Your journey"
        title="History"
        sub={history.length > 0 ? `${history.length} lectures played` : undefined}
        right={
          <>
            <span className="pv-filter-label">Keep history</span>
            <div className="pv-seg">
              {RETENTION_OPTIONS.map(o => (
                <button key={o.value} className={settings.retention === o.value ? 'on' : ''} onClick={() => updateSettings({ retention: o.value })}>{o.label}</button>
              ))}
            </div>
            {history.length > 0 ? (
              <button className="pv-btn danger" onClick={handleClear}><Icon name="trash-outline" size={15} color={c.danger} /> Clear</button>
            ) : null}
          </>
        }
      />
      {history.length === 0 ? (
        <Empty icon="time-outline" title="No history yet" text="Lectures you play will appear here." />
      ) : groups.map(g => (
        <div key={g.label} className="pv-section" style={{ marginTop: 22 }}>
          <div className="pv-side-label">{g.label}</div>
          <div className="pv-list">
            {g.items.map(e => {
              const meta = getTypeMeta(e.type);
              const rec = getById(e.id);
              return (
                <div key={e.id + e.playedAt} className="pv-row" onClick={() => openLecture(e.id, e)} title={rec?.fullTitle ?? e.title}>
                  <Cover type={e.type} w={['Bhagavad-gita', 'Srimad-Bhagavatam', 'CC'].includes(e.type) ? 34 : 44} h={44} radius={7} badge={false} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span className="pv-badge" style={{ color: meta.color, background: meta.color + '22' }}>{meta.badge}</span>
                      <span className="pv-cell-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                    </div>
                    <div className="pv-tile-meta" style={{ marginTop: 3 }}>
                      {[rec?.location, rec?.year, rec ? durationText(rec) : null, formatRelativeTime(e.playedAt)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ width: 170 }}><ProgressCell entry={e} color={meta.color} /></div>
                  <button
                    className="pv-btn sm"
                    onClick={ev => { ev.stopPropagation(); if (rec) play(rec, e); }}
                    data-tip={e.positionMs > 5000 ? `Resume at ${formatMs(e.positionMs)}` : 'Play'}
                  >
                    <Ionicons name="play" size={13} color={meta.color} /> {e.positionMs > 5000 ? 'Resume' : 'Play'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Page>
  );
}
