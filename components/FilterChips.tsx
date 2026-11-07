import React, { useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Chip {
  label: string;
  value: string;
}

interface Props {
  chips: Chip[];
  selected: string;
  onSelect: (value: string) => void;
  activeColor?: string;
}

export function FilterChips({ chips, selected, onSelect, activeColor = '#FF7722' }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {chips.map(chip => {
        const isActive = chip.value === selected;
        return (
          <TouchableOpacity
            key={chip.value}
            style={[
              styles.chip,
              isActive && { backgroundColor: activeColor + '22', borderColor: activeColor },
            ]}
            onPress={() => onSelect(chip.value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, isActive && { color: activeColor }]}>
              {chip.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.textFaintest,
    backgroundColor: c.cardAccent,
    marginRight: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: c.textMuted,
  },
});
