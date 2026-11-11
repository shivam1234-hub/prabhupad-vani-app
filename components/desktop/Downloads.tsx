import React, { useMemo } from 'react';
import { Alert } from 'react-native';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getTypeMeta, Recording } from '../../data/types';
import { Empty, Icon, LectureTable, Page, PageHead } from './ui';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export function openDownloadsFolder() {
  (window as any).desktop?.downloads?.openFolder?.();
}

/** Desktop Downloads: active transfers, then every offline lecture as a table. */
export default function DesktopDownloads() {
  const c = useThemeColors();
  const { registry, progress, deleteAll, cancelDownload, totalBytes, totalCount } = useDownload();
  const { getById } = useAllRecordings();
  const { historyMap } = useHistory();

  const rows = useMemo(() => Object.entries(registry)
    .sort((a, b) => (b[1].downloadedAt ?? '').localeCompare(a[1].downloadedAt ?? ''))
    .map(([id]) => getById(id))
    .filter(Boolean) as Recording[], [registry, getById]);
  const active = Object.entries(progress);

  const handleDeleteAll = () => {
    if (totalCount === 0) return;
    Alert.alert('Delete All Downloads', `Remove all ${totalCount} downloaded recordings? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: () => deleteAll() },
    ]);
  };

  return (
    <Page>
      <PageHead
        eyebrow="Listen offline"
        title="Downloads"
        sub={totalCount > 0 ? `${totalCount} recordings · ${formatBytes(totalBytes)} on this computer` : 'Audio and transcript are saved together, so downloaded lectures read and play offline.'}
        right={
          <>
            {(window as any).desktop ? (
              <button className="pv-btn" onClick={openDownloadsFolder}><Icon name="folder-open-outline" size={16} /> Open folder</button>
            ) : null}
            {totalCount > 0 ? (
              <button className="pv-btn danger" onClick={handleDeleteAll}><Icon name="trash-outline" size={15} color={c.danger} /> Delete all</button>
            ) : null}
          </>
        }
      />

      {active.length > 0 ? (
        <div style={{ marginBottom: 26 }}>
          <div className="pv-side-label">In progress · {active.length}</div>
          <div className="pv-list">
            {active.map(([id, p]) => {
              const rec = getById(id);
              const meta = getTypeMeta(rec?.type ?? '');
              const pct = p.bytesTotal > 0 ? Math.round((p.bytesWritten / p.bytesTotal) * 100) : 0;
              return (
                <div key={id} className="pv-row" style={{ cursor: 'default' }}>
                  <span className="pv-badge" style={{ color: meta.color, background: meta.color + '22' }}>{meta.badge}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pv-cell-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rec?.title ?? id}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                      <div className="pv-track" style={{ flex: 1, maxWidth: 360 }}><div style={{ width: `${pct}%`, background: p.status === 'error' ? c.dangerAlt : meta.color }} /></div>
                      <span style={{ fontSize: 12, color: p.status === 'error' ? c.dangerAlt : 'var(--textDim)' }}>
                        {p.status === 'fetching' ? 'Fetching audio links…' : p.status === 'error' ? (p.totalParts === 0 ? 'No audio available' : 'Failed') : `${pct}%${p.totalParts > 1 ? ` · part ${Math.min(p.partsDone + 1, p.totalParts)}/${p.totalParts}` : ''}`}
                      </span>
                    </div>
                  </div>
                  <button className="pv-btn sm" onClick={() => cancelDownload(id)}>{p.status === 'error' ? 'Dismiss' : 'Cancel'}</button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {rows.length === 0 && active.length === 0 ? (
        <Empty icon="cloud-download-outline" color={c.link} title="No downloads yet" text="Use the download button on any lecture, or “Download all” on a collection." />
      ) : rows.length > 0 ? (
        <LectureTable rows={rows} historyMap={historyMap} showType numbered={false} />
      ) : null}
    </Page>
  );
}
