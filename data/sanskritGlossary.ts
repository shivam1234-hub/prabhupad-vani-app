/**
 * Sanskrit / Vaiṣṇava terms that come up constantly in Prabhupāda's lectures.
 *
 * WordNet either lacks these or gives the wrong sense ("maya" is the Mayan
 * people there), so the word lookup checks this list first and shows it above
 * any English entry. Definitions are short and written for this app, in the
 * sense Prabhupāda uses the word.
 *
 * Keys are matched after normalizeWord() in utils/dictionary.ts — lower-case,
 * diacritics stripped — so "Kṛṣṇa", "krsna" and "Krishna" all land on one
 * entry via `aliases`.
 */

export interface GlossaryEntry {
  term: string;
  def: string;
}

const ENTRIES: [term: string, def: string, aliases?: string[]][] = [
  ['ācārya', 'A spiritual teacher who teaches by his own example; a bona fide spiritual master in disciplic succession.', ['acharya']],
  ['ahaṅkāra', 'False ego — identifying the self with the material body and mind.', ['ahankara', 'ahankar']],
  ['ānanda', 'Transcendental bliss; one of the three features of the soul and of Kṛṣṇa (sat-cit-ānanda).', ['anand']],
  ['arcā-vigraha', 'The Deity form of the Lord worshipped in the temple.', ['arca', 'arcavigraha']],
  ['asura', 'A demon; one who is envious of God and opposed to devotional service.', ['asuras']],
  ['ātmā', 'The self — the soul, and depending on context also the body, mind or Supersoul.', ['atma', 'atman']],
  ['avatāra', 'An incarnation; literally "one who descends" from the spiritual world.', ['avatara', 'avatar']],
  ['Bhagavad-gītā', 'The Song of God — Kṛṣṇa\'s teachings to Arjuna on the battlefield of Kurukṣetra.', ['bhagavad', 'gita', 'bhagavadgita']],
  ['Bhagavān', 'The Supreme Personality of Godhead, possessing all opulences in full — wealth, strength, fame, beauty, knowledge and renunciation.', ['bhagavan']],
  ['bhakta', 'A devotee of the Lord.', ['bhaktas']],
  ['bhakti', 'Devotional service to the Supreme Lord, performed with love and without material motive.', []],
  ['bhakti-yoga', 'The process of linking with the Supreme through devotional service.', ['bhaktiyoga']],
  ['Bhāgavatam', 'Śrīmad-Bhāgavatam, the spotless Purāṇa describing the pastimes of Kṛṣṇa and His devotees.', ['bhagavatam', 'bhagavata']],
  ['brahmacārī', 'A celibate student living under the guidance of a spiritual master; the first āśrama.', ['brahmacari', 'brahmachari', 'brahmacaris']],
  ['Brahmā', 'The first created living being in the universe, engineer of its secondary creation.', ['brahma']],
  ['Brahman', 'The impersonal, all-pervading feature of the Absolute Truth; also the spirit soul in general.', []],
  ['brāhmaṇa', 'An intelligent, truthful teacher and priest; the first of the four varṇas.', ['brahmana', 'brahmin', 'brahmanas', 'brahmins']],
  ['buddhi', 'Intelligence.', []],
  ['Caitanya', 'Śrī Caitanya Mahāprabhu (1486–1534), Kṛṣṇa Himself appearing as His own devotee to spread the chanting of the holy names.', ['chaitanya']],
  ['dāsa', 'Servant.', ['dasa', 'das']],
  ['deva', 'A demigod or godly person.', ['devas', 'devata', 'devatas']],
  ['dharma', 'The eternal, constitutional nature of the living being — to serve; also religious duty.', []],
  ['ekādaśī', 'The eleventh day after the full and new moon, observed by fasting and extra chanting.', ['ekadasi']],
  ['Goloka', 'Goloka Vṛndāvana, Kṛṣṇa\'s own abode, the topmost planet of the spiritual world.', []],
  ['gopī', 'The cowherd girls of Vṛndāvana, Kṛṣṇa\'s most intimate devotees.', ['gopi', 'gopis']],
  ['gṛhastha', 'A married householder living a regulated spiritual life; the second āśrama.', ['grhastha', 'grihastha']],
  ['guṇa', 'A mode of material nature — goodness (sattva), passion (rajas) or ignorance (tamas); also a quality.', ['guna', 'gunas']],
  ['guru', 'Spiritual master; literally "heavy", one who is weighty with knowledge.', []],
  ['Hare', 'Addresses the energy of the Lord (Rādhā, Harā) in the mahā-mantra.', []],
  ['Hari', 'A name of the Lord, "He who removes all obstacles".', []],
  ['japa', 'Softly chanting the holy names of God, usually on beads.', []],
  ['jīva', 'The living entity, the eternal individual soul.', ['jiva', 'jivas', 'jivatma']],
  ['jñāna', 'Knowledge; in particular, philosophical knowledge of spirit and matter.', ['jnana', 'gyana']],
  ['jñānī', 'One who cultivates knowledge by philosophical speculation.', ['jnani', 'jnanis']],
  ['kali-yuga', 'The present age of quarrel and hypocrisy, which began 5,000 years ago.', ['kali', 'kaliyuga']],
  ['karma', 'Material activity and its reactions, which bind the soul to repeated birth and death.', []],
  ['karmī', 'One engaged in fruitive activity for sense gratification.', ['karmi', 'karmis']],
  ['kīrtana', 'Glorifying the Lord, especially by chanting His holy names together.', ['kirtana', 'kirtan']],
  ['Kṛṣṇa', 'The Supreme Personality of Godhead, the original form of God; the name means "all-attractive".', ['krsna', 'krishna', 'krsnas']],
  ['kṣatriya', 'An administrator or warrior; the second of the four varṇas.', ['ksatriya', 'kshatriya', 'ksatriyas']],
  ['līlā', 'The transcendental pastimes of the Lord.', ['lila', 'leela']],
  ['mahā-mantra', 'The great chant for deliverance: Hare Kṛṣṇa Hare Kṛṣṇa Kṛṣṇa Kṛṣṇa Hare Hare / Hare Rāma Hare Rāma Rāma Rāma Hare Hare.', ['mahamantra']],
  ['mantra', 'A transcendental sound that delivers the mind from illusion.', []],
  ['māyā', 'Illusion; the Lord\'s external energy that makes the soul forget Kṛṣṇa. Literally "that which is not".', ['maya']],
  ['mokṣa', 'Liberation from birth and death.', ['moksa', 'moksha']],
  ['mukti', 'Liberation from material bondage.', []],
  ['mūḍha', 'A fool or ass-like person.', ['mudha', 'mudhas']],
  ['Nārāyaṇa', 'The four-armed expansion of Kṛṣṇa who presides over the Vaikuṇṭha planets.', ['narayana', 'narayan']],
  ['paramparā', 'The disciplic succession through which spiritual knowledge is received unchanged.', ['parampara']],
  ['Paramātmā', 'The Supersoul, Kṛṣṇa\'s expansion who lives in every heart alongside the individual soul.', ['paramatma']],
  ['prakṛti', 'Material nature; also energy that is controlled.', ['prakrti', 'prakriti']],
  ['prasādam', 'Food first offered to Kṛṣṇa, which becomes His mercy; literally "mercy".', ['prasadam', 'prasada', 'prasad']],
  ['prema', 'Pure love of God, the perfection of devotional service.', []],
  ['Purāṇa', 'The eighteen historical supplements to the Vedas.', ['purana', 'puranas']],
  ['puruṣa', 'The enjoyer or controller; can refer to the soul or to the Supreme Lord.', ['purusa', 'purusha']],
  ['Rādhārāṇī', 'Śrīmatī Rādhārāṇī, Kṛṣṇa\'s eternal consort and His internal pleasure potency.', ['radharani', 'radha']],
  ['rajas', 'Rajo-guṇa, the mode of passion.', ['rajo', 'rajoguna']],
  ['Rāma', 'A name of the Lord meaning "the reservoir of pleasure"; also Lord Rāmacandra.', ['rama']],
  ['rasa', 'The relationship and taste of exchange between the Lord and His devotee.', []],
  ['ṛṣi', 'A sage.', ['rsi', 'rishi', 'rsis']],
  ['sac-cid-ānanda', 'Eternal, full of knowledge and full of bliss — the nature of Kṛṣṇa\'s form and of the soul.', ['saccidananda', 'sat-cit-ananda']],
  ['sādhana', 'Regulated spiritual practice.', ['sadhana']],
  ['sādhu', 'A saintly person or devotee.', ['sadhu', 'sadhus']],
  ['saṁsāra', 'The cycle of repeated birth and death in the material world.', ['samsara']],
  ['saṅkīrtana', 'Congregational chanting of the holy names; the prescribed process for this age.', ['sankirtana', 'sankirtan']],
  ['sannyāsī', 'A renunciant in the fourth āśrama, fully dedicated to preaching.', ['sannyasi', 'sannyasa', 'sannyasis']],
  ['śāstra', 'Revealed scripture.', ['sastra', 'shastra', 'sastras']],
  ['sattva', 'Sattva-guṇa, the mode of goodness.', ['sattva-guna']],
  ['sevā', 'Service, especially devotional service.', ['seva']],
  ['Śiva', 'Lord Śiva, the demigod in charge of the mode of ignorance and of annihilation; the greatest Vaiṣṇava.', ['siva', 'shiva']],
  ['śloka', 'A Sanskrit verse.', ['sloka', 'shloka']],
  ['Śrīmad', 'Beautiful, glorious; the honorific in Śrīmad-Bhāgavatam.', ['srimad']],
  ['śūdra', 'A labourer; the fourth of the four varṇas.', ['sudra', 'shudra', 'sudras']],
  ['svāmī', 'One who controls his mind and senses; title of one in the renounced order.', ['svami', 'swami']],
  ['tamas', 'Tamo-guṇa, the mode of ignorance.', ['tamo', 'tamoguna']],
  ['tapasya', 'Austerity voluntarily accepted for spiritual progress.', ['tapasya', 'tapas']],
  ['tilaka', 'Clay markings on the forehead and body marking one as a devotee and the body as a temple of the Lord.', ['tilak']],
  ['Upaniṣad', 'The philosophical portions of the Vedas, 108 in number.', ['upanisad', 'upanishad', 'upanisads']],
  ['vairāgya', 'Detachment from matter, arising naturally from spiritual knowledge.', ['vairagya']],
  ['Vaikuṇṭha', 'The spiritual world, "where there is no anxiety".', ['vaikuntha']],
  ['Vaiṣṇava', 'A devotee of Viṣṇu or Kṛṣṇa.', ['vaisnava', 'vaishnava', 'vaisnavas']],
  ['vaiśya', 'A farmer or merchant; the third of the four varṇas.', ['vaisya', 'vaishya']],
  ['vānaprastha', 'Retired life, the third āśrama, preparing for renunciation.', ['vanaprastha']],
  ['varṇāśrama', 'The Vedic social system of four occupations (varṇas) and four spiritual orders (āśramas).', ['varnasrama', 'varnashrama']],
  ['Veda', 'The original revealed scriptures, first spoken by the Lord.', ['vedas', 'vedic']],
  ['Viṣṇu', 'The all-pervading Lord; Kṛṣṇa\'s expansions for creating and maintaining the universe.', ['visnu', 'vishnu']],
  ['Vṛndāvana', 'Kṛṣṇa\'s eternal abode, and the village in India where He appeared.', ['vrndavana', 'vrindavan', 'vrindavana', 'vrndavan']],
  ['yajña', 'Sacrifice; any activity done for the satisfaction of Viṣṇu.', ['yajna', 'yagya']],
  ['yoga', 'Linking the consciousness with the Supreme; bhakti-yoga is its highest form.', []],
  ['yogī', 'A transcendentalist who strives to link with the Supreme.', ['yogi', 'yogis']],
  ['yuga', 'One of the four ages of the universe (Satya, Tretā, Dvāpara, Kali).', ['yugas']],
];

function key(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const MAP = new Map<string, GlossaryEntry>();
for (const [term, def, aliases = []] of ENTRIES) {
  const entry = { term, def };
  for (const k of [key(term), ...aliases.map(key)]) if (!MAP.has(k)) MAP.set(k, entry);
}

/** `normalized` must already be normalizeWord()-ed. */
export function lookupGlossary(normalized: string): GlossaryEntry | null {
  return MAP.get(normalized) ?? null;
}
