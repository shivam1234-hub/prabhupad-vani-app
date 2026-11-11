import React, { useEffect, useState } from 'react';
import { useThemeColors } from '../../contexts/ThemeContext';
import { useSearch, SortBy } from '../../hooks/useSearch';
import { useLibrary } from '../../contexts/LibraryContext';
import { useHistory } from '../../contexts/HistoryContext';
import { getTypeMeta, TYPE_META } from '../../data/types';
import { Empty, Icon, LectureTable, Page, PageHead } from './ui';
import { searchQuery, useSearchQuery } from './store';

const SUGGESTIONS = ['BG 2.13', 'SB 1.2.6', 'Vrindavan', '1974', 'New York 1966', 'Krishna consciousness', 'Mayapur', 'Bombay 1975'];

/**
 * Desktop Search — the phone's Search tab (useSearch: query, favourites/tags,
 * collection types, sort) plus the year and place filters the hook already
 * supports, with results in the shared lecture table. The query itself is
 * the top bar's search field (Ctrl+K), so there is one search box, not two.
 */
export default function DesktopSearch() {
  const c = useThemeColors();
  const query = useSearchQuery();
  const { favourites, toggleFavourite, isFavourite, allTags, getTagsFor } = useLibrary();
  const { historyMap } = useHistory();
  const { filters, setFilters, results, years, locations } = useSearch();
  const [quick, setQuick] = useState<string>('all');

  useEffect(() => { setFilters(prev => (prev.query === query ? prev : { ...prev, query })); }, [query, setFilters]);

  const hasAnyFilter = query.trim().length > 0 || filters.types.length > 0 || filters.onlyFavourites
    || filters.tags.length > 0 || filters.yearFrom !== null || filters.yearTo !== null || !!filters.location;

  const clearAll = () => {
    setQuick('all');
    searchQuery.set('');
    setFilters(prev => ({ ...prev, query: '', onlyFavourites: false, tags: [], types: [], yearFrom: null, yearTo: null, location: '' }));
  };
  const setQuickFilter = (q: string) => {
    setQuick(q);
    if (q === 'all') setFilters(p => ({ ...p, onlyFavourites: false, tags: [] }));
    else if (q === 'favourites') setFilters(p => ({ ...p, onlyFavourites: true, tags: [] }));
    else setFilters(p => ({ ...p, onlyFavourites: false, tags: [q] }));
  };
  const toggleType = (t: string) => setFilters(p => ({
    ...p, types: p.types.includes(t) ? p.types.filter(x => x !== t) : [...p.types, t],
  }));

  return (
    <Page>
      <PageHead
        eyebrow="Find a lecture"
        title={query.trim() ? `Results for “${query.trim()}”` : 'Search'}
        sub={hasAnyFilter
          ? `${results.length}${results.length >= 200 ? '+' : ''} result${results.length !== 1 ? 's' : ''}`
          : 'Type in the search box above — a verse (BG 2.13), place, year or topic. Diacritics optional.'}
        right={hasAnyFilter ? (
          <button className="pv-btn danger sm" onClick={clearAll}><Icon name="close-circle" size={15} color={c.danger} /> Clear all</button>
        ) : undefined}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pv-filter-label" style={{ width: 84 }}>Show</span>
          <button className={`pv-chip ${quick === 'all' ? 'on' : ''}`} onClick={() => setQuickFilter('all')}>All</button>
          <button className={`pv-chip ${quick === 'favourites' ? 'on' : ''}`} style={{ ['--tint' as any]: c.danger } as React.CSSProperties} onClick={() => setQuickFilter('favourites')}>
            <Icon name="heart" size={13} color={quick === 'favourites' ? c.danger : c.textDim} /> Favourites {favourites.size ? `(${favourites.size})` : ''}
          </button>
          {allTags.map(t => (
            <button key={t} className={`pv-chip ${quick === t ? 'on' : ''}`} onClick={() => setQuickFilter(t)}>#{t}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pv-filter-label" style={{ width: 84 }}>Collections</span>
          {Object.keys(TYPE_META).map(t => {
            const m = getTypeMeta(t);
            const on = filters.types.includes(t);
            return (
              <button key={t} className={`pv-chip ${on ? 'on' : ''}`} style={{ ['--tint' as any]: m.color } as React.CSSProperties} onClick={() => toggleType(t)} data-tip={m.label} data-tip-pos="bottom">
                {m.badge}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="pv-filter-label" style={{ width: 84 }}>Refine</span>
          <select className="pv-select" value={filters.yearFrom ?? ''} onChange={e => setFilters(p => ({ ...p, yearFrom: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">From year</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="pv-select" value={filters.yearTo ?? ''} onChange={e => setFilters(p => ({ ...p, yearTo: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">To year</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="pv-select" value={filters.location} onChange={e => setFilters(p => ({ ...p, location: e.target.value }))}>
            <option value="">Any place</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="pv-select" value={filters.sortBy} onChange={e => setFilters(p => ({ ...p, sortBy: e.target.value as SortBy }))} aria-label="Sort">
            <option value="date">{query.trim() ? 'Best match' : 'Date'}</option>
            <option value="sequence">Verse order</option>
            <option value="name-asc">A → Z</option>
            <option value="name-desc">Z → A</option>
          </select>
        </div>
      </div>

      {!hasAnyFilter ? (
        <Empty icon="search" title="Search or filter above" text="Try a verse, place, year or topic.">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 560 }}>
            {SUGGESTIONS.map(s => (
              <button key={s} className="pv-chip" onClick={() => searchQuery.set(s)}>{s}</button>
            ))}
          </div>
        </Empty>
      ) : results.length === 0 ? (
        <Empty icon="search-outline" title="No results found" text="Try different keywords or filters." />
      ) : (
        <div style={{ marginTop: 10 }}>
          <LectureTable
            rows={results}
            historyMap={historyMap}
            showType
            showFav
            isFav={isFavourite}
            onToggleFav={toggleFavourite}
            getTags={getTagsFor}
          />
          {results.length >= 200 ? (
            <div style={{ textAlign: 'center', color: 'var(--textDim)', fontSize: 12.5, padding: 18 }}>
              Showing the best 200 matches — add a filter or a more specific query to narrow it down.
            </div>
          ) : null}
        </div>
      )}
    </Page>
  );
}
