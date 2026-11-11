import type { ThemeColors } from '../../theme/palette';

/**
 * Desktop (Electron / web) stylesheet. Colours come from the same role-named
 * theme tokens the phone uses (theme/palette.ts), exposed as CSS custom
 * properties on the shell root, so light/dark switch exactly as on mobile.
 */
export function themeVars(c: ThemeColors, isDark: boolean): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) vars[`--${k}`] = v;
  vars['--hover'] = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  vars['--hover2'] = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
  vars['--sidebar'] = isDark ? '#070a16' : '#efece5';
  vars['--bar'] = isDark ? '#0c1020' : '#ffffff';
  vars['--scroll'] = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.2)';
  vars['--scrollHover'] = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.34)';
  vars['--shadowCard'] = isDark
    ? '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.28)'
    : '0 1px 2px rgba(60,40,10,0.06), 0 6px 20px rgba(60,40,10,0.07)';
  vars['--shadowPop'] = isDark
    ? '0 12px 40px rgba(0,0,0,0.55)'
    : '0 12px 40px rgba(60,40,10,0.18)';
  return vars;
}

export const DESKTOP_CSS = `
html, body, #root { height: 100%; }
body { margin: 0; overflow: hidden; }
.pv-root, .pv-root * { box-sizing: border-box; }
.pv-root {
  position: fixed; inset: 0;
  display: grid;
  grid-template-columns: var(--sbw, 240px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto;
  background: var(--bg); color: var(--textPrimary);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.pv-root.pv-collapsed { --sbw: 72px; }
.pv-root.pv-focus { grid-template-columns: 0 minmax(0,1fr); }
.pv-root.pv-focus .pv-sidebar, .pv-root.pv-focus .pv-topbar, .pv-root.pv-focus .pv-npbar { display: none; }

/* Scrollbars */
.pv-root ::-webkit-scrollbar { width: 10px; height: 10px; }
.pv-root ::-webkit-scrollbar-track { background: transparent; }
.pv-root ::-webkit-scrollbar-thumb { background: var(--scroll); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
.pv-root ::-webkit-scrollbar-thumb:hover { background: var(--scrollHover); background-clip: padding-box; border: 2px solid transparent; }
.pv-root ::-webkit-scrollbar-corner { background: transparent; }

.pv-root button { font: inherit; color: inherit; }
.pv-root :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
.pv-root input, .pv-root select { font: inherit; color: var(--textPrimary); }
.pv-search input:focus-visible, .pv-tsearch input:focus-visible { outline: none; }
.pv-table td.pv-td-icon { padding: 4px 2px; text-overflow: clip; text-align: center; }

/* ── Sidebar ── */
.pv-sidebar {
  grid-row: 1; grid-column: 1; min-height: 0;
  display: flex; flex-direction: column; gap: 4px;
  background: var(--sidebar); border-right: 1px solid var(--border);
  padding: 14px 12px; overflow: hidden;
}
.pv-brand { display: flex; align-items: center; gap: 10px; padding: 4px 6px 16px; min-height: 52px; }
.pv-brand img { width: 36px; height: 36px; border-radius: 10px; flex: none; box-shadow: var(--shadowCard); }
.pv-brand-text { display: flex; flex-direction: column; min-width: 0; }
.pv-brand-name { font-weight: 800; font-size: 15px; letter-spacing: .2px; white-space: nowrap; }
.pv-brand-sub { font-size: 11px; color: var(--textDim); white-space: nowrap; }
.pv-nav-label { font-size: 10.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: var(--textFaint); padding: 14px 12px 6px; white-space: nowrap; }
.pv-nav {
  display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px;
  border-radius: 10px; border: 0; background: transparent; cursor: pointer; text-align: left;
  color: var(--textMuted); font-weight: 600; font-size: 14px; white-space: nowrap; width: 100%;
  transition: background .12s, color .12s; position: relative;
}
.pv-nav:hover { background: var(--hover2); color: var(--textPrimary); }
.pv-nav.on { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.pv-nav.on::before { content: ''; position: absolute; left: -12px; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: var(--accent); }
.pv-nav-badge { margin-left: auto; background: var(--accent); color: var(--onAccent); font-size: 10.5px; font-weight: 800; border-radius: 9px; padding: 1px 7px; }
.pv-sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 4px; }
.pv-collapsed .pv-brand-text, .pv-collapsed .pv-nav-text, .pv-collapsed .pv-nav-label, .pv-collapsed .pv-nav-badge { display: none; }
.pv-collapsed .pv-nav { justify-content: center; padding: 0; }
.pv-collapsed .pv-brand { justify-content: center; padding-left: 0; padding-right: 0; }
.pv-collapsed .pv-nav-dot { position: absolute; top: 7px; right: 12px; width: 8px; height: 8px; border-radius: 4px; background: var(--accent); }

/* ── Main column ── */
.pv-main { grid-row: 1; grid-column: 2; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.pv-topbar {
  flex: none; height: 60px; display: flex; align-items: center; gap: 10px;
  padding: 0 20px; border-bottom: 1px solid var(--border); background: var(--bg);
}
.pv-crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1; font-weight: 700; font-size: 15px; }
.pv-crumbs .pv-crumb { color: var(--textDim); cursor: pointer; white-space: nowrap; border: 0; background: none; padding: 4px 6px; border-radius: 6px; font-weight: 600; }
.pv-crumbs .pv-crumb:hover { color: var(--textPrimary); background: var(--hover); }
.pv-crumbs .pv-crumb-cur { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 4px 6px; }
.pv-search {
  display: flex; align-items: center; gap: 8px; width: min(420px, 38vw); height: 38px; padding: 0 12px;
  border-radius: 19px; background: var(--card); border: 1px solid var(--border); transition: border-color .12s, box-shadow .12s;
}
.pv-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
.pv-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 14px; }
.pv-search input::placeholder { color: var(--textFaint); }
.pv-kbd { font-size: 11px; color: var(--textFaint); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; white-space: nowrap; font-weight: 600; }
.pv-content { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; }

/* ── Generic controls ── */
.pv-icon-btn {
  width: 36px; height: 36px; border-radius: 10px; border: 0; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; color: var(--textMuted); flex: none;
  transition: background .12s, color .12s; position: relative;
}
.pv-icon-btn:hover:not(:disabled) { background: var(--hover2); color: var(--textPrimary); }
.pv-icon-btn:disabled { opacity: .35; cursor: default; }
.pv-icon-btn.on { color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.pv-icon-btn.sm { width: 30px; height: 30px; border-radius: 8px; }
.pv-btn {
  display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 10px;
  border: 1px solid var(--borderStrong); background: var(--card); cursor: pointer; font-weight: 700; font-size: 13.5px;
  color: var(--textSecondary); white-space: nowrap; transition: background .12s, border-color .12s, transform .06s;
}
.pv-btn:hover:not(:disabled) { background: var(--hover2); border-color: var(--borderStronger); }
.pv-btn:active:not(:disabled) { transform: translateY(1px); }
.pv-btn:disabled { opacity: .45; cursor: default; }
.pv-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--onAccent); }
.pv-btn.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 88%, #000); border-color: transparent; }
.pv-btn.ghost { background: transparent; border-color: transparent; }
.pv-btn.tint { background: color-mix(in srgb, var(--tint, var(--accent)) 12%, transparent); border-color: color-mix(in srgb, var(--tint, var(--accent)) 40%, transparent); color: var(--tint, var(--accent)); }
.pv-btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); background: transparent; }
.pv-btn.danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 10%, transparent); }
.pv-btn.sm { height: 32px; padding: 0 12px; font-size: 12.5px; border-radius: 8px; }
.pv-chip {
  height: 30px; padding: 0 12px; border-radius: 15px; border: 1px solid var(--borderStrong); background: transparent;
  color: var(--textMuted); font-weight: 600; font-size: 12.5px; cursor: pointer; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px; transition: background .12s;
}
.pv-chip:hover { background: var(--hover2); color: var(--textPrimary); }
.pv-chip.on { border-color: var(--tint, var(--accent)); color: var(--tint, var(--accent)); background: color-mix(in srgb, var(--tint, var(--accent)) 13%, transparent); }
.pv-select {
  height: 32px; padding: 0 28px 0 10px; border-radius: 8px; border: 1px solid var(--borderStrong); background-color: var(--card);
  font-size: 13px; font-weight: 600; cursor: pointer; appearance: none; -webkit-appearance: none; max-width: 220px;
  background-image: linear-gradient(45deg, transparent 50%, var(--textDim) 50%), linear-gradient(135deg, var(--textDim) 50%, transparent 50%);
  background-position: calc(100% - 14px) 13px, calc(100% - 9px) 13px; background-size: 5px 5px; background-repeat: no-repeat;
}
.pv-select:hover { border-color: var(--borderStronger); }
.pv-select option { background: var(--card); color: var(--textPrimary); }
.pv-input {
  height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--borderStrong); background: var(--card);
  font-size: 13px; outline: 0; min-width: 0;
}
.pv-input:focus { border-color: var(--accent); }
.pv-input:focus-visible { outline: none; }
.pv-seg { display: inline-flex; border: 1px solid var(--borderStrong); border-radius: 10px; overflow: hidden; }
.pv-seg button { height: 34px; padding: 0 14px; border: 0; background: transparent; cursor: pointer; font-weight: 700; font-size: 13px; color: var(--textMuted); display: inline-flex; align-items: center; gap: 6px; }
.pv-seg button + button { border-left: 1px solid var(--borderStrong); }
.pv-seg button:hover { background: var(--hover2); }
.pv-seg button.on { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }
.pv-switch { width: 40px; height: 22px; border-radius: 11px; border: 0; background: var(--borderStrong); position: relative; cursor: pointer; flex: none; transition: background .15s; }
.pv-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 8px; background: #fff; transition: left .15s; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
.pv-switch.on { background: var(--accent); }
.pv-switch.on::after { left: 21px; }

/* Tooltip */
[data-tip] { position: relative; }
[data-tip]:hover::after {
  content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%);
  background: var(--textPrimary); color: var(--bg); font-size: 11.5px; font-weight: 600; white-space: nowrap;
  padding: 5px 9px; border-radius: 6px; pointer-events: none; z-index: 1000; animation: pvFade .12s ease-out .35s both;
}
[data-tip-pos="bottom"]:hover::after { bottom: auto; top: calc(100% + 8px); }
[data-tip-pos="right"]:hover::after { left: calc(100% + 10px); bottom: auto; top: 50%; transform: translateY(-50%); }
@keyframes pvFade { from { opacity: 0; } to { opacity: 1; } }

/* ── Pages ── */
.pv-page { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; background: var(--bg); }
.pv-page-inner { max-width: 1480px; margin: 0 auto; padding: 28px 36px 48px; }
.pv-h-eyebrow { color: var(--accent); font-size: 12px; font-weight: 800; letter-spacing: 1.3px; text-transform: uppercase; }
.pv-h-title { font-size: 30px; font-weight: 800; letter-spacing: -.3px; margin: 4px 0 2px; color: var(--textPrimary); }
.pv-h-sub { color: var(--textDim); font-size: 14px; }
.pv-page-head { display: flex; align-items: flex-end; gap: 16px; margin-bottom: 26px; flex-wrap: wrap; }
.pv-page-head > .pv-grow { flex: 1; min-width: 240px; }
.pv-section { margin-top: 34px; }
.pv-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.pv-section-title { font-size: 19px; font-weight: 800; color: var(--textPrimary); }
.pv-section-tag { color: var(--textDim); font-size: 13px; font-weight: 600; }
.pv-count { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); border-radius: 10px; padding: 1px 8px; font-size: 11.5px; font-weight: 800; }
.pv-link { margin-left: auto; color: var(--accent); font-weight: 700; font-size: 13px; cursor: pointer; border: 0; background: none; display: inline-flex; align-items: center; gap: 2px; padding: 4px 8px; border-radius: 6px; }
.pv-link:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.pv-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; }
.pv-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(var(--min, 240px), 1fr)); }
.pv-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 64px 24px; color: var(--textDim); }
.pv-empty-icon { width: 84px; height: 84px; border-radius: 42px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent) 12%, transparent); margin-bottom: 6px; }
.pv-empty-title { font-size: 20px; font-weight: 800; color: var(--textPrimary); }

/* Tiles (lecture cards) */
.pv-tile {
  display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px; background: var(--card);
  border: 1px solid var(--border); cursor: pointer; transition: transform .12s, box-shadow .12s, border-color .12s; position: relative; min-width: 0;
}
.pv-tile:hover { transform: translateY(-2px); box-shadow: var(--shadowCard); border-color: var(--borderStrong); }
.pv-tile-top { display: flex; gap: 12px; align-items: flex-start; }
.pv-tile-title { font-weight: 700; font-size: 14.5px; line-height: 1.35; color: var(--textSecondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pv-tile-meta { color: var(--textDim); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-track { height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.pv-track > div { height: 100%; border-radius: 2px; }
.pv-tile-play {
  position: absolute; right: 12px; bottom: 12px; width: 40px; height: 40px; border-radius: 20px; border: 0;
  display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transform: translateY(4px);
  transition: opacity .15s, transform .15s; box-shadow: 0 4px 12px rgba(0,0,0,.3);
}
.pv-tile:hover .pv-tile-play, .pv-tile-play:focus-visible { opacity: 1; transform: none; }
.pv-badge { display: inline-flex; align-items: center; font-size: 10.5px; font-weight: 800; letter-spacing: .5px; padding: 2px 7px; border-radius: 6px; white-space: nowrap; }

/* Hero */
.pv-hero {
  position: relative; overflow: hidden; border-radius: 22px; border: 1px solid var(--border); background: var(--card);
  padding: 26px; display: flex; gap: 26px; align-items: stretch; box-shadow: var(--shadowCard);
}
.pv-hero-glow { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(10px); }
.pv-hero-cover { flex: none; cursor: pointer; transition: transform .15s; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.pv-hero-cover:hover { transform: scale(1.02); }
.pv-hero-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; position: relative; }
.pv-hero-label { display: flex; align-items: center; gap: 8px; color: var(--textMuted); font-size: 11.5px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
.pv-hero-title { font-size: 28px; font-weight: 800; line-height: 1.2; color: var(--textPrimary); cursor: pointer; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pv-hero-title:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.pv-hero-meta { color: var(--textDim); font-size: 14px; }
.pv-hero-actions { margin-top: auto; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.pv-play-xl { width: 60px; height: 60px; border-radius: 30px; border: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(0,0,0,.3); transition: transform .1s; flex: none; }
.pv-play-xl:hover { transform: scale(1.06); }
.pv-upnext { width: 320px; flex: none; display: flex; flex-direction: column; gap: 4px; border-left: 1px solid var(--border); padding-left: 22px; position: relative; }
.pv-upnext-row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; cursor: pointer; min-width: 0; }
.pv-upnext-row:hover { background: var(--hover2); }

/* Rows / list card */
.pv-list { border-radius: 16px; border: 1px solid var(--border); background: var(--card); overflow: hidden; }
.pv-row { display: flex; align-items: center; gap: 14px; padding: 11px 16px; cursor: pointer; min-width: 0; }
.pv-row + .pv-row { border-top: 1px solid var(--border); }
.pv-row:hover { background: var(--hover); }

/* Table */
.pv-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; table-layout: fixed; }
.pv-table thead th {
  position: sticky; top: 0; z-index: 2; background: var(--bg); text-align: left; font-size: 11.5px; font-weight: 800;
  letter-spacing: .8px; text-transform: uppercase; color: var(--textDim); padding: 10px 10px; border-bottom: 1px solid var(--borderStrong);
  white-space: nowrap; user-select: none;
}
.pv-table thead th.sortable { cursor: pointer; }
.pv-table thead th.sortable:hover { color: var(--textPrimary); }
.pv-table thead th.sorted { color: var(--accent); }
.pv-table tbody tr { cursor: pointer; transition: background .08s; }
.pv-table tbody tr:hover { background: var(--hover); }
.pv-table tbody tr.recent { background: color-mix(in srgb, var(--tint, var(--accent)) 8%, transparent); }
.pv-table tbody tr.playing .pv-cell-title { color: var(--tint, var(--accent)); }
.pv-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: middle; color: var(--textMuted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-cell-num { width: 56px; text-align: center; color: var(--textFaint); font-variant-numeric: tabular-nums; position: relative; }
.pv-cell-num .pv-num { display: inline; }
.pv-cell-num .pv-row-play { display: none; }
.pv-table tbody tr:hover .pv-cell-num .pv-num { display: none; }
.pv-table tbody tr:hover .pv-cell-num .pv-row-play { display: inline-flex; }
.pv-table tbody tr.playing .pv-cell-num .pv-num { display: none; }
.pv-table tbody tr.playing .pv-cell-num .pv-row-play { display: inline-flex; }
.pv-row-play { width: 30px; height: 30px; border-radius: 15px; border: 0; align-items: center; justify-content: center; cursor: pointer; vertical-align: middle; }
.pv-cell-title { color: var(--textHigh); font-weight: 650; }
.pv-cell-title .pv-sub { display: block; color: var(--textDim); font-weight: 500; font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; }
.pv-recent-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; margin-bottom: 3px; }
.pv-tnum { font-variant-numeric: tabular-nums; }
.pv-dl { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; background: transparent; cursor: pointer; height: 30px; min-width: 30px; border-radius: 8px; color: var(--textFaint); }
.pv-dl:hover { background: var(--hover2); color: var(--textPrimary); }
.pv-row-fav { opacity: 0; transition: opacity .1s; }
.pv-table tbody tr:hover .pv-row-fav, .pv-row-fav.on { opacity: 1; }
.pv-filterbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 0 14px; background: var(--bg);
}
.pv-filter-label { font-size: 12px; font-weight: 700; color: var(--textDim); }

/* Category header */
.pv-cat-head { display: flex; gap: 28px; align-items: flex-end; padding: 8px 0 22px; }
.pv-cat-cover { flex: none; border-radius: 10px; overflow: hidden; box-shadow: 0 14px 34px rgba(0,0,0,.35); }
.pv-stat { display: flex; flex-direction: column; }
.pv-stat b { font-size: 20px; font-weight: 800; color: var(--textPrimary); font-variant-numeric: tabular-nums; }
.pv-stat span { font-size: 11.5px; color: var(--textDim); font-weight: 600; text-transform: uppercase; letter-spacing: .6px; }

/* Library covers */
.pv-books { display: grid; gap: 30px; grid-template-columns: repeat(auto-fill, minmax(170px, 210px)); }
.pv-book { display: flex; flex-direction: column; gap: 10px; cursor: pointer; }
.pv-book-img { border-radius: 10px; overflow: hidden; box-shadow: 0 10px 26px rgba(0,0,0,.3); transition: transform .15s, box-shadow .15s; aspect-ratio: 2 / 3; }
.pv-book:hover .pv-book-img { transform: translateY(-4px); box-shadow: 0 18px 36px rgba(0,0,0,.38); }

/* Now-playing bar */
.pv-npbar {
  grid-row: 2; grid-column: 1 / 3; height: 88px; display: grid; grid-template-columns: minmax(220px, 1fr) minmax(360px, 1.4fr) minmax(220px, 1fr);
  align-items: center; gap: 18px; padding: 0 18px; background: var(--bar); border-top: 1px solid var(--border);
  box-shadow: 0 -6px 24px rgba(0,0,0,.12); z-index: 10;
}
.pv-np-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pv-np-title { font-weight: 700; font-size: 14px; color: var(--textPrimary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.pv-np-title:hover { text-decoration: underline; }
.pv-np-meta { font-size: 12px; color: var(--textDim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pv-np-center { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.pv-np-controls { display: flex; align-items: center; gap: 8px; }
.pv-np-play { width: 40px; height: 40px; border-radius: 20px; border: 0; background: var(--textPrimary); color: var(--bg); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .08s; }
.pv-np-play:hover { transform: scale(1.07); }
.pv-np-seek { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 620px; font-size: 11.5px; color: var(--textDim); font-variant-numeric: tabular-nums; }
.pv-np-right { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
.pv-range { -webkit-appearance: none; appearance: none; height: 16px; background: transparent; cursor: pointer; flex: 1; min-width: 0; margin: 0; }
.pv-range::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--fill, var(--textPrimary)) var(--pct, 0%), var(--borderStrong) var(--pct, 0%)); }
.pv-range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 6px; background: var(--textPrimary); margin-top: -4px; opacity: 0; transition: opacity .1s; }
.pv-range:hover::-webkit-slider-thumb, .pv-range:focus-visible::-webkit-slider-thumb { opacity: 1; }
.pv-range:hover { --fill: var(--accent); }
.pv-speed-pill { height: 30px; min-width: 50px; padding: 0 10px; border-radius: 15px; border: 1px solid var(--borderStrong); background: transparent; cursor: pointer; font-weight: 800; font-size: 12.5px; color: var(--textSecondary); }
.pv-speed-pill:hover { background: var(--hover2); }
.pv-menu {
  position: absolute; bottom: calc(100% + 10px); right: 0; background: var(--cardRaised); border: 1px solid var(--borderStrong);
  border-radius: 12px; padding: 6px; box-shadow: var(--shadowPop); z-index: 50; min-width: 140px; animation: pvFade .1s ease-out;
}
.pv-menu.down { bottom: auto; top: calc(100% + 8px); }
.pv-menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px 10px; border: 0; background: transparent; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; color: var(--textSecondary); text-align: left; white-space: nowrap; }
.pv-menu button:hover { background: var(--hover2); }
.pv-menu button.on { color: var(--accent); }
.pv-np-idle { grid-column: 1 / 4; display: flex; align-items: center; gap: 12px; color: var(--textDim); font-size: 13px; }

/* Lecture page */
.pv-lecture { position: absolute; inset: 0; background: var(--bg); display: grid; grid-template-columns: minmax(0, 1fr) var(--rpw, 400px); }
.pv-lecture.focus { grid-template-columns: minmax(0, 1fr) 0; }
.pv-lecture.focus .pv-lec-side { display: none; }
.pv-lec-left { min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }
.pv-lec-toolbar {
  flex: none; display: flex; align-items: center; gap: 6px; padding: 10px 20px; border-bottom: 1px solid var(--border);
  background: var(--bg); flex-wrap: wrap;
}
.pv-tsearch { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 6px 0 10px; border-radius: 10px; border: 1px solid var(--borderStrong); background: var(--card); width: min(360px, 100%); }
.pv-tsearch:focus-within { border-color: var(--accent); }
.pv-tsearch input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 13.5px; }
.pv-tsearch .pv-mc { font-size: 12px; color: var(--textDim); font-variant-numeric: tabular-nums; white-space: nowrap; padding: 0 2px; }
.pv-tool-sep { width: 1px; height: 22px; background: var(--border); margin: 0 4px; }
.pv-auto { display: inline-flex; align-items: center; gap: 2px; height: 34px; padding: 0 4px; border-radius: 10px; border: 1px solid var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-size: 12.5px; font-weight: 700; }
.pv-auto .pv-icon-btn { color: var(--accent); width: 26px; height: 26px; }
.pv-lec-side { min-height: 0; overflow-y: auto; border-left: 1px solid var(--border); background: var(--surfaceAlt); padding: 22px 22px 30px; display: flex; flex-direction: column; gap: 18px; }
.pv-side-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 16px; }
.pv-side-label { font-size: 11px; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: var(--textDim); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.pv-action { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); cursor: pointer; text-align: left; transition: background .12s, border-color .12s; }
.pv-action:hover:not(:disabled) { background: var(--hover2); border-color: var(--borderStrong); }
.pv-action:disabled { cursor: default; }
.pv-action-title { font-weight: 700; font-size: 13.5px; }
.pv-action-sub { font-size: 11.5px; color: var(--textDim); margin-top: 1px; }
.pv-detail { display: flex; gap: 10px; padding: 7px 0; font-size: 13px; }
.pv-detail + .pv-detail { border-top: 1px solid var(--border); }
.pv-detail span:first-of-type { color: var(--textDim); width: 76px; flex: none; }
.pv-detail span:last-of-type { color: var(--textSecondary); font-weight: 600; min-width: 0; }
.pv-tag { display: inline-flex; padding: 4px 10px; border-radius: 12px; background: var(--elevated); color: var(--textSecondary); font-size: 12px; font-weight: 600; }
.pv-part { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; cursor: pointer; }
.pv-part:hover { background: var(--hover2); }
.pv-part.on { background: color-mix(in srgb, var(--tint) 14%, transparent); color: var(--tint); }
.pv-exit-focus { position: absolute; top: 14px; right: 18px; z-index: 20; }
.pv-hint { font-size: 12px; color: var(--textFaint); display: inline-flex; align-items: center; gap: 6px; }

/* Settings */
.pv-set-row { display: flex; align-items: center; gap: 16px; padding: 16px 18px; }
.pv-set-row + .pv-set-row { border-top: 1px solid var(--border); }
.pv-set-row .pv-grow { flex: 1; min-width: 0; }
.pv-set-title { font-weight: 700; font-size: 14px; color: var(--textSecondary); }
.pv-set-sub { font-size: 12.5px; color: var(--textDim); margin-top: 2px; }
.pv-kbd-grid { display: grid; grid-template-columns: auto 1fr; gap: 10px 18px; align-items: center; padding: 16px 18px; font-size: 13px; color: var(--textMuted); }

@media (max-width: 1240px) { .pv-upnext { display: none; } }
@media (max-width: 1100px) {
  .pv-root:not(.pv-expanded) { --sbw: 72px; }
  .pv-root:not(.pv-expanded) .pv-brand-text, .pv-root:not(.pv-expanded) .pv-nav-text, .pv-root:not(.pv-expanded) .pv-nav-label, .pv-root:not(.pv-expanded) .pv-nav-badge { display: none; }
  .pv-root:not(.pv-expanded) .pv-nav { justify-content: center; padding: 0; }
  .pv-root:not(.pv-expanded) .pv-brand { justify-content: center; padding-left: 0; padding-right: 0; }
  .pv-lecture { --rpw: 340px; }
  .pv-page-inner { padding: 22px 24px 40px; }
  .pv-col-place, .pv-col-dur { display: none; }
  .pv-npbar { grid-template-columns: minmax(180px, 1fr) minmax(300px, 1.5fr) auto; }
  .pv-np-vol { display: none; }
}
`;
