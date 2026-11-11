import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAllRecordings } from '../../hooks/useAllRecordings';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory, HistoryEntry } from '../../contexts/HistoryContext';
import { getTypeMeta, getRecordingId, Recording } from '../../data/types';
import { SortBy, sortRecordings } from '../../hooks/useSearch';
import WatchBadge from '../../components/WatchBadge';
import { Desktop } from '../../components/desktop';

const ROW_HEIGHT_ESTIMATE = 76;

// ─── Download button for a single row ────────────────────────────────────────

interface DownloadButtonProps {
  id: string;
  vanisourceUrl: string;
}

function DownloadButton({ id, vanisourceUrl }: DownloadButtonProps) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { isDownloaded, progress, downloadRecording, deleteDownload } = useDownload();

  const dlProgress = progress[id];
  const downloaded = isDownloaded(id);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete download',
      'Remove this recording from your device?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(id) },
      ],
    );
  }, [id, deleteDownload]);

  if (dlProgress) {
    const pct =
      dlProgress.bytesTotal > 0
        ? Math.round((dlProgress.bytesWritten / dlProgress.bytesTotal) * 100)
        : 0;
    return (
      <View style={styles.dlBtnContainer}>
        {dlProgress.status === 'fetching' ? (
          <ActivityIndicator size="small" color={c.link} />
        ) : dlProgress.status === 'error' ? (
          <TouchableOpacity onPress={() => downloadRecording(id, vanisourceUrl)} hitSlop={HIT_SLOP}>
            <Ionicons name="alert-circle-outline" size={20} color={c.dangerAlt} />
          </TouchableOpacity>
        ) : (
          <View style={styles.dlProgressWrap}>
            <Text style={styles.dlPct}>{pct}%</Text>
            <View style={styles.dlProgressTrack}>
              <View style={[styles.dlProgressFill, { width: `${pct}%` as any }]} />
            </View>
          </View>
        )}
      </View>
    );
  }

  if (downloaded) {
    return (
      <TouchableOpacity onPress={handleDelete} hitSlop={HIT_SLOP}>
        <Ionicons name="checkmark-circle" size={22} color={c.success} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => downloadRecording(id, vanisourceUrl)}
      hitSlop={HIT_SLOP}
    >
      <Ionicons name="cloud-download-outline" size={22} color={c.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Individual recording row ─────────────────────────────────────────────────

interface RecordingRowProps {
  recording: Recording;
  accentColor: string;
  typeBadge: string;
  historyEntry?: HistoryEntry;
  isRecent?: boolean;
}

function RecordingRow({ recording, accentColor, typeBadge, historyEntry, isRecent }: RecordingRowProps) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { isDownloaded, deleteDownload } = useDownload();
  const id = getRecordingId(recording);
  const downloaded = isDownloaded(id);

  // Mirrors WatchBadge's own resumable check so the row's "Resume at mm:ss"
  // affordance and the actual tap behavior agree — a lecture WatchBadge shows
  // as "Watched" (no resume chip) shouldn't silently resume near its end either.
  const hasResumePosition = !!historyEntry
    && historyEntry.positionMs > 5000
    && (historyEntry.durationMs <= 0 || historyEntry.positionMs / historyEntry.durationMs < 0.92);

  const handlePress = useCallback(() => {
    // Navigate by the catalog's own unique id, not getRecordingId()'s pvId —
    // a single audio recording can be cataloged under multiple verse entries
    // sharing one pvId (e.g. "710806sblon" covers both SB 01.01.01 and SB
    // 01.02.06), and useAllRecordings' idMap only keeps the last entry
    // inserted per pvId. Routing by pvId here would silently open whichever
    // of those entries "won" instead of the one actually tapped.
    const params = hasResumePosition ? `?resume=${historyEntry!.positionMs}` : '';
    router.push(`/lecture/${recording.id}${params}` as any);
  }, [recording.id, hasResumePosition, historyEntry]);

  const handleLongPress = useCallback(() => {
    if (!downloaded) return;
    Alert.alert(
      'Delete download',
      `Remove "${recording.title}" from your device?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(id) },
      ],
    );
  }, [downloaded, id, recording.title, deleteDownload]);

  return (
    <TouchableOpacity
      style={[styles.row, isRecent && { backgroundColor: accentColor + '0f' }]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      {/* Type badge */}
      <View style={[styles.badge, { backgroundColor: accentColor + '22', borderColor: accentColor + '55' }]}>
        <Text style={[styles.badgeText, { color: accentColor }]}>{typeBadge}</Text>
      </View>

      {/* Text content */}
      <View style={styles.rowText}>
        {isRecent && (
          <View style={styles.recentPillRow}>
            <Ionicons name="return-down-forward" size={11} color={accentColor} />
            <Text style={[styles.recentPillText, { color: accentColor }]}>Continue where you left off</Text>
          </View>
        )}
        <Text style={styles.rowTitle} numberOfLines={2}>{recording.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[recording.location, recording.date].filter(Boolean).join(' · ')}
        </Text>
        <WatchBadge entry={historyEntry} accentColor={accentColor} />
      </View>

      {/* Download button */}
      <DownloadButton id={id} vanisourceUrl={recording.vanisourceUrl} />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function CategoryScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Recording>>(null);
  const didAutoScroll = useRef(false);

  const { byType } = useAllRecordings();
  const { isDownloaded, downloadBatch, progress } = useDownload();
  const { historyMap, getMostRecentForType } = useHistory();
  const [sortBy, setSortBy] = React.useState<SortBy>('sequence');
  const [chapterFilter, setChapterFilter] = React.useState<number | null>(null);

  const chapters = useMemo(() => {
    if (slug !== 'Bhagavad-gita' && slug !== 'Srimad-Bhagavatam') return [];
    const nums = new Set<number>();
    for (const r of byType[slug] ?? []) {
      const m = r.title.match(/(\d+)\./);
      if (m) nums.add(parseInt(m[1], 10));
    }
    return [...nums].sort((a, b) => a - b);
  }, [byType, slug]);

  const recordings: Recording[] = useMemo(
    () => {
      let list = sortRecordings(byType[slug] ?? [], sortBy);
      if (chapterFilter !== null) {
        list = list.filter(r => {
          const m = r.title.match(/(\d+)\./);
          return m ? parseInt(m[1], 10) === chapterFilter : false;
        });
      }
      return list;
    },
    [byType, slug, sortBy, chapterFilter],
  );

  const meta = useMemo(() => getTypeMeta(slug), [slug]);

  // Set navigation title
  React.useEffect(() => {
    navigation.setOptions({ title: meta.label });
  }, [meta.label, navigation]);

  // Jump straight to the most recently-watched lecture in this section so the
  // user doesn't have to scroll to find where they left off.
  const recentEntry = useMemo(() => getMostRecentForType(slug), [getMostRecentForType, slug]);
  const recentIndex = useMemo(() => {
    if (!recentEntry) return -1;
    return recordings.findIndex(r => getRecordingId(r) === recentEntry.id);
  }, [recordings, recentEntry]);

  useEffect(() => {
    if (didAutoScroll.current || recentIndex <= 0) return;
    didAutoScroll.current = true;
    const timer = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: recentIndex, animated: true, viewPosition: 0.25 });
      } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [recentIndex]);

  const handleScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.25 });
      } catch {}
    }, 250);
  }, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ROW_HEIGHT_ESTIMATE,
    offset: ROW_HEIGHT_ESTIMATE * index,
    index,
  }), []);

  // Items not yet downloaded and not currently in progress (includes errored — allows retry)
  const undownloaded = useMemo(
    () =>
      recordings.filter(r => {
        const id = getRecordingId(r);
        const p = progress[id];
        return !isDownloaded(id) && (p == null || p.status === 'error');
      }),
    [recordings, isDownloaded, progress],
  );

  const failedCount = useMemo(
    () => recordings.filter(r => progress[getRecordingId(r)]?.status === 'error').length,
    [recordings, progress],
  );

  // Batch download progress bar stats
  const totalCount = recordings.length;
  const downloadedCount = useMemo(
    () => recordings.filter(r => isDownloaded(getRecordingId(r))).length,
    [recordings, isDownloaded],
  );
  const isBatchDownloading = Object.values(progress).some(
    p => p.status === 'fetching' || p.status === 'downloading',
  );

  const handleDownloadAll = useCallback(() => {
    if (undownloaded.length === 0) return;
    downloadBatch(
      undownloaded.map(r => ({ id: getRecordingId(r), vanisourceUrl: r.vanisourceUrl })),
    );
  }, [undownloaded, downloadBatch]);

  // ─── List header ────────────────────────────────────────────────────────────

  const ListHeader = useMemo(() => (
    <View style={styles.listHeader}>
      {/* Category info row */}
      <View style={styles.categoryRow}>
        <View style={styles.categoryInfo}>
          <Ionicons name={meta.icon as any} size={18} color={meta.color} style={{ marginRight: 8 }} />
          <Text style={[styles.categoryLabel, { color: meta.color }]}>{meta.label}</Text>
          <View style={[styles.countPill, { backgroundColor: meta.color + '22' }]}>
            <Text style={[styles.countText, { color: meta.color }]}>{totalCount}</Text>
          </View>
        </View>

        {/* Download All / Retry button */}
        <TouchableOpacity
          style={[
            styles.downloadAllBtn,
            undownloaded.length === 0 && styles.downloadAllBtnDisabled,
          ]}
          onPress={handleDownloadAll}
          disabled={undownloaded.length === 0}
          activeOpacity={0.7}
        >
          <Ionicons
            name={failedCount > 0 && undownloaded.length === failedCount ? 'refresh-outline' : 'cloud-download-outline'}
            size={14}
            color={undownloaded.length === 0 ? c.textDimmer : '#FF7722'}
          />
          <Text style={[styles.downloadAllText, undownloaded.length === 0 && styles.downloadAllTextDisabled]}>
            {undownloaded.length === 0
              ? 'All downloaded'
              : failedCount > 0 && undownloaded.length === failedCount
                ? `↻ Retry Failed (${failedCount})`
                : failedCount > 0
                  ? `↓ Download + Retry (${undownloaded.length})`
                  : `↓ Download All (${undownloaded.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Batch download progress bar */}
      {isBatchDownloading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${totalCount > 0 ? (downloadedCount / totalCount) * 100 : 0}%`,
                  backgroundColor: meta.color,
                },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>
            {downloadedCount} / {totalCount} downloaded
          </Text>
        </View>
      )}

      {/* Sort bar */}
      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {([
          { key: 'sequence', label: '# Order' },
          { key: 'date',     label: 'Date' },
          { key: 'name-asc', label: 'A→Z' },
          { key: 'name-desc',label: 'Z→A' },
        ] as { key: SortBy; label: string }[]).map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.sortChip, sortBy === key && { borderColor: meta.color, backgroundColor: meta.color + '22' }]}
            onPress={() => setSortBy(key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sortChipText, sortBy === key && { color: meta.color }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {chapters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chapterScroll}
          contentContainerStyle={styles.chapterScrollContent}
        >
          <TouchableOpacity
            style={[styles.chapterChip, chapterFilter === null && { borderColor: meta.color, backgroundColor: meta.color + '22' }]}
            onPress={() => setChapterFilter(null)}
          >
            <Text style={[styles.chapterChipText, chapterFilter === null && { color: meta.color }]}>All</Text>
          </TouchableOpacity>
          {chapters.map(ch => (
            <TouchableOpacity
              key={ch}
              style={[styles.chapterChip, chapterFilter === ch && { borderColor: meta.color, backgroundColor: meta.color + '22' }]}
              onPress={() => setChapterFilter(chapterFilter === ch ? null : ch)}
            >
              <Text style={[styles.chapterChipText, chapterFilter === ch && { color: meta.color }]}>
                {slug === 'Srimad-Bhagavatam' ? `Canto ${ch}` : `Ch ${ch}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={[styles.divider, { backgroundColor: meta.color + '44' }]} />
    </View>
  ), [meta, totalCount, undownloaded.length, handleDownloadAll, isBatchDownloading, downloadedCount, sortBy, setSortBy, chapters, chapterFilter, setChapterFilter, slug]);

  const renderItem = useCallback(
    ({ item }: { item: Recording }) => {
      const id = getRecordingId(item);
      return (
        <RecordingRow
          recording={item}
          accentColor={meta.color}
          typeBadge={meta.badge}
          historyEntry={historyMap.get(id)}
          isRecent={recentEntry?.id === id}
        />
      );
    },
    [meta, historyMap, recentEntry],
  );

  const keyExtractor = useCallback(
    (item: Recording) => item.id,
    [],
  );

  if (recordings.length === 0) {
    return (
      <View style={[styles.emptyContainer, { paddingTop: insets.top + 20 }]}>
        <Ionicons name="albums-outline" size={52} color={c.textFaintest} />
        <Text style={styles.emptyText}>No recordings found for "{slug}"</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        ref={listRef}
        data={recordings}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        getItemLayout={getItemLayout}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        initialNumToRender={30}
        maxToRenderPerBatch={30}
        windowSize={10}
      />
    </View>
  );
}

// ─── Shared constants ─────────────────────────────────────────────────────────

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
  },

  // ── List header ──
  listHeader: {
    paddingBottom: 4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
    marginRight: 12,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  countPill: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Download All button ──
  downloadAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF772244',
    backgroundColor: '#FF772211',
  },
  downloadAllBtnDisabled: {
    borderColor: c.textFaintest,
    backgroundColor: 'transparent',
  },
  downloadAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF7722',
  },
  downloadAllTextDisabled: {
    color: c.textDimmer,
  },

  // ── Progress bar ──
  progressContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 6,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: c.textMuted,
  },

  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 6,
  },
  sortLabel: {
    color: c.textDimmer,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 2,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  sortChipText: {
    color: c.textDimmer,
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: 0,
  },
  chapterScroll: { marginBottom: 8 },
  chapterScrollContent: { paddingHorizontal: 16, gap: 6, flexDirection: 'row' },
  chapterChip: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface,
  },
  chapterChipText: { color: c.textDimmer, fontSize: 12, fontWeight: '600' },

  // ── Recording row ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
    gap: 12,
  },
  badge: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 40,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textHigh,
    lineHeight: 19,
  },
  rowMeta: {
    fontSize: 11,
    color: c.textDim,
  },
  recentPillRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3,
  },
  recentPillText: {
    fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3,
  },

  // ── Download button ──
  dlBtnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 40,
    justifyContent: 'flex-end',
  },
  dlPct: {
    fontSize: 10,
    color: '#FF7722',
    fontWeight: '600',
  },
  dlProgressWrap: {
    alignItems: 'flex-end',
    gap: 3,
  },
  dlProgressTrack: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.border,
    overflow: 'hidden',
  },
  dlProgressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FF7722',
  },

  // ── Empty state ──
  emptyContainer: {
    flex: 1,
    backgroundColor: c.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    color: c.textDimmer,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});

// Windows desktop build (Electron over the web export): the wide-window
// layout. Phones get null here and keep the screen above unchanged.
export default function CategoryScreenRoute() {
  return Desktop ? <Desktop.Category /> : <CategoryScreen />;
}
