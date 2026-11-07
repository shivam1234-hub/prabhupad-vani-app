import React, { useMemo } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import {
  Alert, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDownload, DownloadEntry } from '../../contexts/DownloadContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getTypeMeta } from '../../data/types';
import ScreenHeader from '../../components/ScreenHeader';
import TypeThumb from '../../components/TypeThumb';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 MB';
  if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

interface DownloadRow {
  id: string;
  entry: DownloadEntry;
}

export default function DownloadsScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { registry, deleteDownload, deleteAll, totalBytes, totalCount } = useDownload();
  const { getById } = useAllRecordings();

  const rows: DownloadRow[] = Object.entries(registry).map(([id, entry]) => ({ id, entry }));

  const handleDeleteAll = () => {
    if (rows.length === 0) return;
    Alert.alert(
      'Delete All Downloads',
      `Remove all ${totalCount} downloaded recordings? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: () => deleteAll(),
        },
      ],
    );
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Download',
      'Remove this recording from your device?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(id) },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow="Listen offline"
        title="Downloads"
        subtitle={totalCount > 0 ? `${totalCount} recordings · ${formatBytes(totalBytes)}` : undefined}
        right={totalCount > 0 ? (
          <TouchableOpacity
            style={styles.deleteAllBtn}
            onPress={handleDeleteAll}
            activeOpacity={0.75}
          >
            <Ionicons name="trash-outline" size={14} color={c.danger} />
            <Text style={styles.deleteAllText}>Delete All</Text>
          </TouchableOpacity>
        ) : undefined}
      />

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cloud-download-outline" size={44} color={c.link} />
          </View>
          <Text style={styles.emptyTitle}>No downloads yet</Text>
          <Text style={styles.emptyHint}>Browse categories to download lectures</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <DownloadItem
              id={item.id}
              entry={item.entry}
              recording={getById(item.id)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
        />
      )}
    </View>
  );
}

function DownloadItem({
  id,
  entry,
  recording,
  onDelete,
}: {
  id: string;
  entry: DownloadEntry;
  recording: ReturnType<ReturnType<typeof useAllRecordings>['getById']>;
  onDelete: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(recording?.type ?? '');
  const dateStr = entry.downloadedAt
    ? new Date(entry.downloadedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : '';

  return (
    <TouchableOpacity style={styles.itemRow} onPress={() => router.push(`/lecture/${id}`)} activeOpacity={0.75}>
      <TypeThumb type={recording?.type ?? ''} size={48} radius={12} />
      <View style={styles.itemInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {recording?.title ?? recording?.fullTitle ?? id}
        </Text>
        <View style={styles.itemMeta}>
          {recording?.location ? (
            <Text style={styles.itemMetaText} numberOfLines={1}>
              {recording.location}
            </Text>
          ) : null}
          {recording?.date ? (
            <Text style={styles.itemMetaText}>{recording.date.slice(0, 4)}</Text>
          ) : null}
          <Text style={[styles.itemMetaText, styles.itemSize]}>
            {formatBytes(entry.totalBytes)}
          </Text>
        </View>
        {dateStr ? (
          <Text style={styles.itemDownloadDate}>Downloaded {dateStr}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={styles.trashBtn}
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Ionicons name="trash-outline" size={18} color={c.danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.cardRaised,
  },
  title: {
    color: c.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: c.borderMuted,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: c.dangerBgDeep,
    borderWidth: 1,
    borderColor: c.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  deleteAllText: {
    color: c.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  emptyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: c.link + '1a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
  emptyHint: { color: c.textDim, fontSize: 13, fontWeight: '500' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    gap: 12,
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: c.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  itemMetaText: {
    color: c.borderMuted,
    fontSize: 12,
  },
  itemSize: {
    color: c.successDim,
    fontWeight: '600',
  },
  itemDownloadDate: {
    color: c.elevatedStrongest,
    fontSize: 11,
  },
  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.dangerBgDeep,
    flexShrink: 0,
  },
});
