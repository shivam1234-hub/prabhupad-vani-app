import React from 'react';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme, useThemeColors } from '../../contexts/ThemeContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory } from '../../contexts/HistoryContext';
import { getTypeMeta } from '../../data/types';
import { COVERS } from '../TypeThumb';
import { Icon, Page, PageHead, SectionHead, TextSizeStepper, openCategory } from './ui';

/**
 * Desktop Library — app/(tabs)/library.tsx laid out for a wide window: the
 * three book collections as large covers, every other collection as a card
 * grid, plus the same text-size, downloads and theme controls.
 */
export default function DesktopLibrary() {
  const c = useThemeColors();
  const { isDark, toggle } = useTheme();
  const { categorySummary, all, counts } = useAllRecordings();
  const { totalCount } = useDownload();
  const { getMostRecentForType } = useHistory();

  const books = Object.keys(COVERS).filter(t => counts[t] > 0);
  const others = categorySummary.filter(s => !books.includes(s.type));

  return (
    <Page>
      <PageHead
        eyebrow="Lecture archive"
        title="Library"
        sub={`${all.length.toLocaleString()} recordings · ${categorySummary.length} collections`}
        right={
          <>
            <TextSizeStepper />
            <button className="pv-btn" onClick={() => router.navigate('/downloads' as any)} data-tip="Downloaded for offline">
              <Icon name="cloud-download" size={16} color={c.link} /> {totalCount} offline
            </button>
            <button className="pv-btn" onClick={toggle} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
              <Icon name={isDark ? 'sunny-outline' : 'moon-outline'} size={16} /> {isDark ? 'Light' : 'Dark'}
            </button>
          </>
        }
      />

      <SectionHead title="Sacred texts" />
      <div className="pv-books">
        {books.map(type => {
          const meta = getTypeMeta(type);
          const last = getMostRecentForType(type);
          return (
            <div key={type} className="pv-book" onClick={() => openCategory(type)} role="button" aria-label={`${meta.label}, ${counts[type]} lectures`}>
              <div className="pv-book-img">
                <Image source={COVERS[type]} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--textPrimary)' }}>{meta.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
                  <span style={{ color: meta.color, fontWeight: 800, fontSize: 15 }}>{counts[type].toLocaleString()}</span>
                  <span style={{ color: 'var(--textDim)', fontSize: 12, fontWeight: 600 }}>lectures</span>
                </div>
                {last ? (
                  <div className="pv-tile-meta" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="return-down-forward" size={12} color={meta.color} /> Last: {last.title}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="pv-section">
        <SectionHead title="All collections" count={categorySummary.length} />
        <div className="pv-grid" style={{ ['--min' as any]: '230px' } as React.CSSProperties}>
          {[...books.map(t => ({ type: t, count: counts[t] })), ...others].map(({ type, count }) => {
            const meta = getTypeMeta(type);
            return (
              <div
                key={type}
                className="pv-tile"
                style={{ borderColor: meta.color + '33', overflow: 'hidden', minHeight: 132, justifyContent: 'space-between' }}
                onClick={() => openCategory(type)}
                role="button"
                aria-label={`${meta.label}, ${count} recordings`}
              >
                <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: 60, background: meta.color + '14' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  </div>
                  <span className="pv-badge" style={{ color: meta.color, background: meta.color + '1f' }}>{meta.badge}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--textSecondary)' }}>{meta.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ color: meta.color, fontWeight: 800, fontSize: 19 }}>{count.toLocaleString()}</span>
                  <span style={{ color: 'var(--textDim)', fontSize: 12, fontWeight: 600 }}>recordings</span>
                  <span style={{ marginLeft: 'auto' }}><Ionicons name="arrow-forward" size={15} color={c.textFaint} /></span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', color: 'var(--textFaint)', fontSize: 12, padding: '26px 0 0', letterSpacing: 0.5 }}>
          {all.length.toLocaleString()} recordings total
        </div>
      </div>
    </Page>
  );
}
