import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';

interface Props {
  title: string;
  /** Small uppercase line above the title (greeting, section name). */
  eyebrow?: string;
  /** Muted line under the title (counts, sizes). */
  subtitle?: string;
  /** Buttons / pills shown on the right of the title row. */
  right?: React.ReactNode;
  /** Extra content under the title row (e.g. a settings card). */
  children?: React.ReactNode;
  /** Set false when the parent already pads for the status bar. */
  padTop?: boolean;
}

/**
 * Shared large-title header for the tab screens, so Home / Library / Search /
 * Downloads / History all line up: same type scale, same spacing, same saffron
 * accent bar beside the eyebrow.
 */
export default function ScreenHeader({
  title, eyebrow, subtitle, right, children, padTop = true,
}: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, padTop && { paddingTop: insets.top + 12 }]}>
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          {eyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowBar} />
              <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: { flex: 1, gap: 3 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  eyebrowBar: { width: 14, height: 3, borderRadius: 2, backgroundColor: c.accent },
  eyebrow: {
    color: c.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: c.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: { color: c.textDim, fontSize: 13, fontWeight: '500' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
});

/** Round outlined icon button used in headers (theme toggle etc.). */
export const headerIconBtnStyle = (c: ThemeColors) => ({
  width: 38,
  height: 38,
  borderRadius: 19,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderWidth: 1,
  borderColor: c.border,
  backgroundColor: c.card,
});
