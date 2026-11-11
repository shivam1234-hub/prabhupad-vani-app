import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import { useAllRecordings } from '../hooks/useAllRecordings';
import { getTypeMeta, Recording, TYPE_META } from '../data/types';
import { durationSec, formatDuration } from '../utils/durations';
import TypeThumb from '../components/TypeThumb';
import { Desktop } from '../components/desktop';

/**
 * "Find by length": type how many minutes you have, get the lectures closest
 * to that length, grouped by collection (BG, SB, CC, …).
 */

const QUICK = [10, 20, 30, 45, 60, 90];
const WINDOWS = [2, 5, 10];
const PER_SECTION = 5;
// Collections in the app's usual order; anything unknown goes last.
const TYPE_ORDER = Object.keys(TYPE_META);

interface Hit { rec: Recording; sec: number; diff: number }

function ByLengthScreen() {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const { all } = useAllRecordings();

  const [text, setText] = useState('');
  const [windowMin, setWindowMin] = useState(5);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const minutes = Number(text.replace(',', '.'));
  const valid = text.trim() !== '' && minutes > 0 && minutes < 1000;

  // Every recording with a known length, measured once.
  const timed = useMemo(() => {
    const out: { rec: Recording; sec: number }[] = [];
    for (const rec of all) {
      const sec = durationSec(rec);
      if (sec && sec > 30) out.push({ rec, sec });
    }
    return out;
  }, [all]);

  const { groups, totalHits, nearest } = useMemo(() => {
    if (!valid) return { groups: [] as [string, Hit[]][], totalHits: 0, nearest: [] as Hit[] };
    const target = minutes * 60;
    const win = windowMin * 60;
    const scored: Hit[] = timed.map(t => ({ ...t, diff: t.sec - target }));
    const within = scored.filter(h => Math.abs(h.diff) <= win);
    const byType = new Map<string, Hit[]>();
    for (const h of within) {
      const list = byType.get(h.rec.type) ?? [];
      list.push(h);
      byType.set(h.rec.type, list);
    }
    for (const list of byType.values()) list.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
    const rank = (t: string) => { const i = TYPE_ORDER.indexOf(t); return i === -1 ? 999 : i; };
    const g = [...byType.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
    // Nothing in the window: still offer the closest few.
    const near = within.length
      ? []
      : [...scored].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff)).slice(0, 10);
    return { groups: g, totalHits: within.length, nearest: near };
  }, [valid, minutes, windowMin, timed]);

  // The chosen collection has nothing at this length any more: drop the filter.
  const filterStale = !!typeFilter && !groups.some(([t]) => t === typeFilter);
  useEffect(() => { if (filterStale) setTypeFilter(null); }, [filterStale]);
  const shownGroups = typeFilter && !filterStale ? groups.filter(([t]) => t === typeFilter) : groups;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Find by length', headerBackTitle: 'Back' }} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.inputCard}>
          <Text style={styles.prompt}>How many minutes do you have?</Text>
          <View style={styles.inputRow}>
            <Ionicons name="time-outline" size={26} color={c.accent} />
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={t => { setText(t.replace(/[^0-9.,]/g, '')); setExpanded({}); }}
              placeholder="30"
              placeholderTextColor={c.textFaint}
              keyboardType="number-pad"
              returnKeyType="search"
              maxLength={4}
              autoFocus
            />
            <Text style={styles.unit}>minutes</Text>
          </View>
          <View style={styles.chips}>
            {QUICK.map(q => {
              const on = valid && minutes === q;
              return (
                <TouchableOpacity
                  key={q}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => { setText(String(q)); setExpanded({}); Keyboard.dismiss(); }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{q} min</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.windowRow}>
            <Text style={styles.windowLabel}>Within</Text>
            {WINDOWS.map(w => (
              <TouchableOpacity
                key={w}
                style={[styles.windowBtn, windowMin === w && styles.windowBtnOn]}
                onPress={() => setWindowMin(w)}
              >
                <Text style={[styles.windowText, windowMin === w && styles.chipTextOn]}>±{w} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {!valid && (
          <Text style={styles.hint}>
            Type a length or pick one above. Lectures closest to it are listed first, grouped by
            Bhagavad-gita, Srimad-Bhagavatam, Caitanya-caritamrta and the rest.
          </Text>
        )}

        {valid && totalHits > 0 && (
          <>
            <Text style={styles.summary}>
              {totalHits.toLocaleString('en-IN')} lectures between {Math.max(minutes - windowMin, 0)} and {minutes + windowMin} minutes
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                style={[styles.filter, !typeFilter && styles.chipOn]}
                onPress={() => setTypeFilter(null)}
              >
                <Text style={[styles.chipText, !typeFilter && styles.chipTextOn]}>All {totalHits}</Text>
              </TouchableOpacity>
              {groups.map(([type, hits]) => {
                const meta = getTypeMeta(type);
                const on = typeFilter === type;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.filter, on && { backgroundColor: meta.color + '22', borderColor: meta.color }]}
                    onPress={() => setTypeFilter(on ? null : type)}
                  >
                    <Text style={[styles.chipText, { color: on ? meta.color : c.textMuted }]}>
                      {meta.badge} {hits.length}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {shownGroups.map(([type, hits]) => {
              const meta = getTypeMeta(type);
              const open = expanded[type] || !!typeFilter;
              const list = open ? hits : hits.slice(0, PER_SECTION);
              return (
                <View key={type} style={styles.section}>
                  <View style={styles.sectionHead}>
                    <View style={[styles.sectionBadge, { backgroundColor: meta.color + '22' }]}>
                      <Text style={[styles.sectionBadgeText, { color: meta.color }]}>{meta.badge}</Text>
                    </View>
                    <Text style={styles.sectionTitle} numberOfLines={1}>{meta.label}</Text>
                    <Text style={styles.sectionCount}>{hits.length}</Text>
                  </View>
                  <View style={styles.listCard}>
                    {list.map((h, i) => (
                      <HitRow key={h.rec.id} hit={h} last={i === list.length - 1} />
                    ))}
                  </View>
                  {hits.length > PER_SECTION && !typeFilter && (
                    <TouchableOpacity
                      style={styles.more}
                      onPress={() => setExpanded(e => ({ ...e, [type]: !open }))}
                    >
                      <Text style={[styles.moreText, { color: meta.color }]}>
                        {open ? 'Show fewer' : `Show all ${hits.length}`}
                      </Text>
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={meta.color} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}

        {valid && totalHits === 0 && (
          <>
            <Text style={styles.summary}>
              Nothing within ±{windowMin} min of {minutes} minutes. Closest lectures:
            </Text>
            <View style={[styles.listCard, { marginTop: 4 }]}>
              {nearest.map((h, i) => (
                <HitRow key={h.rec.id} hit={h} last={i === nearest.length - 1} showType />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function HitRow({ hit, last, showType }: { hit: Hit; last: boolean; showType?: boolean }) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { rec, sec, diff } = hit;
  const meta = getTypeMeta(rec.type);
  const dm = Math.round(diff / 60);
  const diffText = dm === 0 ? 'exact' : dm > 0 ? `+${dm} min` : `−${-dm} min`;
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivider]}
      onPress={() => router.push(`/lecture/${rec.pvId ?? rec.id}` as any)}
      activeOpacity={0.75}
    >
      <TypeThumb type={rec.type} size={40} radius={10} showBadge={showType} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{rec.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[showType ? meta.badge : null, rec.location, rec.year].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[styles.rowDur, { color: meta.color }]}>{formatDuration(sec)}</Text>
        <Text style={styles.rowDiff}>{diffText}</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  inputCard: {
    margin: 16, padding: 16, gap: 12,
    borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.card,
  },
  prompt: { color: c.textSecondary, fontSize: 15, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, height: 60, borderRadius: 14,
    borderWidth: 1.5, borderColor: c.accent + '66', backgroundColor: c.bg,
  },
  input: { flex: 1, color: c.textPrimary, fontSize: 28, fontWeight: '800', padding: 0 },
  unit: { color: c.textDim, fontSize: 15, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: c.borderStrong,
  },
  chipOn: { backgroundColor: c.accent + '22', borderColor: c.accent },
  chipText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: c.accent },
  windowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  windowLabel: { color: c.textDim, fontSize: 13, fontWeight: '600', marginRight: 2 },
  windowBtn: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    borderWidth: 1, borderColor: c.border,
  },
  windowBtnOn: { backgroundColor: c.accent + '22', borderColor: c.accent },
  windowText: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
  hint: { color: c.textDim, fontSize: 14, lineHeight: 20, marginHorizontal: 20 },
  summary: { color: c.textDim, fontSize: 13, fontWeight: '600', marginHorizontal: 20, marginBottom: 8 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  filter: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: c.borderStrong,
  },
  section: { marginTop: 18, gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  sectionBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  sectionBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  sectionTitle: { flex: 1, color: c.textPrimary, fontSize: 16, fontWeight: '800' },
  sectionCount: { color: c.textDim, fontSize: 13, fontWeight: '700' },
  listCard: {
    marginHorizontal: 16, borderRadius: 16, borderWidth: 1,
    borderColor: c.border, backgroundColor: c.card, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
  rowTitle: { color: c.textSecondary, fontSize: 14, fontWeight: '700' },
  rowMeta: { color: c.textDim, fontSize: 12 },
  rowDur: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rowDiff: { color: c.textDim, fontSize: 11, fontWeight: '600' },
  more: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 12,
  },
  moreText: { fontSize: 13, fontWeight: '700' },
});

// Windows desktop build (Electron over the web export): the wide-window
// layout. Phones get null here and keep the screen above unchanged.
export default function ByLengthScreenRoute() {
  return Desktop ? <Desktop.ByLength /> : <ByLengthScreen />;
}
