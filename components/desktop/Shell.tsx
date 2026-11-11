import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useTheme, useThemeColors } from '../../contexts/ThemeContext';
import { useAudioMeta, useAudioPosition } from '../../contexts/AudioContext';
import { useDownload } from '../../contexts/DownloadContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useAllRecordings } from '../../hooks/useAllRecordings';
import { getRecordingId, getTypeMeta } from '../../data/types';
import { useFocusMode } from '../../utils/focusMode';
import { nextInSection } from '../../utils/nextInSection';
import { fetchAudioUrls } from '../../utils/audioUrls';
import { audioEvents } from '../../utils/audioEvents';
import { formatMs } from '../../utils/time';
import { getTalk, isTalkOnly, loadTalkOnly, onTalkOnlyChange, setTalkOnly } from '../../utils/talkOnly';
import { getVolume, setVolume, subscribeVolume } from '../../utils/webAudioElement';
import { SPEEDS } from '../AudioPlayer';
import { DESKTOP_CSS, themeVars } from './css';
import { Cover, Icon, usePopover } from './ui';
import { searchQuery, usePageTitle, useSearchQuery } from './store';

const NAV: { path: string; label: string; icon: string; on: string }[] = [
  { path: '/', label: 'Home', icon: 'home-outline', on: 'home' },
  { path: '/library', label: 'Library', icon: 'library-outline', on: 'library' },
  { path: '/browse', label: 'Search', icon: 'search-outline', on: 'search' },
  { path: '/by-length', label: 'Find by length', icon: 'hourglass-outline', on: 'hourglass' },
  { path: '/downloads', label: 'Downloads', icon: 'cloud-download-outline', on: 'cloud-download' },
  { path: '/history', label: 'History', icon: 'time-outline', on: 'time' },
];

const COLLAPSE_KEY = 'pv_desktop_sidebar_collapsed';

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { colors, isDark } = useTheme();
  const focus = useFocusMode();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const toggleCollapsed = useCallback(() => {
    setCollapsed(v => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1'); } catch {}
      return !v;
    });
  }, []);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Global shortcuts. Bare Space/arrows for playback live in
  // AudioContext.web.tsx; these are the navigation ones.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        if (window.location.pathname.startsWith('/lecture/')) {
          window.dispatchEvent(new Event('pv-find'));
        } else {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleCollapsed();
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); window.history.forward(); return; }
      if (e.key === 'Backspace' && !isTyping() && !mod && !e.altKey) {
        e.preventDefault();
        goBack();
      }
    };
    // Mouse back/forward buttons.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); goBack(); }
      if (e.button === 4) { e.preventDefault(); window.history.forward(); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); };
  }, [toggleCollapsed]);

  const style = useMemo(() => themeVars(colors, isDark) as React.CSSProperties, [colors, isDark]);

  return (
    <div
      className={`pv-root ${collapsed ? 'pv-collapsed' : ''} ${focus ? 'pv-focus' : ''}`}
      style={{ ...style, colorScheme: isDark ? 'dark' : 'light' } as React.CSSProperties}
    >
      <style>{DESKTOP_CSS}</style>
      <Sidebar pathname={pathname} collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="pv-main">
        <TopBar pathname={pathname} searchRef={searchRef} />
        <div className="pv-content">{children}</div>
      </div>
      <NowPlayingBar />
    </div>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else if (window.location.pathname !== '/') router.navigate('/' as any);
}

function navTo(path: string) {
  router.navigate(path as any);
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function activeFor(pathname: string): string {
  if (pathname.startsWith('/category/')) return '/library';
  if (pathname === '/index') return '/';
  return pathname;
}

function Sidebar({ pathname, collapsed, onToggle }: { pathname: string; collapsed: boolean; onToggle: () => void }) {
  const c = useThemeColors();
  const { progress } = useDownload();
  const active = activeFor(pathname);
  const activeDownloads = Object.keys(progress).length;

  const item = (n: { path: string; label: string; icon: string; on: string }, badge?: number) => {
    const on = active === n.path;
    return (
      <button
        key={n.path}
        className={`pv-nav ${on ? 'on' : ''}`}
        onClick={() => navTo(n.path)}
        {...(collapsed ? { 'data-tip': n.label, 'data-tip-pos': 'right' } : {})}
        aria-current={on ? 'page' : undefined}
      >
        <Ionicons name={(on ? n.on : n.icon) as any} size={20} color={on ? c.accent : c.textMuted} />
        <span className="pv-nav-text">{n.label}</span>
        {badge ? <span className="pv-nav-badge">{badge}</span> : null}
        {badge && collapsed ? <span className="pv-nav-dot" /> : null}
      </button>
    );
  };

  return (
    <nav className="pv-sidebar">
      <div className="pv-brand">
        <Image source={require('../../assets/icon.png')} style={{ width: 36, height: 36, borderRadius: 10 }} />
        <div className="pv-brand-text">
          <span className="pv-brand-name">Prabhupada Vani</span>
          <span className="pv-brand-sub">Lectures with transcripts</span>
        </div>
      </div>
      <div className="pv-nav-label">Listen</div>
      {NAV.slice(0, 2).map(n => item(n))}
      <div className="pv-nav-label">Find</div>
      {NAV.slice(2, 4).map(n => item(n))}
      <div className="pv-nav-label">Yours</div>
      {item(NAV[4], activeDownloads || undefined)}
      {item(NAV[5])}
      <div className="pv-sidebar-foot">
        {item({ path: '/settings', label: 'Settings', icon: 'settings-outline', on: 'settings' })}
        <button
          className="pv-nav"
          onClick={onToggle}
          {...(collapsed ? { 'data-tip': 'Expand sidebar (Ctrl+B)', 'data-tip-pos': 'right' } : {})}
        >
          <Ionicons name={collapsed ? 'chevron-forward-outline' : 'chevron-back-outline'} size={20} color={c.textDim} />
          <span className="pv-nav-text">Collapse</span>
        </button>
      </div>
    </nav>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────

function TopBar({ pathname, searchRef }: { pathname: string; searchRef: React.MutableRefObject<HTMLInputElement | null> }) {
  const c = useThemeColors();
  const { isDark, toggle } = useTheme();
  const query = useSearchQuery();
  const lectureTitle = usePageTitle();
  const { getById, all } = useAllRecordings();

  const crumbs: { label: string; path?: string }[] = [];
  if (pathname === '/' || pathname === '/index') crumbs.push({ label: 'Home' });
  else if (pathname === '/library') crumbs.push({ label: 'Library' });
  else if (pathname === '/browse') crumbs.push({ label: 'Search' });
  else if (pathname === '/by-length') crumbs.push({ label: 'Find by length' });
  else if (pathname === '/downloads') crumbs.push({ label: 'Downloads' });
  else if (pathname === '/history') crumbs.push({ label: 'History' });
  else if (pathname === '/settings') crumbs.push({ label: 'Settings' });
  else if (pathname.startsWith('/category/')) {
    const slug = decodeURIComponent(pathname.split('/')[2] ?? '');
    crumbs.push({ label: 'Library', path: '/library' }, { label: getTypeMeta(slug).label });
  } else if (pathname.startsWith('/lecture/')) {
    const id = decodeURIComponent(pathname.split('/')[2] ?? '');
    const rec = getById(id);
    if (rec) {
      crumbs.push(
        { label: 'Library', path: '/library' },
        { label: getTypeMeta(rec.type).label, path: `/category/${rec.type}` },
        { label: lectureTitle || rec.title },
      );
    } else crumbs.push({ label: 'Lecture' });
  }

  // On the Search page this field *is* the search box, so focus it there.
  useEffect(() => {
    if (pathname === '/browse') setTimeout(() => searchRef.current?.focus(), 50);
  }, [pathname]);

  const onChange = (v: string) => {
    searchQuery.set(v);
    if (window.location.pathname !== '/browse' && v.trim()) navTo('/browse');
  };

  return (
    <header className="pv-topbar">
      <button className="pv-icon-btn" data-tip="Back (Alt+←)" data-tip-pos="bottom" onClick={goBack} aria-label="Back">
        <Icon name="arrow-back" size={19} />
      </button>
      <button className="pv-icon-btn" data-tip="Forward (Alt+→)" data-tip-pos="bottom" onClick={() => window.history.forward()} aria-label="Forward">
        <Icon name="arrow-forward" size={19} />
      </button>
      <div className="pv-crumbs">
        {crumbs.map((cr, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Icon name="chevron-forward" size={13} color={c.textFaint} /> : null}
            {cr.path ? (
              <button className="pv-crumb" onClick={() => navTo(cr.path!)}>{cr.label}</button>
            ) : (
              <span className="pv-crumb-cur">{cr.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>
      <label className="pv-search">
        <Icon name="search" size={16} color={c.textDim} />
        <input
          ref={searchRef}
          value={query}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); }
            if (e.key === 'Enter') navTo('/browse');
          }}
          placeholder={`Search ${all.length.toLocaleString('en-IN')} lectures — verse, place, year, topic`}
          spellCheck={false}
        />
        {query ? (
          <button className="pv-icon-btn sm" onClick={() => searchQuery.set('')} aria-label="Clear search">
            <Icon name="close-circle" size={16} color={c.textFaint} />
          </button>
        ) : <span className="pv-kbd">Ctrl K</span>}
      </label>
      <button
        className="pv-icon-btn"
        data-tip={isDark ? 'Light theme' : 'Dark theme'}
        data-tip-pos="bottom"
        onClick={toggle}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        <Icon name={isDark ? 'sunny-outline' : 'moon-outline'} size={19} />
      </button>
    </header>
  );
}

// ─── Now-playing bar ────────────────────────────────────────────────────────

function NowPlayingBar() {
  const c = useThemeColors();
  const audio = useAudioMeta();
  const { autoPlayNext, setAutoPlayNext } = useSettings();
  const { isFavourite, toggleFavourite } = useLibrary();
  const { getLocalUris } = useDownload();
  const rec = audio.recording;
  const [nextBusy, setNextBusy] = useState(false);
  const speedPop = usePopover();

  const talk = getTalk(rec ? (rec.pvId ?? rec.id) : null);
  const [talkOn, setTalkOn] = useState(isTalkOnly());
  useEffect(() => {
    loadTalkOnly().then(setTalkOn);
    return onTalkOnlyChange(setTalkOn);
  }, []);

  const upNext = useMemo(() => (rec ? nextInSection(rec) : null), [rec]);

  if (!rec) {
    return (
      <footer className="pv-npbar" style={{ height: 56 }}>
        <div className="pv-np-idle">
          <Icon name="headset-outline" size={18} color={c.textFaint} />
          Nothing playing. Pick a lecture from the Library or Search — Space plays and pauses, ← → skip 15 s.
        </div>
      </footer>
    );
  }

  const meta = getTypeMeta(rec.type);
  const id = getRecordingId(rec);
  const parts = audio.audioUrls.length;
  const fav = isFavourite(id);

  const prev = () => {
    if (audio.partIndex > 0) audio.playPart(audio.partIndex - 1);
    else audio.seek(0);
  };
  const next = async () => {
    if (audio.partIndex + 1 < parts) { audio.playPart(audio.partIndex + 1); return; }
    if (!upNext) return;
    setNextBusy(true);
    try {
      const local = getLocalUris(getRecordingId(upNext));
      const urls = local.length ? local : await fetchAudioUrls(upNext.vanisourceUrl);
      if (!urls.length) return;
      await audio.play(upNext, urls, 0, local.length ? local : undefined);
      audioEvents.emitAutoAdvance({ fromId: id, toId: getRecordingId(upNext) });
    } catch {} finally { setNextBusy(false); }
  };

  return (
    <footer className="pv-npbar">
      <div className="pv-np-left">
        <div style={{ cursor: 'pointer', flex: 'none' }} onClick={() => router.push(`/category/${rec.type}` as any)} data-tip={`Open ${meta.label}`}>
          <Cover type={rec.type} w={rec.type in { 'Bhagavad-gita': 1, 'Srimad-Bhagavatam': 1, CC: 1 } ? 44 : 58} h={58} radius={8} badge={false} />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span className="pv-np-title" onClick={() => router.push(`/lecture/${rec.id}` as any)} title={rec.fullTitle || rec.title}>{rec.title}</span>
          <span className="pv-np-meta">
            {[rec.location, rec.year, parts > 1 ? `Part ${audio.partIndex + 1} of ${parts}` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
        <button className={`pv-icon-btn sm ${fav ? 'on' : ''}`} style={fav ? { color: c.danger, background: 'transparent' } : undefined} data-tip={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={() => toggleFavourite(id)}>
          <Icon name={fav ? 'heart' : 'heart-outline'} size={17} color={fav ? c.danger : undefined} />
        </button>
      </div>

      <div className="pv-np-center">
        <div className="pv-np-controls">
          <button className="pv-icon-btn sm" data-tip={audio.partIndex > 0 ? 'Previous part' : 'Restart'} onClick={prev}>
            <Icon name="play-skip-back" size={17} />
          </button>
          <button className="pv-icon-btn" data-tip="Back 15 s (←)" onClick={audio.skipBackward}>
            <SkipIcon dir={-1} />
          </button>
          <button className="pv-np-play" onClick={() => (audio.isPlaying ? audio.pause() : audio.resume())} aria-label={audio.isPlaying ? 'Pause' : 'Play'} data-tip="Play / pause (Space)">
            {audio.isLoading
              ? <ActivityIndicator size="small" color={c.bg} />
              : <Ionicons name={audio.isPlaying ? 'pause' : 'play'} size={20} color={c.bg} style={{ marginLeft: audio.isPlaying ? 0 : 2 }} />}
          </button>
          <button className="pv-icon-btn" data-tip="Forward 15 s (→)" onClick={audio.skipForward}>
            <SkipIcon dir={1} />
          </button>
          <button
            className="pv-icon-btn sm"
            data-tip={audio.partIndex + 1 < parts ? 'Next part' : upNext ? `Next: ${upNext.title}` : 'No next lecture'}
            onClick={next}
            disabled={!(audio.partIndex + 1 < parts) && !upNext}
          >
            {nextBusy ? <ActivityIndicator size="small" color={c.textMuted} /> : <Icon name="play-skip-forward" size={17} />}
          </button>
        </div>
        <SeekRow color={meta.color} />
        {audio.error ? <span style={{ color: c.dangerAlt, fontSize: 11.5 }}>{audio.error}</span> : null}
      </div>

      <div className="pv-np-right">
        {talk ? (
          <button
            className={`pv-icon-btn sm ${talkOn ? 'on' : ''}`}
            data-tip={talkOn ? `Prabhupāda only: on · ${Math.round(talk.talkSec / 60)} of ${Math.round(talk.totalSec / 60)} min` : 'Prabhupāda only: off (skip śloka, readings, kirtan)'}
            onClick={() => setTalkOnly(!talkOn)}
            aria-pressed={talkOn}
          >
            <Icon name={talkOn ? 'mic' : 'mic-outline'} size={17} color={talkOn ? c.accent : undefined} />
          </button>
        ) : null}
        <button
          className={`pv-icon-btn sm ${autoPlayNext ? 'on' : ''}`}
          data-tip={autoPlayNext ? `Autoplay next: on${upNext ? ' · ' + upNext.title : ''}` : 'Autoplay next: off'}
          onClick={() => setAutoPlayNext(!autoPlayNext)}
          aria-pressed={autoPlayNext}
        >
          <Icon name={autoPlayNext ? 'infinite' : 'infinite-outline'} size={19} color={autoPlayNext ? c.accent : undefined} />
        </button>
        <div ref={speedPop.ref} style={{ position: 'relative' }}>
          <button className="pv-speed-pill" data-tip="Playback speed (Shift+← / →)" onClick={() => speedPop.setOpen(!speedPop.open)}>
            {audio.speed}x
          </button>
          {speedPop.open ? (
            <div className="pv-menu">
              {SPEEDS.map(s => (
                <button key={s} className={audio.speed === s ? 'on' : ''} onClick={() => { audio.setSpeed(s); speedPop.setOpen(false); }}>
                  <span style={{ width: 16 }}>{audio.speed === s ? '✓' : ''}</span>{s}x{s === 1 ? ' · normal' : ''}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Volume />
        <button className="pv-icon-btn sm" data-tip="Open lecture & transcript" onClick={() => router.push(`/lecture/${rec.id}` as any)}>
          <Icon name="reader-outline" size={18} />
        </button>
        <button className="pv-icon-btn sm" data-tip="Stop (Ctrl+.)" onClick={audio.stop}>
          <Icon name="close" size={18} />
        </button>
      </div>
    </footer>
  );
}

function SkipIcon({ dir }: { dir: 1 | -1 }) {
  const c = useThemeColors();
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <Ionicons name={dir < 0 ? 'refresh' : 'refresh'} size={22} color={c.textMuted} style={dir < 0 ? { transform: [{ scaleX: -1 }] } : undefined} />
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: c.textMuted, paddingTop: 1 }}>15</span>
    </span>
  );
}

function SeekRow({ color }: { color: string }) {
  const audio = useAudioMeta();
  const { positionMs, durationMs } = useAudioPosition();
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? positionMs;
  const pct = durationMs > 0 ? Math.min(shown / durationMs, 1) * 100 : 0;
  const commit = () => {
    if (drag != null) { audio.seek(drag); setDrag(null); }
  };
  return (
    <div className="pv-np-seek">
      <span style={{ minWidth: 44, textAlign: 'right' }}>{formatMs(shown)}</span>
      <input
        className="pv-range"
        type="range"
        min={0}
        max={Math.max(durationMs, 1)}
        step={1000}
        value={shown}
        onChange={e => setDrag(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Seek"
        style={{ ['--pct' as any]: `${pct}%`, ['--fill' as any]: drag != null ? color : undefined } as React.CSSProperties}
      />
      <span style={{ minWidth: 44 }}>{durationMs > 0 ? formatMs(durationMs) : '--:--'}</span>
    </div>
  );
}

function Volume() {
  const vol = useSyncExternalStore(subscribeVolume, getVolume, getVolume);
  const last = useRef(1);
  if (vol > 0) last.current = vol;
  return (
    <div className="pv-np-vol" style={{ display: 'flex', alignItems: 'center', gap: 4, width: 130 }}>
      <button className="pv-icon-btn sm" data-tip={vol === 0 ? 'Unmute' : 'Mute'} onClick={() => setVolume(vol === 0 ? last.current || 1 : 0)}>
        <Icon name={vol === 0 ? 'volume-mute-outline' : vol < 0.5 ? 'volume-low-outline' : 'volume-high-outline'} size={18} />
      </button>
      <input
        className="pv-range"
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={vol}
        onChange={e => setVolume(Number(e.target.value))}
        aria-label="Volume"
        style={{ ['--pct' as any]: `${vol * 100}%` } as React.CSSProperties}
      />
    </div>
  );
}
