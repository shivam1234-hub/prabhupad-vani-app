import React, { useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Recording, getRecordingId, getTypeMeta } from '../data/types';
import { useAudioMeta } from '../contexts/AudioContext';
import { useDownload } from '../contexts/DownloadContext';
import { useLibrary } from '../contexts/LibraryContext';

interface Props {
  recording: Recording;
  onQuickPlay?: (recording: Recording) => void;
}

export default function LectureCard({ recording, onQuickPlay }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  // useAudioMeta (not useAudio) — cards in long lists must not re-render on
  // the 2 Hz position tick. This card only reads recording/isPlaying/actions.
  const audio = useAudioMeta();
  const { isDownloaded, downloadRecording, deleteDownload, progress } = useDownload();
  const { isFavourite, toggleFavourite, getTagsFor } = useLibrary();

  const meta = getTypeMeta(recording.type);
  const accent = meta.color;

  const isPlaying = audio.recording?.id === recording.id && audio.isPlaying;
  const isLoaded = audio.recording?.id === recording.id;

  const id = getRecordingId(recording);
  const downloaded = isDownloaded(id);
  const dlProgress = progress[id];
  const isDownloading = dlProgress != null && dlProgress.status !== 'error';
  const favourite = isFavourite(id);
  const tags = getTagsFor(id).slice(0, 3);

  const formattedDate = (() => {
    if (!recording.date) return '';
    const d = new Date(recording.date + 'T00:00:00');
    if (isNaN(d.getTime())) return recording.date;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  })();

  const handlePress = () => router.push(`/lecture/${recording.id}`);

  const handlePlay = () => {
    if (isLoaded) {
      if (isPlaying) audio.pause();
      else audio.resume();
    } else {
      onQuickPlay?.(recording);
    }
  };

  const handleDownloadPress = () => {
    if (!downloaded && !isDownloading) {
      downloadRecording(id, recording.vanisourceUrl);
    }
  };

  const handleDownloadLongPress = () => {
    if (downloaded) {
      Alert.alert(
        'Delete Download',
        'Remove the offline copy of this recording?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => deleteDownload(id) },
        ],
      );
    }
  };

  const renderDownloadIcon = () => {
    if (isDownloading) {
      return <ActivityIndicator size="small" color={c.textPrimary} />;
    }
    if (downloaded) {
      return <Ionicons name="checkmark-circle" size={16} color={c.success} />;
    }
    return <Ionicons name="cloud-download-outline" size={16} color={c.textDimmer} />;
  };

  return (
    <Pressable onPress={handlePress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: accent + '20' }]}>
            <Text style={[styles.badgeText, { color: accent }]}>
              {meta.badge}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>{recording.title}</Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={12} color={c.textDim} />
            <Text style={styles.metaText}>{recording.location}</Text>
          </View>
          <View style={styles.metaDot} />
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={12} color={c.textDim} />
            <Text style={styles.metaText}>{formattedDate}</Text>
          </View>
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map(tag => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => toggleFavourite(id)}
        hitSlop={8}
        style={styles.iconBtn}
      >
        <Ionicons
          name={favourite ? 'heart' : 'heart-outline'}
          size={16}
          color={favourite ? c.danger : c.textFaint}
        />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleDownloadPress}
        onLongPress={handleDownloadLongPress}
        hitSlop={8}
        style={styles.iconBtn}
      >
        {renderDownloadIcon()}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handlePlay}
        hitSlop={8}
        style={[
          styles.playBtn,
          isLoaded && { backgroundColor: accent + '22', borderColor: accent },
        ]}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={15}
          color={isLoaded ? accent : c.textDimmer}
        />
      </TouchableOpacity>
    </Pressable>
  );
}

// Named export kept for backwards compat with any existing imports
export { LectureCard };

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },
  pressed: { opacity: 0.75 },
  accentBar: { width: 3, alignSelf: 'stretch' },
  content: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  title: { color: c.textTertiary, fontSize: 15, fontWeight: '600', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: c.textDim, fontSize: 12 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.textFaint },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  tagChip: {
    backgroundColor: '#FF772218', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 5, borderWidth: 1, borderColor: '#FF772230',
  },
  tagText: { color: '#FF7722', fontSize: 10, fontWeight: '600' },
  playBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, borderWidth: 1, borderColor: c.borderStrong,
  },
});
