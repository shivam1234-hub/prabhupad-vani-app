import { useMemo, useState } from 'react';
import lectureData from '../data/lectures.json';
import { Lecture, LectureType } from '../data/types';

const ALL_LECTURES = lectureData as Lecture[];

export interface SearchFilters {
  query: string;
  type: LectureType | 'All';
  location: string;
  yearFrom: number | null;
  yearTo: number | null;
  chapterPrefix: string;
}

export const DEFAULT_FILTERS: SearchFilters = {
  query: '',
  type: 'All',
  location: '',
  yearFrom: null,
  yearTo: null,
  chapterPrefix: '',
};

function normalize(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function useLectures() {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);

  const results = useMemo(() => {
    if (!filters.query && filters.type === 'All' && !filters.location &&
        !filters.yearFrom && !filters.yearTo && !filters.chapterPrefix) {
      return ALL_LECTURES.slice(0, 50);
    }

    const q = normalize(filters.query);
    return ALL_LECTURES.filter(lecture => {
      if (filters.type !== 'All' && lecture.type !== filters.type) return false;
      if (filters.location && !normalize(lecture.location).includes(normalize(filters.location))) return false;
      if (filters.yearFrom && lecture.year < filters.yearFrom) return false;
      if (filters.yearTo && lecture.year > filters.yearTo) return false;
      if (filters.chapterPrefix && !lecture.chapter.startsWith(filters.chapterPrefix)) return false;

      if (!q) return true;
      return (
        normalize(lecture.title).includes(q) ||
        normalize(lecture.chapter).includes(q) ||
        normalize(lecture.location).includes(q) ||
        normalize(lecture.fullTitle || '').includes(q) ||
        lecture.year.toString().includes(q)
      );
    }).slice(0, 200);
  }, [filters]);

  const locations = useMemo(() => {
    return [...new Set(ALL_LECTURES.map(l => l.location))]
      .filter(l => l && !l.includes('-') && l.length < 30)
      .sort();
  }, []);

  const years = useMemo(() => {
    const ys = [...new Set(ALL_LECTURES.map(l => l.year))].filter(y => y >= 1966 && y <= 1977).sort();
    return ys;
  }, []);

  const stats = useMemo(() => ({
    total: ALL_LECTURES.length,
    bg: ALL_LECTURES.filter(l => l.type === 'Bhagavad-gita').length,
    sb: ALL_LECTURES.filter(l => l.type === 'Srimad-Bhagavatam').length,
  }), []);

  return { results, filters, setFilters, locations, years, stats };
}

export function getLectureById(id: string): Lecture | undefined {
  return ALL_LECTURES.find(l => l.id === id);
}
