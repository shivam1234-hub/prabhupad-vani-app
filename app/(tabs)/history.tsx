import React, { useMemo } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import {
  Alert, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistory, HistoryRetention } from '../../contexts/HistoryContext';
import { getTypeMeta } from '../../data/types';
import { formatMs, formatRelativeTime } from '../../utils/time';
import ScreenHeader from '../../components/ScreenHeader';
import TypeThumb from '../../components/TypeThumb';
import { Desktop } from '../../components/desktop';

const RETENTION_OPTIONS: { label: string; value: HistoryRetention }[] = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '3 months', value: 90 },
  { label: 'Forever', value: -1 },
];

function HistoryScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { history, settings, clearHistory, updateSettings } = useHistory();

  const handleClear = () => {
    Alert.alert('Clear History', 'Remove all watch history?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearHistory },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow="Your journey"
        title="History"
        subtitle={history.length > 0 ? `${history.length} lectures played` : undefined}
        right={history.length > 0 ? (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear} activeOpacity={0.75}>
            <Ionicons name="trash-outline" size={14} color={c.danger} />
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      {/* Retention setting */}
      <View style={styles.retentionRow}>
        <Text style={styles.retentionLabel}>Keep history:</Text>
        {RETENTION_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.retentionChip, settings.retention === opt.value && styles.retentionChipActive]}
            onPress={() => updateSettings({ retention: opt.value })}
            activeOpacity={0.75}
          >
            <Text style={[styles.retentionChipText, settings.retention === opt.value && styles.retentionChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="time-outline" size={44} color={c.accent} />
          </View>
          <Text style={styles.emptyTitle}>No history yet</Text>
          <Text style={styles.emptyHint}>Lectures you play will appear here</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id + item.playedAt}
          renderItem={({ item }) => {
            const meta = getTypeMeta(item.type);
            const hasPosition = item.positionMs > 5000;
            const progressPct = (item.durationMs > 0)
              ? Math.min(item.positionMs / item.durationMs, 0.99)
              : 0;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  const params = hasPosition ? `?resume=${item.positionMs}` : '';
                  router.push(`/lecture/${item.id}${params}` as any);
                }}
                activeOpacity={0.75}
              >
                <TypeThumb type={item.type} size={48} radius={12} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                  <View style={styles.rowMeta}>
                    <View style={[styles.typeBadge, { backgroundColor: meta.color + '22' }]}>
                      <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.badge}</Text>
                    </View>
                    <Text style={styles.timeText}>{formatRelativeTime(item.playedAt)}</Text>
                    {hasPosition && (
                      <Text style={[styles.resumeText, { color: meta.color }]}>
                        ▶ Resume {formatMs(item.positionMs)}
                      </Text>
                    )}
                  </View>
                  {hasPosition && progressPct > 0 && (
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { backgroundColor: meta.color, width: `${(progressPct * 100).toFixed(1)}%` as any }]} />
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.textFaintest} />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.dangerBgDeep, borderWidth: 1, borderColor: c.dangerBg,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  clearText: { color: c.danger, fontSize: 12, fontWeight: '700' },
  retentionRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingBottom: 12, gap: 6, flexWrap: 'wrap',
  },
  retentionLabel: { color: c.textDim, fontSize: 12, fontWeight: '700', marginRight: 2 },
  retentionChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  retentionChipActive: { borderColor: c.accent, backgroundColor: c.accent + '1f' },
  retentionChipText: { color: c.textDim, fontSize: 12, fontWeight: '600' },
  retentionChipTextActive: { color: c.accent, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 },
  emptyIconWrap: {
    width: 92, height: 92, borderRadius: 46, marginBottom: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent + '1a',
  },
  emptyTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
  emptyHint: { color: c.textDim, fontSize: 13 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 12,
    borderRadius: 16, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.card, gap: 12,
  },
  rowInfo: { flex: 1, gap: 5 },
  rowTitle: { color: c.textSecondary, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  typeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  timeText: { color: c.textDim, fontSize: 12 },
  resumeText: { fontSize: 11, fontWeight: '700' },
  progressTrack: {
    height: 4, backgroundColor: c.border, borderRadius: 2,
    overflow: 'hidden', marginTop: 4,
  },
  progressFill: { height: 4, borderRadius: 2 },
});

// Windows desktop build (Electron over the web export): the wide-window
// layout. Phones get null here and keep the screen above unchanged.
export default function HistoryScreenRoute() {
  return Desktop ? <Desktop.History /> : <HistoryScreen />;
}
