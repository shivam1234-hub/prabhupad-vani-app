import React, { useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HistoryEntry } from '../contexts/HistoryContext';
import { formatMs } from '../utils/time';

const COMPLETED_RATIO = 0.92;
const MIN_RESUMABLE_MS = 5000;

interface Props {
  entry?: HistoryEntry;
  accentColor: string;
}

// Compact "watched" indicator for list rows — shows a checkmark once a
// lecture is essentially finished, or a resume-position chip + progress bar
// while it's partway through. Renders nothing if never played.
export default function WatchBadge({ entry, accentColor }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  if (!entry || entry.positionMs < MIN_RESUMABLE_MS) return null;

  const ratio = entry.durationMs > 0 ? entry.positionMs / entry.durationMs : 0;
  const completed = ratio >= COMPLETED_RATIO;

  if (completed) {
    return (
      <View style={styles.row}>
        <Ionicons name="checkmark-circle" size={13} color={c.success} />
        <Text style={styles.watchedText}>Watched</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Ionicons name="play-circle-outline" size={13} color={accentColor} />
        <Text style={[styles.resumeText, { color: accentColor }]}>
          Resume at {formatMs(entry.positionMs)}
        </Text>
      </View>
      {ratio > 0 && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(ratio, 0.99) * 100}%` as any, backgroundColor: accentColor }]} />
        </View>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { gap: 3, marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  watchedText: { color: c.success, fontSize: 11, fontWeight: '600' },
  resumeText: { fontSize: 11, fontWeight: '600' },
  track: {
    height: 3, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden', width: 90,
  },
  fill: { height: 3, borderRadius: 2 },
});
