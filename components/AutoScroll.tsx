import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';

/**
 * Auto-scroll for the lecture transcript: moves the page down at a constant,
 * adjustable speed, like a teleprompter. It runs while `running` is true (the
 * screen ties that to "this lecture's audio is playing"), and a finger drag
 * takes over until it is released, then scrolling carries on from there.
 */

/** Pixels per second for speed levels 1–10. */
const SPEEDS_PX = [6, 10, 14, 19, 25, 32, 40, 50, 62, 78];
const SPEED_KEY = 'autoscroll_speed_v1';
const DEFAULT_LEVEL = 4;

export function useAutoScrollSpeed() {
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  useEffect(() => {
    AsyncStorage.getItem(SPEED_KEY)
      .then(v => { const n = Number(v); if (n >= 1 && n <= SPEEDS_PX.length) setLevel(n); })
      .catch(() => {});
  }, []);
  const change = (next: number) => {
    const n = Math.max(1, Math.min(SPEEDS_PX.length, next));
    setLevel(n);
    AsyncStorage.setItem(SPEED_KEY, String(n)).catch(() => {});
  };
  return { level, setLevel: change, max: SPEEDS_PX.length };
}

/**
 * Drives the ScrollView. `scrollYRef` must be kept current by the ScrollView's
 * onScroll; `draggingRef` true while the user's finger is on it; `maxYRef` the
 * furthest the content can scroll.
 */
export function useAutoScroll(opts: {
  scrollRef: React.RefObject<ScrollView | null>;
  scrollYRef: React.MutableRefObject<number>;
  draggingRef: React.MutableRefObject<boolean>;
  maxYRef: React.MutableRefObject<number>;
  running: boolean;
  level: number;
}) {
  const { scrollRef, scrollYRef, draggingRef, maxYRef, running, level } = opts;
  const pxPerSec = SPEEDS_PX[level - 1] ?? SPEEDS_PX[DEFAULT_LEVEL - 1];
  const speedRef = useRef(pxPerSec);
  speedRef.current = pxPerSec;

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    let pos = scrollYRef.current;
    let lastSent = Math.round(pos);
    const frame = (t: number) => {
      if (last) {
        const dt = Math.min((t - last) / 1000, 0.1);
        // Finger on the page, or the page moved by something else (a search
        // jump, a resize): pick up from wherever it is now.
        if (draggingRef.current || Math.abs(scrollYRef.current - lastSent) > 4) {
          pos = scrollYRef.current;
          lastSent = Math.round(pos);
        } else {
          pos = Math.min(pos + speedRef.current * dt, Math.max(maxYRef.current, 0));
          const y = Math.round(pos);
          if (y !== lastSent) {
            lastSent = y;
            scrollRef.current?.scrollTo({ y, animated: false });
          }
        }
      }
      last = t;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running, scrollRef, scrollYRef, draggingRef, maxYRef]);
}

/** Floating − speed + ✕ control. */
export function AutoScrollControl({
  level, max, onChange, onClose, waiting, accent, bottom,
}: {
  level: number;
  max: number;
  onChange: (level: number) => void;
  onClose: () => void;
  /** On but not moving (audio paused). */
  waiting: boolean;
  accent: string;
  bottom: number;
}) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={[styles.pill, { bottom, borderColor: accent + '66' }]}>
      <Ionicons name={waiting ? 'pause' : 'arrow-down'} size={15} color={accent} style={{ marginLeft: 4 }} />
      <TouchableOpacity
        onPress={() => onChange(level - 1)}
        disabled={level <= 1}
        style={styles.btn}
        hitSlop={6}
        accessibilityLabel="Scroll slower"
      >
        <Ionicons name="remove" size={20} color={level <= 1 ? c.textFaintest : c.textSecondary} />
      </TouchableOpacity>
      <View style={styles.mid}>
        <Text style={[styles.level, { color: accent }]}>{level}</Text>
        <Text style={styles.label}>{waiting ? 'paused' : 'speed'}</Text>
      </View>
      <TouchableOpacity
        onPress={() => onChange(level + 1)}
        disabled={level >= max}
        style={styles.btn}
        hitSlop={6}
        accessibilityLabel="Scroll faster"
      >
        <Ionicons name="add" size={20} color={level >= max ? c.textFaintest : c.textSecondary} />
      </TouchableOpacity>
      <View style={styles.sep} />
      <TouchableOpacity onPress={onClose} style={styles.btn} hitSlop={6} accessibilityLabel="Stop auto-scroll">
        <Ionicons name="close" size={18} color={c.textDim} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  pill: {
    position: 'absolute', right: 14, zIndex: 30,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: 24, borderWidth: 1, backgroundColor: c.card,
    shadowColor: c.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  btn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  mid: { alignItems: 'center', minWidth: 40 },
  level: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  label: { color: c.textDim, fontSize: 9.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sep: { width: 1, height: 22, backgroundColor: c.border, marginHorizontal: 2 },
});
