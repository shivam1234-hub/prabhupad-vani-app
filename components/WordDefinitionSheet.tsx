import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity,
  useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import type { ThemeColors } from '../theme/palette';
import {
  lookupWord, LookupResult, normalizeWord, POS_LABEL, PartOfSpeech, Sense,
} from '../utils/dictionary';

interface Props {
  /** The word the reader pressed / double-clicked; null keeps the sheet closed. */
  word: string | null;
  /** It came from a verse line, so it is Sanskrit even if spelt in ASCII. */
  sanskritFirst?: boolean;
  accentColor: string;
  onClose: () => void;
}

/**
 * Offline meaning of a transcript word, from the bundled WordNet file plus the
 * Sanskrit glossary. A bottom sheet on phones, a centred card on a wide
 * desktop window. Audio keeps playing underneath — this is a glance, not a
 * detour.
 */
export default function WordDefinitionSheet({ word, sanskritFirst = false, accentColor, onClose }: Props) {
  const c = useThemeColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { readerFontScale: fontScale } = useSettings();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  const [result, setResult] = useState<LookupResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!word) return;
    let cancelled = false;
    setResult(null);
    setFailed(false);
    lookupWord(word, { sanskritFirst })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [word, sanskritFirst]);

  const grouped = useMemo(() => {
    const groups: { pos: PartOfSpeech; senses: Sense[] }[] = [];
    for (const s of result?.senses ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.pos === s.pos) last.senses.push(s);
      else groups.push({ pos: s.pos, senses: [s] });
    }
    return groups;
  }, [result]);

  const title = result?.word || word || '';
  const hasEnglish = grouped.length > 0;
  const hasParts = (result?.parts.length ?? 0) > 0;
  const notFound = !!result && !result.glossary && !hasEnglish && !hasParts;
  // Sanskrit misses go to Prabhupāda's own word-for-word dictionary (online)
  // rather than to a secular dictionary's guess.
  const onlineUrl = result
    ? `https://sanskritdictionary.org/${encodeURIComponent(normalizeWord(result.word).replace(/-/g, ''))}`
    : '';

  return (
    <Modal visible={!!word} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.overlay, wide && styles.overlayWide]} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            wide ? styles.sheetWide : { paddingBottom: 16 + insets.bottom },
          ]}
          onPress={() => {}}
        >
          {!wide && <View style={styles.handle} />}

          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.word, { fontSize: 24 * fontScale }]} numberOfLines={1}>{title}</Text>
              {result?.headword && result.headword !== normalizeWord(result.word) && (
                <Text style={[styles.headword, { fontSize: 13 * fontScale }]}>
                  form of <Text style={{ fontWeight: '700' }}>{result.headword}</Text>
                </Text>
              )}
              {result?.glossary && result.glossaryViaStem && (
                <Text style={[styles.headword, { fontSize: 13 * fontScale }]}>
                  form of <Text style={{ fontWeight: '700' }}>{result.glossary.term}</Text>
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={c.textAaa} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
            {!result && !failed && (
              <View style={styles.centered}>
                <ActivityIndicator color={accentColor} />
              </View>
            )}

            {failed && (
              <Text style={[styles.empty, { fontSize: 14 * fontScale }]}>
                The offline dictionary could not be opened.
              </Text>
            )}

            {result?.glossary && (
              <View style={[styles.glossaryCard, { borderColor: c.goldBorder }]}>
                <Text style={[styles.glossaryLabel, { fontSize: 10 * fontScale }]}>SANSKRIT</Text>
                <Text style={[styles.glossaryTerm, { fontSize: 16 * fontScale }]}>{result.glossary.term}</Text>
                <Text style={[styles.def, { fontSize: 15 * fontScale, lineHeight: 22 * fontScale }]}>
                  {result.glossary.def}
                </Text>
              </View>
            )}

            {hasParts && result!.parts.map((part, i) => (
              <View key={i} style={styles.partRow}>
                <Text style={[styles.partWord, { fontSize: 15 * fontScale }]}>{part.word}</Text>
                {part.glossary ? (
                  <Text style={[styles.def, { fontSize: 15 * fontScale, lineHeight: 22 * fontScale }]}>
                    {part.glossary.def}
                  </Text>
                ) : (
                  <Text style={[styles.empty, styles.emptyInline, { fontSize: 14 * fontScale }]}>not in the glossary</Text>
                )}
              </View>
            ))}

            {grouped.map(({ pos, senses }, gi) => (
              <View key={`${pos}-${gi}`} style={styles.posGroup}>
                <Text style={[styles.pos, { color: accentColor, fontSize: 12 * fontScale }]}>{POS_LABEL[pos]}</Text>
                {senses.map((s, i) => (
                  <View key={i} style={styles.senseRow}>
                    <Text style={[styles.senseNum, { fontSize: 14 * fontScale, lineHeight: 22 * fontScale }]}>
                      {i + 1}.
                    </Text>
                    <Text style={[styles.def, { flex: 1, fontSize: 15 * fontScale, lineHeight: 22 * fontScale }]}>
                      {s.def}
                    </Text>
                  </View>
                ))}
              </View>
            ))}

            {notFound && (
              <Text style={[styles.empty, { fontSize: 14 * fontScale }]}>
                No offline meaning found for “{title}”.
              </Text>
            )}

            {(notFound || hasParts) && (
              <TouchableOpacity
                onPress={() => Linking.openURL(onlineUrl)}
                style={[styles.onlineBtn, { borderColor: accentColor + '66' }]}
              >
                <Ionicons name="globe-outline" size={16} color={accentColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.onlineBtnText, { color: accentColor, fontSize: 14 * fontScale }]}>
                    Look up on sanskritdictionary.org
                  </Text>
                  <Text style={[styles.onlineBtnSub, { fontSize: 11 * fontScale }]}>
                    Śrīla Prabhupāda's word-for-word translations · needs a connection
                  </Text>
                </View>
                <Ionicons name="open-outline" size={14} color={c.textFaint} />
              </TouchableOpacity>
            )}
          </ScrollView>

          <Text style={styles.source}>
            {result?.glossary || result?.isSanskrit
              ? 'Offline · Sanskrit glossary, in Śrīla Prabhupāda\'s usage'
              : 'Offline · English: WordNet 3.0 (Princeton)'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  overlayWide: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: c.cardRaised,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 10,
    maxHeight: '70%',
    borderWidth: 1, borderColor: c.borderStrong,
  },
  sheetWide: {
    width: '100%', maxWidth: 560, borderRadius: 16, paddingTop: 18, paddingBottom: 14,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: c.borderStronger, marginBottom: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  word: { color: c.textPrimary, fontWeight: '800' },
  headword: { color: c.textDim, marginTop: 2 },
  closeBtn: { padding: 4, marginLeft: 8 },
  body: { flexGrow: 0 },
  centered: { paddingVertical: 28, alignItems: 'center' },
  empty: { color: c.textDim, fontStyle: 'italic', paddingVertical: 16 },
  glossaryCard: {
    borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 4, marginBottom: 12,
  },
  glossaryLabel: { color: c.gold, fontWeight: '800', letterSpacing: 1.4, marginBottom: 2 },
  glossaryTerm: { color: c.gold, fontWeight: '700', fontStyle: 'italic', marginBottom: 4 },
  emptyInline: { paddingVertical: 0 },
  partRow: { marginBottom: 10 },
  partWord: { color: c.gold, fontWeight: '700', fontStyle: 'italic', marginBottom: 2 },
  onlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4,
  },
  onlineBtnText: { fontWeight: '600' },
  onlineBtnSub: { color: c.textDim, marginTop: 2 },
  posGroup: { marginBottom: 12 },
  pos: { fontWeight: '700', fontStyle: 'italic', marginBottom: 4 },
  senseRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  senseNum: { color: c.textDim, minWidth: 18 },
  def: { color: c.textBody },
  source: { color: c.textFaint, fontSize: 11, marginTop: 8, textAlign: 'center' },
});
