import React, { useCallback, useState, useMemo } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSearch, SortBy } from '../../hooks/useSearch';
import { useLibrary } from '../../contexts/LibraryContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useHistory, HistoryEntry } from '../../contexts/HistoryContext';
import {
  getTypeMeta,
  getRecordingId,
  TYPE_META,
  Recording,
} from '../../data/types';
import { useAudioMeta } from '../../contexts/AudioContext';
import WatchBadge from '../../components/WatchBadge';
import { fetchAudioUrls } from '../../utils/audioUrls';
import ScreenHeader from '../../components/ScreenHeader';
import TypeThumb from '../../components/TypeThumb';

const ACCENT = '#FF7722';


// ─── Chip components ─────────────────────────────────────────────────────────

function FilterChip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color: string;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity
      style={[styles.chip, selected && { borderColor: color, backgroundColor: color + '20' }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────

interface RecordingRowProps {
  recording: Recording;
  isFav: boolean;
  tags: string[];
  historyEntry?: HistoryEntry;
  onToggleFav: () => void;
  onPlay: () => void;
}

function RecordingRow({ recording, isFav, tags, historyEntry, onToggleFav, onPlay }: RecordingRowProps) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(recording.type);
  const [playing, setPlaying] = useState(false);

  const handlePlay = useCallback(async () => {
    setPlaying(true);
    try { await onPlay(); } finally { setPlaying(false); }
  }, [onPlay]);

  const subtitle = [recording.location, recording.year].filter(Boolean).join(' · ');
  const visibleTags = tags.slice(0, 3);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push('/lecture/' + getRecordingId(recording))}
      activeOpacity={0.75}
    >
      <TypeThumb type={recording.type} size={46} radius={12} showBadge />

      <View style={styles.rowCenter}>
        <Text style={styles.rowTitle} numberOfLines={1}>{recording.title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        {visibleTags.length > 0 && (
          <View style={styles.tagRow}>
            {visibleTags.map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
        <WatchBadge entry={historyEntry} accentColor={meta.color} />
      </View>

      <View style={styles.rowActions}>
        <TouchableOpacity onPress={onToggleFav} hitSlop={10} style={styles.actionBtn}>
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? c.danger : c.textFaint} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handlePlay} hitSlop={10} style={styles.actionBtn} disabled={playing}>
          {playing
            ? <ActivityIndicator size="small" color={ACCENT} />
            : <Ionicons name="play-circle" size={26} color={ACCENT} />}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type QuickFilter = 'all' | 'favourites' | string;

export default function BrowseScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const audio = useAudioMeta();
  const { favourites, toggleFavourite, allTags, getTagsFor } = useLibrary();
  const { getLocalUris } = useDownload();
  const { historyMap } = useHistory();

  const { filters, setFilters, results } = useSearch();
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');

  const typeKeys = Object.keys(TYPE_META);

  const hasAnyFilter =
    filters.query.trim().length > 0 ||
    filters.types.length > 0 ||
    filters.onlyFavourites ||
    filters.tags.length > 0;

  const clearAll = () => {
    setQuickFilter('all');
    setFilters(prev => ({ ...prev, query: '', onlyFavourites: false, tags: [], types: [] }));
  };

  function handleQuickFilter(qf: QuickFilter) {
    setQuickFilter(qf);
    if (qf === 'all') setFilters(prev => ({ ...prev, onlyFavourites: false, tags: [] }));
    else if (qf === 'favourites') setFilters(prev => ({ ...prev, onlyFavourites: true, tags: [] }));
    else setFilters(prev => ({ ...prev, onlyFavourites: false, tags: [qf] }));
  }

  function handleTypeToggle(type: string) {
    setFilters(prev => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type],
    }));
  }

  const handlePlay = useCallback(async (recording: Recording) => {
    const id = getRecordingId(recording);
    const localUris = getLocalUris(id);
    const urls = await fetchAudioUrls(recording.vanisourceUrl);
    await audio.play(recording, urls, 0, localUris.length > 0 ? localUris : undefined);
  }, [audio, getLocalUris]);

  const renderItem = useCallback(({ item }: { item: Recording }) => {
    const id = getRecordingId(item);
    return (
      <RecordingRow
        recording={item}
        isFav={favourites.has(id)}
        tags={getTagsFor(id)}
        historyEntry={historyMap.get(id)}
        onToggleFav={() => toggleFavourite(id)}
        onPlay={() => handlePlay(item)}
      />
    );
  }, [favourites, getTagsFor, toggleFavourite, handlePlay, historyMap]);

  const keyExtractor = useCallback((item: Recording) => getRecordingId(item), []);
  const bottomPad = insets.bottom + 60 + (audio.recording ? 64 : 0);

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <ScreenHeader
        eyebrow="Find a lecture"
        title="Search"
        right={hasAnyFilter ? (
          <TouchableOpacity onPress={clearAll} style={styles.clearBtn} activeOpacity={0.8}>
            <Ionicons name="close-circle" size={13} color={ACCENT} />
            <Text style={styles.clearBtnText}>Clear all</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      {/* ── Search bar ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={c.textDimmer} />
        <TextInput
          style={styles.searchInput}
          value={filters.query}
          onChangeText={text => setFilters(prev => ({ ...prev, query: text }))}
          placeholder="Search recordings..."
          placeholderTextColor={c.borderStronger}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {filters.query.length > 0 && (
          <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, query: '' }))} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={c.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Quick filter row: All / Fav / tags ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        <FilterChip label="All" selected={quickFilter === 'all'} onPress={() => handleQuickFilter('all')} color={ACCENT} />
        <FilterChip label="Favourites" selected={quickFilter === 'favourites'} onPress={() => handleQuickFilter('favourites')} color={c.danger} />
        {allTags.map(tag => (
          <FilterChip key={tag} label={tag} selected={quickFilter === tag} onPress={() => handleQuickFilter(tag)} color={ACCENT} />
        ))}
      </ScrollView>

      {/* ── Type filter row: BG / SB / CONV … ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {typeKeys.map(type => {
          const meta = getTypeMeta(type);
          const active = filters.types.includes(type);
          return (
            <TouchableOpacity
              key={type}
              style={[styles.typeChip, active && { borderColor: meta.color, backgroundColor: meta.color + '22' }]}
              onPress={() => handleTypeToggle(type)}
              activeOpacity={0.7}
            >
              <Text style={[styles.typeChipText, active && { color: meta.color, fontWeight: '800' }]}>
                {meta.badge}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Sort + result count ── */}
      <View style={styles.sortBar}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {(['date', 'sequence', 'name-asc', 'name-desc'] as SortBy[]).map(s => {
          const label = s === 'date' ? 'Date' : s === 'sequence' ? 'Order' : s === 'name-asc' ? 'A→Z' : 'Z→A';
          const active = filters.sortBy === s;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.sortChip, active && styles.sortChipActive]}
              onPress={() => setFilters(prev => ({ ...prev, sortBy: s }))}
              activeOpacity={0.7}
            >
              <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
        {hasAnyFilter && (
          <Text style={styles.resultCount}>{results.length} result{results.length !== 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* ── Results ── */}
      {!hasAnyFilter ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="search" size={38} color={ACCENT} />
          </View>
          <Text style={styles.emptyTitle}>Search or filter above</Text>
          <Text style={styles.emptySubtitle}>Try a verse, place, year or topic</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={44} color={c.elevatedAlt2} />
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptySubtitle}>Try different keywords or filters</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: bottomPad }}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },

  // ── Header ──
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1,
    borderColor: ACCENT + '50', backgroundColor: ACCENT + '15',
  },
  clearBtnText: { color: ACCENT, fontSize: 12, fontWeight: '700' },

  // ── Search bar ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: 15, padding: 0 },

  // ── Filter rows — fixed height prevents layout shifts ──
  filterRow: { flexGrow: 0, height: 44 },
  filterRowContent: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 7,
    alignItems: 'center',
  },
  chip: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { color: c.textDim, fontSize: 13, fontWeight: '600' },

  typeChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipText: { color: c.textDimmer, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },

  // ── Sort bar ──
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 5,
    marginBottom: 6,
  },
  sortLabel: { color: c.borderStronger, fontSize: 11, fontWeight: '700', marginRight: 2 },
  sortChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  sortChipActive: { borderColor: ACCENT, backgroundColor: ACCENT + '20' },
  sortChipText: { color: c.textDimmer, fontSize: 11, fontWeight: '600' },
  sortChipTextActive: { color: ACCENT },
  resultCount: {
    marginLeft: 'auto' as any,
    color: c.borderStronger, fontSize: 11, fontWeight: '600',
  },

  // ── Result rows ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    gap: 12,
  },
  rowCenter: { flex: 1, gap: 3 },
  rowTitle: { color: c.textSecondary, fontSize: 14, fontWeight: '700' },
  rowSubtitle: { color: c.borderMuted, fontSize: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tagChip: {
    backgroundColor: ACCENT + '22', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  tagChipText: { color: ACCENT, fontSize: 10, fontWeight: '600' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  actionBtn: {
    width: 36, height: 36, padding: 4,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Empty state ──
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingBottom: 80,
  },
  emptyIconWrap: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: 'center', justifyContent: 'center', backgroundColor: ACCENT + '1a',
  },
  emptyTitle: { color: c.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 6 },
  emptySubtitle: { color: c.textDim, fontSize: 13 },
});
