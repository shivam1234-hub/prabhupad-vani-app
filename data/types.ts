export type LectureType = 'Bhagavad-gita' | 'Srimad-Bhagavatam' | 'Other';

// Unified type covering all recording categories
export interface Recording {
  id: string;
  pvId?: string;        // BG/SB only
  title: string;
  fullTitle: string;
  type: string;
  chapter?: string;     // BG/SB only
  folder?: string;      // extra categories
  date: string;
  year: number;
  location: string;
  locationCode?: string;
  vanisourceUrl: string;
  url?: string;
  hasAudio?: boolean;
}

// Backward-compat alias used by existing code
export interface Lecture extends Recording {
  pvId: string;
  type: LectureType;
  chapter: string;
  locationCode: string;
  hasAudio: boolean;
  url: string;
}

export function getRecordingId(r: Recording): string {
  return r.pvId ?? r.id;
}

export const TYPE_META: Record<string, { label: string; color: string; badge: string; icon: string }> = {
  'Bhagavad-gita':     { label: 'Bhagavad-gita',       color: '#FF7722', badge: 'BG',   icon: 'flame' },
  'Srimad-Bhagavatam': { label: 'Srimad-Bhagavatam',   color: '#9B59B6', badge: 'SB',   icon: 'book' },
  'Conversation':      { label: 'Conversation',         color: '#4A90D9', badge: 'CONV', icon: 'chatbubbles' },
  'MorningWalk':       { label: 'Walk',                 color: '#27AE60', badge: 'WALK', icon: 'walk-outline' },
  'CC':                { label: 'Caitanya-caritamrta',  color: '#1ABC9C', badge: 'CC',   icon: 'book-outline' },
  'General':           { label: 'Lectures & Addresses', color: '#E67E22', badge: 'GEN',  icon: 'mic' },
  'Initiation':        { label: 'Initiation',           color: '#F39C12', badge: 'INIT', icon: 'sparkles' },
  'NOD':               { label: 'Nectar of Devotion',   color: '#E74C3C', badge: 'NOD',  icon: 'heart' },
  'Festival':          { label: 'Festival',             color: '#F1C40F', badge: 'FEST', icon: 'star' },
  'Arrival':           { label: 'Arrival & Departure',  color: '#95A5A6', badge: 'ARR',  icon: 'airplane' },
  'Isopanisad':        { label: 'Sri Isopanisad',       color: '#2ECC71', badge: 'ISO',  icon: 'leaf' },
  'BrahmaSamhita':     { label: 'Sri Brahma Samhita',   color: '#3498DB', badge: 'BS',   icon: 'musical-notes' },
};

export function getTypeMeta(type: string) {
  return TYPE_META[type] ?? {
    label: type, color: '#666',
    badge: type.slice(0, 4).toUpperCase(), icon: 'volume-medium-outline',
  };
}
