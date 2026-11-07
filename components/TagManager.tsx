import React, { useState, useMemo } from 'react';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme/palette';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLibrary } from '../contexts/LibraryContext';
import { useSettings } from '../contexts/SettingsContext';

interface Props {
  recordingId: string;
  visible: boolean;
  onClose: () => void;
}

const ACCENT = '#FF7722';

export default function TagManager({ recordingId, visible, onClose }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { addTag, removeTag, getTagsFor, allTags } = useLibrary();
  const { readerFontScale: fontScale } = useSettings();
  const [input, setInput] = useState('');

  const currentTags = getTagsFor(recordingId);

  function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (currentTags.includes(trimmed)) {
      setInput('');
      return;
    }
    addTag(recordingId, trimmed);
    setInput('');
  }

  function handleQuickToggle(tag: string) {
    if (currentTags.includes(tag)) {
      removeTag(recordingId, tag);
    } else {
      addTag(recordingId, tag);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kavWrapper}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />

            <View style={styles.titleRow}>
              <Text style={[styles.title, { fontSize: 18 * fontScale }]}>Tags</Text>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={c.textAaa} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <Text style={[styles.sectionLabel, { fontSize: 12 * fontScale }]}>Current tags</Text>
              {currentTags.length === 0 ? (
                <Text style={[styles.emptyText, { fontSize: 14 * fontScale }]}>No tags yet</Text>
              ) : (
                <View style={styles.chipRow}>
                  {currentTags.map(tag => (
                    <View key={tag} style={[styles.chip, styles.chipApplied]}>
                      <Text style={[styles.chipText, { fontSize: 13 * fontScale }, styles.chipTextApplied]}>{tag}</Text>
                      <TouchableOpacity
                        onPress={() => removeTag(recordingId, tag)}
                        hitSlop={8}
                        style={styles.chipRemove}
                      >
                        <Ionicons name="close" size={13} color={ACCENT} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[[styles.sectionLabel, { fontSize: 12 * fontScale }], { marginTop: 20 }]}>Add tag</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, { fontSize: 14 * fontScale }]}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Type a tag..."
                  placeholderTextColor={c.textDimmer}
                  onSubmitEditing={handleAdd}
                  returnKeyType="done"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.addBtn, !input.trim() && styles.addBtnDisabled]}
                  onPress={handleAdd}
                  disabled={!input.trim()}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.addBtnText, { fontSize: 14 * fontScale }]}>Add</Text>
                </TouchableOpacity>
              </View>

              {allTags.length > 0 && (
                <>
                  <Text style={[[styles.sectionLabel, { fontSize: 12 * fontScale }], { marginTop: 20 }]}>Your tags</Text>
                  <View style={styles.chipRow}>
                    {allTags.map(tag => {
                      const applied = currentTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[styles.chip, applied && styles.chipApplied]}
                          onPress={() => handleQuickToggle(tag)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.chipText, { fontSize: 13 * fontScale }, applied && styles.chipTextApplied]}>
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  kavWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: c.surfaceAlt3,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    marginTop: 10,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    marginBottom: 16,
  },
  title: {
    color: c.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 2,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionLabel: {
    color: c.textMutedBlue2,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  emptyText: {
    color: c.textDimmer,
    fontSize: 14,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 5,
  },
  chipApplied: {
    backgroundColor: ACCENT + '33',
  },
  chipText: {
    color: c.textAaa,
    fontSize: 13,
    fontWeight: '500',
  },
  chipTextApplied: {
    color: ACCENT,
  },
  chipRemove: {
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.elevatedAlt2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: c.textPrimary,
    fontSize: 14,
  },
  addBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  addBtnDisabled: {
    backgroundColor: c.elevatedAlt2,
  },
  addBtnText: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
});
