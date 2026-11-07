import React, { useMemo } from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useThemeColors } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme/palette';
import { useHistory, HistoryEntry } from '../../contexts/HistoryContext';
import { useAudioMeta, useAudioPosition } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getTypeMeta, Recording } from '../../data/types';
import { formatMs, formatRelativeTime } from '../../utils/time';
import ScreenHeader, { headerIconBtnStyle } from '../../components/ScreenHeader';
import TypeThumb from '../../components/TypeThumb';

// Same thresholds as WatchBadge, so "in progress" means the same thing on
// every screen.
const COMPLETED_RATIO = 0.92;
const MIN_RESUMABLE_MS = 5000;
const RECENT_LIMIT = 8;
const CONTINUE_LIMIT = 10;

function ratioOf(e: HistoryEntry) {
  return e.durationMs > 0 ? e.positionMs / e.durationMs : 0;
}
function isInProgress(e: HistoryEntry) {
  return e.positionMs >= MIN_RESUMABLE_MS && ratioOf(e) < COMPLETED_RATIO;
}
function isCompleted(e: HistoryEntry) {
  return e.positionMs >= MIN_RESUMABLE_MS && ratioOf(e) >= COMPLETED_RATIO;
}
function openEntry(e: HistoryEntry) {
  const params = isInProgress(e) ? `?resume=${e.positionMs}` : '';
  router.push(`/lecture/${e.id}${params}` as any);
}
function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Hare Krishna · Good night';
  if (h < 12) return 'Hare Krishna · Good morning';
  if (h < 17) return 'Hare Krishna · Good afternoon';
  return 'Hare Krishna · Good evening';
}

/**
 * Home tab: what you were listening to. The currently playing lecture (live),
 * unfinished lectures to resume, and recently played ones. Everything comes
 * from HistoryContext, which already records position every 5 s.
 * Categories moved to the Library tab.
 */
export default function HomeScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { isDark, toggle: toggleTheme } = useTheme();
  const { history } = useHistory();
  const { totalCount } = useDownload();
  const { getById } = useAllRecordings();
  const audio = useAudioMeta();

  const nowId = audio.lecture ? (audio.lecture.pvId ?? audio.lecture.id) : null;

  const { inProgress, completedCount } = useMemo(() => ({
    inProgress: history.filter(isInProgress),
    completedCount: history.filter(isCompleted).length,
  }), [history]);

  // Hero: the live player if something is loaded, else the newest unfinished
  // lecture from any day (so an older one is still one tap away).
  const resumeHero = !audio.lecture ? inProgress[0] : undefined;
  // "Continue listening" is today's unfinished lectures only (user request).
  const todayInProgress = inProgress.filter(e => isToday(e.playedAt));
  const continueList = todayInProgress
    .filter(e => e.id !== nowId && e !== resumeHero)
    .slice(0, CONTINUE_LIMIT);
  // "Recently played" = everything not already shown above, so nothing repeats.
  const shown = new Set([nowId, resumeHero?.id, ...continueList.map(e => e.id)]);
  const recentList = history.filter(e => !shown.has(e.id)).slice(0, RECENT_LIMIT);
  const isEmpty = history.length === 0 && !audio.lecture;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          eyebrow={greeting()}
          title="Prabhupada Vani"
          subtitle="Your listening"
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
        />

        {audio.lecture ? (
          <NowPlayingCard />
        ) : resumeHero ? (
          <ResumeHeroCard entry={resumeHero} recording={getById(resumeHero.id)} />
        ) : null}

        {!isEmpty && (
          <View style={styles.statsRow}>
            <StatTile icon="hourglass-outline" value={inProgress.length} label="In progress" color={c.accent} />
            <StatTile icon="checkmark-done" value={completedCount} label="Completed" color={c.success} />
            <StatTile
              icon="cloud-download-outline" value={totalCount} label="Offline" color={c.link}
              onPress={() => router.push('/downloads')}
            />
          </View>
        )}

        {continueList.length > 0 && (
          <Section title="Continue listening" tag="Today" count={continueList.length}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {continueList.map(e => (
                <ContinueCard key={e.id} entry={e} recording={getById(e.id)} />
              ))}
            </ScrollView>
          </Section>
        )}

        {recentList.length > 0 && (
          <Section
            title="Recently played"
            action="See all"
            onAction={() => router.push('/history')}
          >
            <View style={styles.listCard}>
              {recentList.map((e, i) => (
                <RecentRow
                  key={e.id}
                  entry={e}
                  recording={getById(e.id)}
                  last={i === recentList.length - 1}
                />
              ))}
            </View>
          </Section>
        )}

        {isEmpty && <EmptyWelcome />}

        {!isEmpty && (
          <View style={styles.exploreRow}>
            <ExploreButton icon="library-outline" label="Browse library" onPress={() => router.push('/library')} />
            <ExploreButton icon="search-outline" label="Search lectures" onPress={() => router.push('/browse')} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Hero cards ──────────────────────────────────────────────────────────────

function NowPlayingCard() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const audio = useAudioMeta();
  const lec = audio.lecture!;
  const meta = getTypeMeta(lec.type);

  const togglePlay = () => {
    if (audio.isPlaying) audio.pause();
    else audio.resume();
  };

  return (
    <TouchableOpacity
      style={[styles.hero, { borderColor: meta.color + '55' }]}
      onPress={() => router.push(`/lecture/${lec.id}`)}
      activeOpacity={0.85}
    >
      <View style={[styles.heroGlow, { backgroundColor: meta.color + '14' }]} />
      <View style={[styles.heroGlow2, { backgroundColor: meta.color + '0a' }]} />
      <View style={styles.heroLabelRow}>
        <View style={[styles.liveDot, { backgroundColor: audio.isPlaying ? c.success : c.textFaint }]} />
        <Text style={styles.heroLabel}>{audio.isPlaying ? 'Now playing' : 'Paused'}</Text>
        <View style={[styles.heroBadge, { backgroundColor: meta.color + '26' }]}>
          <Text style={[styles.heroBadgeText, { color: meta.color }]}>{meta.badge}</Text>
        </View>
      </View>
      <View style={styles.heroMain}>
        <TypeThumb type={lec.type} size={76} radius={16} />
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} numberOfLines={3}>{lec.title}</Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {[lec.location, lec.year].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <View style={styles.heroBottom}>
        <View style={{ flex: 1 }}>
          <LiveProgress color={meta.color} />
        </View>
        <TouchableOpacity
          onPress={togglePlay}
          style={[styles.heroPlay, { backgroundColor: meta.color }]}
          accessibilityLabel={audio.isPlaying ? 'Pause' : 'Play'}
        >
          <Ionicons
            name={audio.isPlaying ? 'pause' : 'play'}
            size={24}
            color={c.onAccent}
            style={!audio.isPlaying && { marginLeft: 3 }}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// Only this leaf subscribes to the 2 Hz position tick, so the hero's buttons
// never re-render under a touch (same split as MiniPlayer).
function LiveProgress({ color }: { color: string }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { positionMs, durationMs } = useAudioPosition();
  const pct = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.heroTrack}>
        <View style={[styles.heroFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
      </View>
      <View style={styles.heroTimes}>
        <Text style={styles.heroTime}>{formatMs(positionMs)}</Text>
        <Text style={styles.heroTime}>
          {durationMs > 0 ? `−${formatMs(Math.max(durationMs - positionMs, 0))}` : ''}
        </Text>
      </View>
    </View>
  );
}

function ResumeHeroCard({ entry, recording }: { entry: HistoryEntry; recording?: Recording }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(entry.type);
  const pct = Math.min(ratioOf(entry), 0.99);
  const remaining = entry.durationMs > 0 ? entry.durationMs - entry.positionMs : 0;

  return (
    <TouchableOpacity
      style={[styles.hero, { borderColor: meta.color + '55' }]}
      onPress={() => openEntry(entry)}
      activeOpacity={0.85}
    >
      <View style={[styles.heroGlow, { backgroundColor: meta.color + '14' }]} />
      <View style={[styles.heroGlow2, { backgroundColor: meta.color + '0a' }]} />
      <View style={styles.heroLabelRow}>
        <Ionicons name="play-back-circle-outline" size={14} color={c.accent} />
        <Text style={styles.heroLabel}>Pick up where you left off</Text>
        <View style={[styles.heroBadge, { backgroundColor: meta.color + '26' }]}>
          <Text style={[styles.heroBadgeText, { color: meta.color }]}>{meta.badge}</Text>
        </View>
      </View>
      <View style={styles.heroMain}>
        <TypeThumb type={entry.type} size={76} radius={16} />
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} numberOfLines={3}>{entry.title}</Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {[recording?.location, recording?.year, formatRelativeTime(entry.playedAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <View style={styles.heroBottom}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={styles.heroTrack}>
            <View style={[styles.heroFill, { width: `${pct * 100}%` as any, backgroundColor: meta.color }]} />
          </View>
          <View style={styles.heroTimes}>
            <Text style={styles.heroTime}>{formatMs(entry.positionMs)}</Text>
            <Text style={styles.heroTime}>{remaining > 0 ? `${formatMs(remaining)} left` : ''}</Text>
          </View>
        </View>
        <View style={[styles.heroPlay, { backgroundColor: meta.color }]}>
          <Ionicons name="play" size={24} color={c.onAccent} style={{ marginLeft: 3 }} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function Section({
  title, tag, count, action, onAction, children,
}: {
  title: string;
  tag?: string;
  count?: number;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {tag ? <Text style={styles.sectionTag}>{tag}</Text> : null}
        {count != null && count > 0 ? (
          <View style={styles.sectionCount}>
            <Text style={styles.sectionCountText}>{count}</Text>
          </View>
        ) : null}
        {action ? (
          <TouchableOpacity onPress={onAction} hitSlop={10} style={styles.sectionAction}>
            <Text style={styles.sectionActionText}>{action}</Text>
            <Ionicons name="chevron-forward" size={14} color={c.accent} />
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ContinueCard({ entry, recording }: { entry: HistoryEntry; recording?: Recording }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(entry.type);
  const pct = Math.min(ratioOf(entry), 0.99);
  const remaining = entry.durationMs > 0 ? entry.durationMs - entry.positionMs : 0;

  return (
    <TouchableOpacity style={styles.contCard} onPress={() => openEntry(entry)} activeOpacity={0.8}>
      <View style={styles.contTop}>
        <TypeThumb type={entry.type} size={40} radius={11} />
        <Text style={[styles.contBadge, { color: meta.color }]}>{meta.badge}</Text>
        <View style={[styles.contPlay, { borderColor: meta.color + '66' }]}>
          <Ionicons name="play" size={13} color={meta.color} style={{ marginLeft: 2 }} />
        </View>
      </View>
      <Text style={styles.contTitle} numberOfLines={2}>{entry.title}</Text>
      <Text style={styles.contMeta} numberOfLines={1}>
        {[recording?.location, recording?.year].filter(Boolean).join(' · ') || formatRelativeTime(entry.playedAt)}
      </Text>
      <View style={styles.contTrack}>
        <View style={[styles.contFill, { width: `${pct * 100}%` as any, backgroundColor: meta.color }]} />
      </View>
      <Text style={styles.contLeft}>
        {remaining > 0 ? `${formatMs(remaining)} left` : `At ${formatMs(entry.positionMs)}`}
      </Text>
    </TouchableOpacity>
  );
}

function RecentRow({ entry, recording, last }: { entry: HistoryEntry; recording?: Recording; last: boolean }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const meta = getTypeMeta(entry.type);
  const done = isCompleted(entry);

  return (
    <TouchableOpacity
      style={[styles.recentRow, !last && styles.recentDivider]}
      onPress={() => openEntry(entry)}
      activeOpacity={0.75}
    >
      <TypeThumb type={entry.type} size={44} radius={12} showBadge />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.recentTitle} numberOfLines={1}>{entry.title}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>
          {[recording?.location, formatRelativeTime(entry.playedAt)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {done ? (
        <Ionicons name="checkmark-circle" size={20} color={c.success} />
      ) : (
        <Ionicons name="play-circle-outline" size={22} color={c.textFaint} />
      )}
    </TouchableOpacity>
  );
}

function StatTile({
  icon, value, label, color, onPress,
}: {
  icon: string; value: number; label: string; color: string; onPress?: () => void;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress} disabled={!onPress} activeOpacity={0.75}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ExploreButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <TouchableOpacity style={styles.exploreBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon as any} size={18} color={c.accent} />
      <Text style={styles.exploreText}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyWelcome() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.welcome}>
      <View style={styles.welcomeIcon}>
        <Ionicons name="headset" size={34} color={c.accent} />
      </View>
      <Text style={styles.welcomeTitle}>Start listening</Text>
      <Text style={styles.welcomeText}>
        Lectures you play will appear here, so you can pick up exactly where you left off.
      </Text>
      <TouchableOpacity style={styles.welcomePrimary} onPress={() => router.push('/library')} activeOpacity={0.85}>
        <Ionicons name="library" size={17} color={c.onAccent} />
        <Text style={styles.welcomePrimaryText}>Browse the library</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.welcomeSecondary} onPress={() => router.push('/browse')} activeOpacity={0.8}>
        <Ionicons name="search" size={16} color={c.accent} />
        <Text style={styles.welcomeSecondaryText}>Search lectures</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bg },

  // Hero
  hero: {
    marginHorizontal: 20,
    marginTop: 4,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: c.card,
    overflow: 'hidden',
    gap: 6,
  },
  heroGlow: {
    position: 'absolute', top: -70, right: -50,
    width: 200, height: 200, borderRadius: 100,
  },
  heroGlow2: {
    position: 'absolute', bottom: -90, left: -60,
    width: 180, height: 180, borderRadius: 90,
  },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 4 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  heroLabel: {
    flex: 1, color: c.textMuted, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.1, textTransform: 'uppercase',
  },
  heroBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  heroBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroText: { flex: 1, gap: 4 },
  heroTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  heroMeta: { color: c.textDim, fontSize: 13, fontWeight: '500' },
  heroBottom: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  heroTrack: { height: 5, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' },
  heroFill: { height: 5, borderRadius: 3 },
  heroTimes: { flexDirection: 'row', justifyContent: 'space-between' },
  heroTime: { color: c.textDim, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  heroPlay: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: c.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 16 },
  stat: {
    flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  statValue: { color: c.textPrimary, fontSize: 20, fontWeight: '800', marginTop: 4 },
  statLabel: { color: c.textDim, fontSize: 11, fontWeight: '600' },

  // Sections
  section: { marginTop: 26, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  sectionTitle: { color: c.textPrimary, fontSize: 18, fontWeight: '800' },
  sectionTag: { color: c.textDim, fontSize: 13, fontWeight: '600' },
  sectionCount: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: c.accent + '22',
  },
  sectionCountText: { color: c.accent, fontSize: 11, fontWeight: '800' },
  sectionAction: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { color: c.accent, fontSize: 13, fontWeight: '700' },

  // Continue cards (horizontal)
  hScroll: { paddingHorizontal: 20, gap: 12 },
  contCard: {
    width: 220, padding: 14, gap: 6,
    borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  contTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  contBadge: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  contPlay: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  contTitle: { color: c.textSecondary, fontSize: 14, fontWeight: '700', lineHeight: 19, minHeight: 38 },
  contMeta: { color: c.textDim, fontSize: 12 },
  contTrack: { height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden', marginTop: 6 },
  contFill: { height: 4, borderRadius: 2 },
  contLeft: { color: c.textMuted, fontSize: 11, fontWeight: '600' },

  // Recent list
  listCard: {
    marginHorizontal: 20, borderRadius: 18, borderWidth: 1,
    borderColor: c.border, backgroundColor: c.card, overflow: 'hidden',
  },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  recentDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
  recentTitle: { color: c.textSecondary, fontSize: 14, fontWeight: '700' },
  recentMeta: { color: c.textDim, fontSize: 12 },

  // Explore
  exploreRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 24 },
  exploreBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 16, borderWidth: 1,
    borderColor: c.accent + '40', backgroundColor: c.accent + '10',
  },
  exploreText: { color: c.accent, fontSize: 14, fontWeight: '700' },

  // Empty
  welcome: {
    marginHorizontal: 20, marginTop: 12, padding: 24, alignItems: 'center', gap: 10,
    borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  welcomeIcon: {
    width: 76, height: 76, borderRadius: 38, marginBottom: 6,
    alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent + '1a',
  },
  welcomeTitle: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
  welcomeText: { color: c.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 8 },
  welcomePrimary: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14, backgroundColor: c.accent,
  },
  welcomePrimaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
  welcomeSecondary: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: c.accent + '50',
  },
  welcomeSecondaryText: { color: c.accent, fontSize: 14, fontWeight: '700' },
});
