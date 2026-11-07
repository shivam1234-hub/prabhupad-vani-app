import React, { useState, useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchFilters } from '../hooks/useLectures';

interface Props {
  visible: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  locations: string[];
  years: number[];
}

export default function FilterPanel({ visible, onClose, filters, onApply, locations, years }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [draft, setDraft] = useState<SearchFilters>(filters);

  const set = <K extends keyof SearchFilters>(key: K, val: SearchFilters[K]) =>
    setDraft(prev => ({ ...prev, [key]: val }));

  const handleApply = () => { onApply(draft); onClose(); };
  const handleClear = () => {
    const cleared: SearchFilters = {
      query: filters.query,
      type: 'All', location: '', yearFrom: null, yearTo: null, chapterPrefix: '',
    };
    setDraft(cleared);
    onApply(cleared);
    onClose();
  };

  const activeCount = [
    draft.type !== 'All', draft.location, draft.yearFrom, draft.yearTo, draft.chapterPrefix,
  ].filter(Boolean).length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={c.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Type */}
          <Text style={styles.sectionLabel}>Scripture</Text>
          <View style={styles.chipRow}>
            {(['All', 'Bhagavad-gita', 'Srimad-Bhagavatam'] as const).map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, draft.type === type && styles.chipActive]}
                onPress={() => set('type', type)}
              >
                <Text style={[styles.chipText, draft.type === type && styles.chipTextActive]}>
                  {type === 'Bhagavad-gita' ? 'BG' : type === 'Srimad-Bhagavatam' ? 'SB' : 'All'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Year From */}
          <Text style={styles.sectionLabel}>From Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearScroll}>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !draft.yearFrom && styles.chipActive]}
                onPress={() => set('yearFrom', null)}
              >
                <Text style={[styles.chipText, !draft.yearFrom && styles.chipTextActive]}>Any</Text>
              </TouchableOpacity>
              {years.map(y => (
                <TouchableOpacity
                  key={y}
                  style={[styles.chip, draft.yearFrom === y && styles.chipActive]}
                  onPress={() => set('yearFrom', y)}
                >
                  <Text style={[styles.chipText, draft.yearFrom === y && styles.chipTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Year To */}
          <Text style={styles.sectionLabel}>To Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearScroll}>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !draft.yearTo && styles.chipActive]}
                onPress={() => set('yearTo', null)}
              >
                <Text style={[styles.chipText, !draft.yearTo && styles.chipTextActive]}>Any</Text>
              </TouchableOpacity>
              {years.map(y => (
                <TouchableOpacity
                  key={y}
                  style={[styles.chip, draft.yearTo === y && styles.chipActive]}
                  onPress={() => set('yearTo', y)}
                >
                  <Text style={[styles.chipText, draft.yearTo === y && styles.chipTextActive]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Location */}
          <Text style={styles.sectionLabel}>Location</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearScroll}>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !draft.location && styles.chipActive]}
                onPress={() => set('location', '')}
              >
                <Text style={[styles.chipText, !draft.location && styles.chipTextActive]}>Any</Text>
              </TouchableOpacity>
              {locations.slice(0, 40).map(loc => (
                <TouchableOpacity
                  key={loc}
                  style={[styles.chip, draft.location === loc && styles.chipActive]}
                  onPress={() => set('location', loc)}
                >
                  <Text style={[styles.chipText, draft.location === loc && styles.chipTextActive]}>{loc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearText}>Clear All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
            <Text style={styles.applyText}>
              Apply{activeCount > 0 ? ` (${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ACCENT = '#FF7722';

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: c.cardAlt, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', paddingBottom: 0,
  },
  handle: {
    width: 40, height: 4, backgroundColor: c.textFaintest, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: c.elevated,
  },
  headerTitle: { color: c.textTertiary, fontSize: 17, fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  sectionLabel: { color: c.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, marginTop: 16, textTransform: 'uppercase' },
  yearScroll: { marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.border,
  },
  chipActive: { backgroundColor: ACCENT + '22', borderColor: ACCENT },
  chipText: { color: c.textMuted, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: ACCENT, fontWeight: '700' },
  footer: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderTopWidth: 1, borderTopColor: c.elevated,
  },
  clearBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    borderWidth: 1, borderColor: c.textFaintest, alignItems: 'center',
  },
  clearText: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
  applyBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    backgroundColor: ACCENT, alignItems: 'center',
  },
  applyText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
});
