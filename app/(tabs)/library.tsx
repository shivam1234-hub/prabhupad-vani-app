import React, { useMemo } from 'react';
import {
  FlatList, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getTypeMeta } from '../../data/types';
import { useDownload } from '../../contexts/DownloadContext';
import {
  useSettings, READER_FONT_SIZE_MIN, READER_FONT_SIZE_MAX,
} from '../../contexts/SettingsContext';
import ScreenHeader, { headerIconBtnStyle } from '../../components/ScreenHeader';
import TypeThumb, { COVERS } from '../../components/TypeThumb';
import { Desktop } from '../../components/desktop';

/**
 * Library tab: what used to be the Home screen. All categories (as cards),
 * the lecture-page text-size stepper, the downloads shortcut and the theme
 * toggle. Behaviour is unchanged; only the layout is new.
 */
function LibraryScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { categorySummary, all, counts } = useAllRecordings();
  const { totalCount } = useDownload();
  const {
    readerFontSize, increaseReaderFontSize, decreaseReaderFontSize,
  } = useSettings();
  const { isDark, toggle: toggleTheme } = useTheme();

  const atMin = readerFontSize <= READER_FONT_SIZE_MIN;
  const atMax = readerFontSize >= READER_FONT_SIZE_MAX;

  const header = (
    <ScreenHeader
      eyebrow="Lecture archive"
      title="Library"
      subtitle={`${all.length.toLocaleString()} recordings · ${categorySummary.length} collections`}
      right={
        <TouchableOpacity
          style={headerIconBtnStyle(c)}
          onPress={toggleTheme}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={c.textQuinary} />
        </TouchableOpacity>
      }
    >
      <View style={styles.toolsRow}>
        {/* Controls the text size on the lecture reading page only (title,
            details, audio player, transcript) — every other screen's text
            stays fixed, so this doesn't affect this list or its own header. */}
        <View style={styles.fontCard}>
          <View style={styles.toolIcon}>
            <Ionicons name="text" size={15} color={c.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.toolLabel}>Text size</Text>
            <Text style={styles.toolHint}>Lecture page</Text>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={decreaseReaderFontSize}
              disabled={atMin}
              style={[styles.stepBtn, atMin && styles.stepBtnDisabled]}
              accessibilityLabel="Decrease lecture text size"
            >
              <Text style={styles.stepBtnText}>A−</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{readerFontSize}</Text>
            <TouchableOpacity
              onPress={increaseReaderFontSize}
              disabled={atMax}
              style={[styles.stepBtn, atMax && styles.stepBtnDisabled]}
              accessibilityLabel="Increase lecture text size"
            >
              <Text style={styles.stepBtnText}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.downloadsCard}
          onPress={() => router.push('/downloads')}
          activeOpacity={0.75}
        >
          <Ionicons name="cloud-download" size={18} color={c.link} />
          <Text style={styles.downloadsCount}>{totalCount}</Text>
          <Text style={styles.toolHint}>offline</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Sacred texts</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.shelf}
        contentContainerStyle={styles.shelfContent}
      >
        {Object.keys(COVERS)
          .filter(type => counts[type] > 0)
          .map(type => (
            <FeaturedCover
              key={type}
              type={type}
              count={counts[type]}
              onPress={() => router.push(`/category/${type}`)}
            />
          ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>All collections</Text>
    </ScreenHeader>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={categorySummary}
        keyExtractor={item => item.type}
        numColumns={2}
        ListHeaderComponent={header}
        columnWrapperStyle={styles.columns}
        renderItem={({ item }) => (
          <CategoryCard
            type={item.type}
            count={item.count}
            onPress={() => router.push(`/category/${item.type}`)}
          />
        )}
        ListFooterComponent={
          <Text style={styles.footerText}>{all.length.toLocaleString()} recordings total</Text>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        initialNumToRender={14}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function CategoryCard({
  type, count, onPress,
}: {
  type: string;
  count: number;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(type);

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: meta.color + '33' }]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}, ${count} recordings`}
    >
      {/* Soft colour wash in the corner — gives each collection its own identity */}
      <View style={[styles.cardGlow, { backgroundColor: meta.color + '14' }]} />
      <View style={styles.cardTop}>
        <TypeThumb type={type} size={40} radius={12} />
        <View style={[styles.badge, { backgroundColor: meta.color + '1f' }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.badge}</Text>
        </View>
      </View>
      <Text style={styles.cardLabel} numberOfLines={2}>{meta.label}</Text>
      <View style={styles.cardBottom}>
        <Text style={[styles.cardCount, { color: meta.color }]}>{count.toLocaleString()}</Text>
        <Text style={styles.cardCountLabel}>recordings</Text>
        <Ionicons name="arrow-forward" size={14} color={c.textFaint} style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

function FeaturedCover({
  type, count, onPress,
}: {
  type: string;
  count: number;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(type);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.featured}
      accessibilityRole="button"
      accessibilityLabel={`${meta.label}, ${count} recordings`}
    >
      <Image source={COVERS[type]} style={styles.featuredImg} resizeMode="cover" />
      <View style={styles.featuredFooter}>
        <Text style={[styles.featuredCount, { color: meta.color }]}>{count.toLocaleString()}</Text>
        <Text style={styles.featuredCountLabel}>lectures</Text>
        <Ionicons name="arrow-forward" size={13} color={c.textFaint} style={{ marginLeft: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },

  // The shelf scrolls edge to edge, so cancel ScreenHeader's 20px side padding.
  shelf: { marginHorizontal: -20 },
  shelfContent: { paddingHorizontal: 20, gap: 12 },
  // Real BBT book covers are portrait, so show them as whole books.
  featured: { width: 132, gap: 8 },
  featuredImg: {
    width: 132, height: 198, borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.borderStrong,
  },
  featuredFooter: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 2 },
  featuredCount: { fontSize: 15, fontWeight: '800' },
  featuredCountLabel: { color: c.textDim, fontSize: 11, fontWeight: '600' },

  toolsRow: { flexDirection: 'row', gap: 10 },
  fontCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accent + '1f',
  },
  toolLabel: { color: c.textSecondary, fontSize: 13, fontWeight: '700' },
  toolHint: { color: c.textDim, fontSize: 11, fontWeight: '500' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    minWidth: 38, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.accent + '18',
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  stepValue: {
    color: c.textQuinary, fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center',
  },
  downloadsCard: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 16,
    paddingVertical: 8,
  },
  downloadsCount: { color: c.textPrimary, fontSize: 16, fontWeight: '800' },

  sectionTitle: {
    color: c.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 6,
  },

  columns: { gap: 12, paddingHorizontal: 20, marginBottom: 12 },
  card: {
    flex: 1,
    minHeight: 136,
    backgroundColor: c.card,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    overflow: 'hidden',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardGlow: {
    position: 'absolute', top: -40, right: -40,
    width: 120, height: 120, borderRadius: 60,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardLabel: { color: c.textSecondary, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  cardBottom: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  cardCount: { fontSize: 18, fontWeight: '800' },
  cardCountLabel: { color: c.textDim, fontSize: 11, fontWeight: '600' },

  footerText: {
    color: c.textFaint, fontSize: 12, fontWeight: '500',
    letterSpacing: 0.5, textAlign: 'center', paddingVertical: 20,
  },
});

// Windows desktop build (Electron over the web export): the wide-window
// layout. Phones get null here and keep the screen above unchanged.
export default function LibraryScreenRoute() {
  return Desktop ? <Desktop.Library /> : <LibraryScreen />;
}
