import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useTheme, useThemeColors } from '../../contexts/ThemeContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useHistory } from '../../contexts/HistoryContext';
import { useDownload } from '../../contexts/DownloadContext';
import { isTalkOnly, loadTalkOnly, onTalkOnlyChange, setTalkOnly } from '../../utils/talkOnly';
import { READER_FONT_FAMILY } from '../../utils/readerFont';
import { Icon, Page, PageHead, TextSizeStepper } from './ui';
import { RETENTION_OPTIONS } from './History';
import { formatBytes, openDownloadsFolder } from './Downloads';

/**
 * Desktop-only Settings page. Every control here is the same setting the
 * phone keeps elsewhere (theme toggle on Home/Library, text size on Library,
 * autoplay and "Prabhupāda only" in the player, retention on History) —
 * gathered in one place because that is where a Windows user looks.
 */
export default function DesktopSettings() {
  const c = useThemeColors();
  const { mode, setMode } = useTheme();
  const { readerFontSize, autoPlayNext, setAutoPlayNext } = useSettings();
  const { settings, updateSettings, clearHistory, history } = useHistory();
  const { totalCount, totalBytes, deleteAll } = useDownload();
  const [talkOn, setTalkOn] = useState(isTalkOnly());
  useEffect(() => { loadTalkOnly().then(setTalkOn); return onTalkOnlyChange(setTalkOn); }, []);
  const version = (window as any).desktop?.version as string | undefined;

  const row = (title: string, sub: string, control: React.ReactNode) => (
    <div className="pv-set-row">
      <div className="pv-grow"><div className="pv-set-title">{title}</div><div className="pv-set-sub">{sub}</div></div>
      {control}
    </div>
  );

  return (
    <Page>
      <div style={{ maxWidth: 860 }}>
        <PageHead eyebrow="Preferences" title="Settings" />

        <div className="pv-side-label">Appearance</div>
        <div className="pv-card">
          {row('Theme', 'Follows Windows by default.', (
            <div className="pv-seg">
              {([['system', 'desktop-outline', 'System'], ['light', 'sunny-outline', 'Light'], ['dark', 'moon-outline', 'Dark']] as const).map(([m, icon, label]) => (
                <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                  <Icon name={icon} size={15} color={mode === m ? c.accent : undefined} /> {label}
                </button>
              ))}
            </div>
          ))}
          {row('Lecture text size', 'Scales the lecture page: title, details, player and transcript.', <TextSizeStepper />)}
          <div style={{ padding: '0 18px 18px' }}>
            <div style={{ border: `1px dashed ${c.borderStrong}`, borderRadius: 12, padding: '14px 18px', fontFamily: READER_FONT_FAMILY, fontSize: readerFontSize, lineHeight: 1.85, color: c.textBody }}>
              <span style={{ color: c.speaker, fontWeight: 700 }}>Prabhupāda: </span>
              So this Kṛṣṇa consciousness movement is meant for giving the highest benefit to the human society.
            </div>
          </div>
        </div>

        <div className="pv-side-label" style={{ marginTop: 26 }}>Playback</div>
        <div className="pv-card">
          {row('Autoplay next lecture', 'When a lecture ends, start the next one in the same collection; an open transcript follows along.', (
            <button className={`pv-switch ${autoPlayNext ? 'on' : ''}`} onClick={() => setAutoPlayNext(!autoPlayNext)} aria-pressed={autoPlayNext} aria-label="Autoplay next lecture" />
          ))}
          {row('Prabhupāda only', 'On lectures that have been analysed, skip the śloka chanting, readings, questions and kirtan.', (
            <button className={`pv-switch ${talkOn ? 'on' : ''}`} onClick={() => setTalkOnly(!talkOn)} aria-pressed={talkOn} aria-label="Prabhupāda only" />
          ))}
        </div>

        <div className="pv-side-label" style={{ marginTop: 26 }}>History</div>
        <div className="pv-card">
          {row('Keep history', 'Older entries (and their resume positions) are removed after this.', (
            <div className="pv-seg">
              {RETENTION_OPTIONS.map(o => (
                <button key={o.value} className={settings.retention === o.value ? 'on' : ''} onClick={() => updateSettings({ retention: o.value })}>{o.label}</button>
              ))}
            </div>
          ))}
          {row('Clear history', `${history.length} lectures in history.`, (
            <button className="pv-btn danger sm" disabled={!history.length} onClick={() => Alert.alert('Clear History', 'Remove all watch history?', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: clearHistory },
            ])}>Clear</button>
          ))}
        </div>

        <div className="pv-side-label" style={{ marginTop: 26 }}>Downloads</div>
        <div className="pv-card">
          {row('Offline lectures', `${totalCount} recordings · ${formatBytes(totalBytes)}`, (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pv-btn sm" onClick={() => router.navigate('/downloads' as any)}>Manage</button>
              {(window as any).desktop ? <button className="pv-btn sm" onClick={openDownloadsFolder}>Open folder</button> : null}
              <button className="pv-btn danger sm" disabled={!totalCount} onClick={() => Alert.alert('Delete All Downloads', `Remove all ${totalCount} downloaded recordings? This cannot be undone.`, [
                { text: 'Cancel', style: 'cancel' }, { text: 'Delete All', style: 'destructive', onPress: () => deleteAll() },
              ])}>Delete all</button>
            </div>
          ))}
        </div>

        <div className="pv-side-label" style={{ marginTop: 26 }}>Keyboard shortcuts</div>
        <div className="pv-card">
          <div className="pv-kbd-grid">
            {[
              ['Space', 'Play / pause'],
              ['← / →', 'Back / forward 15 seconds'],
              ['Shift + ← / →', 'Slower / faster'],
              ['Ctrl + 0', 'Normal speed'],
              ['Ctrl + .', 'Stop'],
              ['Ctrl + K', 'Search lectures'],
              ['Ctrl + F', 'Find in transcript (on a lecture)'],
              ['Esc', 'Close a dialog · leave focus mode'],
              ['Alt + ← / Backspace', 'Back'],
              ['Ctrl + B', 'Collapse / expand the sidebar'],
              ['Double-click a word', 'Show its meaning'],
            ].map(([k, v]) => (
              <React.Fragment key={k}><span className="pv-kbd" style={{ justifySelf: 'start', fontSize: 12 }}>{k}</span><span>{v}</span></React.Fragment>
            ))}
          </div>
        </div>

        <div className="pv-side-label" style={{ marginTop: 26 }}>About</div>
        <div className="pv-card">
          {row('Prabhupada Vani', `${version ? `Version ${version} · ` : ''}Lectures, conversations and morning walks of Srila Prabhupada, with transcripts from vanisource.org.`, (
            <button className="pv-btn sm" onClick={() => window.open('https://vanisource.org', '_blank')}>Vanisource.org</button>
          ))}
        </div>
      </div>
    </Page>
  );
}
