/**
 * DW Spectrum Playback Card
 * Lovelace custom card for DW Spectrum / Network Optix IPVMS.
 *
 * INSTALL:
 *   1. Copy to  config/www/dw_spectrum_playback_card.js
 *   2. HA → Settings → Dashboards → Resources → add:
 *        URL:  /local/dw_spectrum_playback_card.js   Type: JavaScript module
 *   3. Add card:   type: custom:dw-spectrum-playback-card
 *
 * Views:
 *   Grid   — 2-col thumbnail grid (refresh every 30 s, scrollable at > 8 cameras)
 *   Detail — live snapshot OR archive MP4 player, sliding timeline, calendar, download
 *
 * Live mode  : tries live MP4 stream via HA media proxy; auto-falls back to JPEG polling.
 * Archive mode: <video> proxied through HA (/api/dw_spectrum/{entry_id}/media/...) to avoid
 *               SSL certificate issues with self-signed DW certs.
 */

const CARD_TAG         = "dw-spectrum-playback-card";
const THUMB_REFRESH_MS = 30_000;   // grid thumbnail refresh
const LIVE_POLL_MS     = 2_000;    // live view frame poll
const TL_ZOOM_STEPS    = [2, 5, 10, 15, 30, 60, 120, 360, 720, 1440]; // minutes

function isLocalUrl(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' ||
           /^10\./.test(h) || /^192\.168\./.test(h) ||
           /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  } catch { return false; }
}

function mediaUrl(entry, camId, params) {
  const id = camId.replace(/[{}]/g, '');
  const p  = new URLSearchParams(params);
  if (isLocalUrl(entry.dw_url)) {
    p.set('auth', entry.auth_param);
    return entry.dw_url + '/media/' + id + '.mp4?' + p.toString();
  }
  p.set('token', entry.media_token);
  return '/api/dw_spectrum/' + entry.entry_id + '/media/' + id + '?' + p.toString();
}

/* ─────────────────────────────────────────────── CSS */
const STYLES = `
:host {
  --bg:      rgba(13,14,18,.96);
  --surf:    rgba(28,30,40,.88);
  --surf2:   rgba(42,45,58,.92);
  --accent:  #4a9eff;
  --accent2: #2877d4;
  --green:   #3ecf6e;
  --red:     #e74c3c;
  --text:    #e8eaf0;
  --text2:   #9ba3b8;
  --border:  rgba(255,255,255,.08);
  --r:       14px;
  --rsm:     9px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--text); display: block;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.card {
  background: var(--bg); border-radius: var(--r); overflow: hidden;
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid var(--border);
  height: var(--dw-card-height, 520px);
  display: flex; flex-direction: column;
}

/* ── Header */
.hdr {
  display:flex; align-items:center; gap:10px;
  padding:13px 16px 10px;
  border-bottom:1px solid var(--border);
  background:rgba(0,0,0,.30);
}
.hdr-title { font-size:15px; font-weight:600; flex:1; letter-spacing:.02em; }
.search-wrap { display:flex; align-items:center; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.2); border-radius:16px; padding:3px 10px; gap:4px; }
.search-wrap svg { width:16px; height:16px; flex-shrink:0; opacity:.6; }
.cam-search { background:transparent; border:none; color:inherit; font-size:13px; outline:none; width:120px; }
.cam-search::placeholder { color:rgba(255,255,255,.4); }
.search-clear { background:none; border:none; color:rgba(255,255,255,.55); cursor:pointer; padding:0 3px; font-size:14px; line-height:1; display:flex; align-items:center; }
.cam-search:placeholder-shown + .search-clear { visibility:hidden; pointer-events:none; }
.srv-sel {
  background:var(--surf2); border:1px solid var(--border);
  color:var(--text); border-radius:8px; padding:5px 10px;
  font-size:13px; cursor:pointer; max-width:200px; outline:none;
}
.srv-sel:focus { border-color:var(--accent); }

/* ── Grid */
.grid-scroll {
  padding:12px; flex:1; overflow-y:auto;
  scrollbar-width:none;
}
.grid-scroll::-webkit-scrollbar { display:none; }
.grid-wrapper { display:flex; flex-direction:column; height:100%; }
.cam-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
.cam-tile {
  position:relative; border-radius:var(--rsm); overflow:hidden;
  cursor:pointer; background:var(--surf); aspect-ratio:16/9;
  border:1px solid var(--border); transition:transform .14s,box-shadow .14s;
}
@media (hover:hover) { .cam-tile:hover { transform:scale(1.025); box-shadow:0 8px 28px rgba(0,0,0,.55); } }
.cam-tile:active { transform:scale(0.97); }
.cam-tile img { width:100%; height:100%; object-fit:cover; display:block; }
.tile-bar {
  position:absolute; bottom:0; left:0; right:0; padding:5px 8px;
  background:linear-gradient(transparent,rgba(0,0,0,.70));
  display:flex; align-items:center; gap:5px;
}
.tile-name { font-size:11px; font-weight:500; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; background:var(--green); }
.dot.offline { background:var(--red); }
.tile-offline {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; letter-spacing:.08em; color:var(--red);
}
.tile-loading {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:12px; color:var(--text2);
  animation:tile-fade 1.4s ease-in-out infinite;
}
@keyframes tile-fade { 0%,100%{opacity:.5} 50%{opacity:1} }
.no-cam { text-align:center; color:var(--text2); padding:40px 20px; font-size:14px; }

/* ── Detail */
.detail { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.topbar {
  display:flex; align-items:center; gap:10px; padding:9px 14px;
  border-bottom:1px solid var(--border); background:rgba(0,0,0,.28);
}
.back-btn {
  background:none; border:none;
  color:var(--text); border-radius:7px; padding:4px;
  cursor:pointer; display:flex; align-items:center;
  transition:opacity .14s;
}
@media (hover:hover) { .back-btn:hover { opacity:.7; } }
.back-btn:active { opacity:.5; }
.back-btn ha-icon { --mdc-icon-size:22px; }
.cam-title { font-size:14px; font-weight:600; flex:1; }

/* Video / live area */
.vid-wrap {
  position:relative; width:100%; background:#000; flex:1; min-height:0;
  display:flex; align-items:center; justify-content:center; overflow:hidden;
  touch-action:none;
}
.arc-video.zoomed, .live-img.zoomed { cursor:grab; }
.arc-video.zoomed:active, .live-img.zoomed:active { cursor:grabbing; }
/* live img */
.live-img { width:100%; height:100%; object-fit:contain; display:none; }
/* archive video */
.arc-video { width:100%; height:100%; display:none; object-fit:contain; }
.mode-badge {
  position:absolute; top:10px; right:10px;
  font-size:11px; font-weight:700; padding:3px 8px; border-radius:4px;
  letter-spacing:.06em;
}
.mode-badge.live    { display:none; }  /* live shown via live-badge */
.mode-badge.archive { background:rgba(74,158,255,.8); display:block; }
.mode-badge.hidden  { display:none; }
.vid-status {
  position:absolute; color:var(--text2); font-size:13px; text-align:center;
  padding:10px; pointer-events:none;
}

/* Timeline */
.tl-section {
  padding:10px 14px 6px;
  background:rgba(0,0,0,.32); border-top:1px solid var(--border);
}
.tl-time { font-size:13px; font-weight:500; letter-spacing:.02em; margin-bottom:7px; }
.tl-wrap {
  position:relative; height:40px;
  background:var(--surf); border-radius:6px; overflow:hidden;
  border:1px solid var(--border); cursor:grab; touch-action:none; user-select:none;
}
.tl-wrap.drag { cursor:grabbing; }
.tl-canvas { position:absolute; inset:0; width:100%; height:100%; }
/* fixed centre line */
.tl-head {
  position:absolute; top:0; bottom:0; left:50%; width:2px;
  background:#fff; pointer-events:none; transform:translateX(-50%);
  box-shadow:0 0 7px rgba(255,255,255,.7);
}

/* Transport */
.transport {
  display:grid; grid-template-columns:1fr auto 1fr; align-items:center;
  padding:10px 14px 6px;
}
.transport-center { display:flex; align-items:center; justify-content:center; gap:8px; }
.transport-right  { display:flex; align-items:center; justify-content:flex-end; }
.tb {
  background:var(--surf2); border:1px solid var(--border); color:var(--text);
  border-radius:8px; width:38px; height:38px;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:background .12s,transform .1s; flex-shrink:0;
}
@media (hover:hover) { .tb:hover { background:var(--accent2); transform:scale(1.08); } }
.tb:active { background:var(--accent2); transform:scale(0.95); }
.tb ha-icon { --mdc-icon-size:20px; }
.tb.primary {
  background:var(--accent); border-color:var(--accent);
  width:46px; height:46px; border-radius:50%;
}
@media (hover:hover) { .tb.primary:hover { background:#3285e0; } }
.tb.primary:active { background:#3285e0; transform:scale(0.95); }
.tb.primary ha-icon { --mdc-icon-size:24px; }
/* LIVE badge — overlaid on video, top-right */
.live-badge {
  position:absolute; top:10px; right:10px; z-index:5;
  background:var(--red); color:#fff; font-size:11px; font-weight:800;
  letter-spacing:.08em; padding:3px 9px; border-radius:5px;
  cursor:pointer; display:none; user-select:none;
}
.live-badge.is-live { display:block; }
/* text-only LIVE button in transport */
.live-text {
  color:var(--red); font-size:13px; font-weight:800; letter-spacing:.08em;
  cursor:pointer; padding:4px 6px; opacity:0.45; transition:opacity .2s;
  user-select:none; background:none; border:none;
}
.live-text.is-live { opacity:1; }
@media (hover:hover) { .live-text:hover { opacity:1; } }
.live-text:active { opacity:1; }
/* audio volume slider */
.vol-wrap { display:flex; align-items:center; gap:8px; overflow:hidden;
  max-width:0; opacity:0; transition:max-width .3s, opacity .3s; }
.vol-wrap.open { max-width:160px; opacity:1; }
.vol-slider {
  -webkit-appearance:none; appearance:none;
  width:120px; height:20px; border-radius:10px;
  background: linear-gradient(to right, var(--accent) 0%, var(--accent) var(--vol-pct, 0%), var(--surf) var(--vol-pct, 0%), var(--surf) 100%);
  outline:none; cursor:pointer; flex-shrink:0;
}
.vol-slider::-webkit-slider-thumb {
  -webkit-appearance:none; appearance:none;
  width:20px; height:20px; border-radius:50%;
  background:var(--accent); cursor:pointer; box-shadow:0 0 4px rgba(0,0,0,.5);
}
.vol-slider::-moz-range-thumb {
  width:20px; height:20px; border-radius:50%; border:none;
  background:var(--accent); cursor:pointer;
}

/* Bottom bar */
.bot-bar {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 14px 14px; gap:8px;
}
.bot-left { display:flex; align-items:center; gap:8px; }
.bot-btn {
  background:var(--surf2); border:1px solid var(--border); color:var(--text);
  border-radius:8px; width:36px; height:36px; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  transition:background .12s, border-color .12s, color .12s;
}
@media (hover:hover) { .bot-btn:hover { background:var(--accent2); border-color:var(--accent); } }
.bot-btn:active { background:var(--accent2); border-color:var(--accent); }
.bot-btn.active { background:var(--accent); border-color:var(--accent); color:#fff; }
.bot-btn ha-icon { --mdc-icon-size:20px; }
.zoom-row { display:flex; align-items:center; gap:4px; }
.zoom-btn {
  background:var(--surf2); border:1px solid var(--border); color:var(--text);
  border-radius:6px; width:28px; height:28px;
  display:flex; align-items:center; justify-content:center;
  cursor:pointer; transition:background .12s;
}
@media (hover:hover) { .zoom-btn:hover { background:var(--accent2); } }
.zoom-btn:active { background:var(--accent2); }
.zoom-btn ha-icon { --mdc-icon-size:16px; }
.zoom-lbl { font-size:11px; color:var(--text2); min-width:42px; text-align:center; }

/* Popups */
.overlay {
  position:fixed; inset:0; z-index:9999;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,.62); backdrop-filter:blur(5px);
}
.overlay.hidden { display:none; }
.popup {
  background:var(--surf); border:1px solid var(--border);
  border-radius:var(--r); padding:20px; width:310px; max-width:95vw;
  box-shadow:0 22px 60px rgba(0,0,0,.65);
}
.pop-title {
  font-size:14px; font-weight:600; margin-bottom:14px;
  display:flex; align-items:center; justify-content:space-between;
}
.pop-close {
  background:none; border:none; color:var(--text2);
  cursor:pointer; display:flex; align-items:center;
}
@media (hover:hover) { .pop-close:hover { color:var(--text); } }
.pop-close:active { color:var(--text); }
.pop-close ha-icon { --mdc-icon-size:20px; }

/* Calendar */
.cal-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.cal-nb {
  background:var(--surf2); border:1px solid var(--border); color:var(--text);
  border-radius:6px; width:28px; height:28px;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
}
@media (hover:hover) { .cal-nb:hover { background:var(--accent2); } }
.cal-nb:active { background:var(--accent2); }
.cal-nb ha-icon { --mdc-icon-size:18px; }
.cal-month { font-size:14px; font-weight:600; }
.cal-grid { display:flex; flex-direction:column; gap:0; margin-bottom:10px; }
.cal-hdr-row { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; margin-bottom:4px; }
.cal-week { display:grid; grid-template-columns:repeat(7,1fr); gap:3px; padding-bottom:3px; margin-bottom:2px; }
.cal-week.has-footage { border-bottom:2px solid #3ecf6e; margin-bottom:0; padding-bottom:1px; }
.cal-week.has-footage-partial { border-bottom:2px solid transparent; margin-bottom:0; padding-bottom:1px;
  border-image:linear-gradient(to right,transparent var(--foot-from,0%),#3ecf6e var(--foot-from,0%),#3ecf6e var(--foot-pct,100%),transparent var(--foot-pct,100%)) 1; }
.cal-day.no-footage { opacity:.35; cursor:default; }
.cal-hdr { text-align:center; font-size:10px; color:var(--text2); font-weight:600; padding:2px 0; }
.cal-day { text-align:center; padding:5px 2px; font-size:12px; cursor:pointer; border-radius:5px; transition:background .1s; }
@media (hover:hover) { .cal-day:hover { background:var(--surf2); } }
.cal-day:active { background:var(--surf2); }
.cal-day.today        { color:var(--accent); font-weight:700; }
.cal-day.selected     { background:var(--accent); color:#fff; }
.cal-day.other-month  { color:var(--text2); opacity:.35; }
.cal-time-row { display:flex; align-items:center; gap:8px; margin-top:4px; }
.cal-tlbl { font-size:12px; color:var(--text2); white-space:nowrap; }
.cal-tin {
  background:var(--surf2); border:1px solid var(--border); color:var(--text);
  border-radius:6px; padding:5px 8px; font-size:13px; width:100%; outline:none;
}
.cal-tin:focus { border-color:var(--accent); }
.cal-go {
  background:var(--accent); border:none; color:#fff;
  border-radius:8px; padding:9px 16px; font-size:13px; font-weight:600;
  cursor:pointer; width:100%; margin-top:10px; transition:background .12s;
}
@media (hover:hover) { .cal-go:hover { background:#3285e0; } }
.cal-go:active { background:#3285e0; }

/* Download */
.dl-opts { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom:12px; }
.dl-opt {
  background:var(--surf2); border:1px solid var(--border); color:var(--text);
  border-radius:8px; padding:11px; text-align:center;
  cursor:pointer; font-size:13px; font-weight:500; transition:background .12s;
}
.dl-opt.sel { background:var(--accent); border-color:var(--accent); }
@media (hover:hover) { .dl-opt:hover { background:var(--accent); border-color:var(--accent); } }
.dl-opt:active { background:var(--accent); border-color:var(--accent); }
.dl-go {
  background:var(--green); border:none; color:#fff;
  border-radius:8px; padding:10px 16px; font-size:13px; font-weight:600;
  cursor:pointer; width:100%; transition:background .12s;
  display:flex; align-items:center; justify-content:center; gap:6px;
}
@media (hover:hover) { .dl-go:hover { background:#2ea852; } }
.dl-go:active { background:#2ea852; }
.dl-go ha-icon { --mdc-icon-size:18px; }
.dl-status { font-size:12px; color:var(--text2); text-align:center; margin-top:8px; min-height:18px; }

/* Spinner */
.spinner {
  display:inline-block; width:18px; height:18px;
  border:2px solid rgba(255,255,255,.15); border-top-color:var(--accent);
  border-radius:50%; animation:spin .6s linear infinite; vertical-align:middle;
}
@keyframes spin { to { transform:rotate(360deg); } }
.loading { display:flex; align-items:center; justify-content:center; padding:40px 20px; gap:10px; color:var(--text2); font-size:13px; }
`;

/* ─────────────────────────────────────────────── Helpers */
const p2      = n  => String(n).padStart(2, "0");
const ic      = i  => `<ha-icon icon="${i}"></ha-icon>`;
const zoomLbl = z  => z >= 60 ? `${z/60}h` : `${z}m`;

function fmtTime(ms) {
  const d = new Date(ms), h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
  const ap = h >= 12 ? "PM" : "AM", h12 = h % 12 || 12;
  return `${p2(h12)}:${p2(m)}:${p2(s)} ${ap}`;
}
function fmtDate(ms) {
  const d   = new Date(ms);
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${mon[d.getMonth()]} ${d.getFullYear()}`;
}
const fmtDT      = ms => `${fmtDate(ms)} / ${fmtTime(ms)}`;
const startOfDay = ms => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };

/* Strip braces from DW camera IDs (e.g. "{767d7492-...}" → "767d7492-...") */
const cleanId = id => String(id||"").trim().replace(/^\{|\}$/g,"");

/* ─────────────────────────────────────────────── Card */
class DwSpectrumPlaybackCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass        = null;
    this._config      = {};
    this._entries     = [];
    this._activeEntry = null;
    this._cameras     = [];
    this._view        = "loading";

    // Grid thumbnails
    this._thumbUrls    = {};
    this._thumbTimer   = null;
    this._thumbLoading = new Set();
    this._gridScrollTop  = 0;       // remembered scroll position
    this._offlineCams    = new Set(); // camera IDs known to be offline
    this._noArchiveCams  = new Set(); // camera IDs confirmed to have no archive

    // Detail state
    this._activeCam      = null;
    this._playheadMs     = Date.now();
    this._mode           = "live";   // "live" | "archive"
    this._isPlaying      = false;
    this._liveTimer      = null;     // interval for JPEG snapshot fallback
    this._liveStreamFail = false;    // true when live stream not supported by this DW build
    this._ignoreVidErr   = false;    // suppress stale video error events during live→archive switch
    this._webrtcPc       = null;     // RTCPeerConnection for live WebRTC
    this._webrtcWs       = null;     // WebSocket for WebRTC signaling
    this._webrtcCamId    = null;     // camera ID of active WebRTC connection
    this._lastVidTime    = 0;
    this._footageStartMs = null;     // earliest footage timestamp for active camera
    this._hasFootage     = false;    // whether camera has any archive
    // Timeline
    this._tlZoom      = 60;
    this._searchQuery = "";
    this._footagePer  = [];
    this._footageCache     = [];     // accumulated footage periods across wider window (avoids re-fetch on scrub-back)
    this._footageLoadTimer = null;   // debounce timer for footage fetch

    this._motionPer        = [];     // motion event periods for orange markers
    this._showMotion       = false;  // toggle orange motion markers on/off (off by default)
    this._motionJumpTimer  = null;   // setTimeout handle for motion-skip playback
    this._dragging    = false;
    this._dragStartX  = 0;
    this._dragStartMs = 0;

    // Calendar
    this._calYear  = new Date().getFullYear();
    this._calMonth = new Date().getMonth();
    this._calSelMs = startOfDay(Date.now());

    // Download
    this._dlMin   = 5;
    this._dlFromMs = 0;   // snapshotted start time when dl dialog opens

    this._render();
  }

  /* ── HA lifecycle */
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) this._loadData();
    else if (this._view === "grid" && this._cameras.length) {
      // Refresh offline states whenever HA pushes a state update
      this._loadOfflineStates();
      // Patch dots and overlays in-place without a full re-render
      for (const cam of this._cameras) {
        const tile = this.shadowRoot.querySelector(`.cam-tile[data-cid="${cam.id}"]`);
        if (!tile) continue;
        const offline = this._offlineCams.has(cam.id);
        const dot = tile.querySelector(".dot");
        if (dot) dot.className = `dot${offline ? " offline" : ""}`;
        let ol = tile.querySelector(".tile-offline");
        if (offline && !ol) {
          ol = document.createElement("div");
          ol.className = "tile-offline";
          ol.textContent = "OFFLINE";
          tile.insertBefore(ol, tile.querySelector(".tile-bar"));
          const img = tile.querySelector("img");
          if (img) img.style.display = "none";
          const ld = tile.querySelector(".tile-loading");
          if (ld) ld.remove();
        } else if (!offline && ol) {
          ol.remove();
        }
      }
    }
  }
  setConfig(c) {
    this._config = c || {};
    if (this._config.default_timeline && [5,10,20,30,45,60].includes(this._config.default_timeline)) {
      this._tlZoom = this._config.default_timeline;
    }
  }
  static getCardSize()       { return 7; }
  static getConfigElement() { return document.createElement("dw-spectrum-playback-card-editor"); }
  static getStubConfig() {
    return { show_download:true, show_calendar:true, show_motion:true, default_timeline:10, default_audio:false, show_search:true, show_badges:true };
  }

  /* ── Data load */
  async _loadData() {
    if (!this._hass) return;
    try {
      const res = await this._hass.callWS({ type: "dw_spectrum/get_info" });
      this._entries = res?.entries || [];
      // If HA is still starting up the integration may not be ready yet — retry after 5s
      if (!this._entries.length || !this._entries[0]?.media_token) {
        setTimeout(() => this._loadData(), 5000);
        if (!this._entries.length) { this._view = "grid"; this._render(); return; }
      }
      const cfgId       = this._config?.entry_id;
      this._activeEntry = (cfgId && this._entries.find(e => e.entry_id === cfgId)) || this._entries[0];
      this._cameras     = this._activeEntry.cameras || [];
      this._view        = "grid";
      this._loadOfflineStates();
      this._render();
      this._startGridThumbs();
    } catch(err) {
      console.error("[DwCard] loadData:", err);
      this._view = "grid"; this._render();
      setTimeout(() => this._loadData(), 5000);
    }
  }

  /* ── Grid thumbnails */
  _startGridThumbs() {
    this._refreshGridThumbs();
    clearInterval(this._thumbTimer);
    this._thumbTimer = setInterval(() => this._refreshGridThumbs(), THUMB_REFRESH_MS);
  }
  _stopGridThumbs() { clearInterval(this._thumbTimer); this._thumbTimer = null; }

  /* Check HA entity states for Recording Status sensors to detect offline cameras */
  _loadOfflineStates() {
    if (!this._hass) return;
    const states = this._hass.states || {};
    this._offlineCams = new Set();
    for (const [entityId, state] of Object.entries(states)) {
      // Entity IDs look like: sensor.dw_spectrum_<cam_name>_recording_status
      if (!entityId.startsWith("sensor.") || !entityId.endsWith("_recording_status")) continue;
      if ((state.state || "").toLowerCase() === "offline") {
        // Match back to a camera by entity attributes or by name slug
        const camName = (state.attributes?.friendly_name || "")
          .replace(/\s*recording status$/i, "").trim().toLowerCase();
        for (const cam of this._cameras) {
          if (cam.name.toLowerCase() === camName) {
            this._offlineCams.add(cam.id);
            break;
          }
        }
      }
    }
  }

  async _refreshGridThumbs() {
    if (!this._hass || !this._activeEntry || this._view !== "grid") return;
    const tok = this._hass.auth?.data?.access_token;
    for (const cam of this._cameras) {
      if (this._thumbLoading.has(cam.id)) continue;
      this._thumbLoading.add(cam.id);
      this._fetchGridThumb(cam.id, tok).finally(() => this._thumbLoading.delete(cam.id));
    }
  }
  async _fetchGridThumb(camId, tok) {
    if (this._offlineCams.has(camId)) return; // skip fetch for offline cameras
    try {
      const id  = cleanId(camId);
      const e = this._activeEntry;
      const url = `/api/dw_spectrum/${e.entry_id}/thumbnail/${id}?token=${e.media_token}`;
      const res = await fetch(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      if (!res.ok) return;
      const blob = await res.blob();
      if (this._thumbUrls[camId]) URL.revokeObjectURL(this._thumbUrls[camId]);
      this._thumbUrls[camId] = URL.createObjectURL(blob);
      const img = this.shadowRoot.querySelector(`img[data-cam="${camId}"]`);
      if (img && !this._offlineCams.has(camId)) {
        img.src = this._thumbUrls[camId];
        img.style.display = "";  // unhide — was hidden while loading overlay showed
        img.closest(".cam-tile")?.querySelector(".tile-loading")?.remove();
      }
    } catch(_) {}
  }

  /* ── Entry switch */
  _switchEntry(id) {
    const e = this._entries.find(x => x.entry_id === id);
    if (!e || e === this._activeEntry) return;
    for (const u of Object.values(this._thumbUrls)) URL.revokeObjectURL(u);
    this._thumbUrls   = {};
    this._activeEntry = e;
    this._cameras     = e.cameras || [];
    this._view        = "grid";
    this._activeCam   = null;
    this._render();
    this._startGridThumbs();
  }

  /* ── Open camera → go live immediately */
  async _openCamera(cam) {
    this._cancelMotionJump();
    this._showMotion     = false;
    // Save scroll position before leaving the grid
    const gs = this.shadowRoot.querySelector(".grid-scroll");
    if (gs) this._gridScrollTop = gs.scrollTop;
    this._searchQuery    = "";     // clear search when entering a camera
    this._stopGridThumbs();
    this._activeCam      = cam;
    this._mode           = "live";
    this._isPlaying      = false;
    this._footagePer     = [];
    this._footageCache   = [];
    this._motionPer      = [];
    this._liveStreamFail = false;   // reset fallback flag for new camera
    this._footageStartMs = null;
    this._hasFootage     = false;
    this._playheadMs     = Date.now();
    this._lastVidTime    = 0;
    this._view = "detail";
    this._render();
    requestAnimationFrame(() => {
      this._startLive();
      this._updateTimeDisplay();
      this._drawTimeline();
    });
    this._fetchFootageRange();
    this._loadFootagePeriods();
  }

  _goBack() {
    this._stopLive();
    this._stopArchiveVideo();
    this._view      = "grid";
    this._activeCam = null;
    this._render();
    this._startGridThumbs();
    // Restore scroll position
    requestAnimationFrame(() => {
      const gs = this.shadowRoot.querySelector(".grid-scroll");
      if (gs) gs.scrollTop = this._gridScrollTop;
    });
  }

  /* ── Footage range — fetch once per camera to know earliest available timestamp */
  async _fetchFootageRange() {
    if (!this._hass || !this._activeEntry || !this._activeCam) return;
    const camId = cleanId(this._activeCam.id);
    try {
      const res = await this._hass.callWS({
        type:      "dw_spectrum/get_footage_range",
        entry_id:  this._activeEntry.entry_id,
        camera_id: camId,
      });
      this._footageStartMs = res?.start_ms ?? null;
      this._hasFootage     = !!this._footageStartMs;
      // Persist no-archive status so the grid can show a red dot
      if (!this._hasFootage && this._activeCam) {
        this._noArchiveCams.add(this._activeCam.id);
      } else if (this._hasFootage && this._activeCam) {
        this._noArchiveCams.delete(this._activeCam.id);
      }
      // Refresh calendar if it's open
      const ol = this.shadowRoot.querySelector(".cal-overlay");
      if (ol && !ol.classList.contains("hidden")) this._renderCalDays();
    } catch(_) {
      this._footageStartMs = null;
      this._hasFootage     = false;
    }
  }

  /* ── Live mode
   *
   * Strategy: try a live video stream from DW's /media/ endpoint with no
   * startTime (same URL the app uses for RTSP, adapted for browser <video>).
   * This starts near-instantly — no 2-second JPEG lag.
   *
   * If this DW build doesn't support the live-stream variant (video "error"
   * event fires while still in live mode), _liveStreamFail is set true and we
   * automatically fall back to the original JPEG snapshot polling.  The flag is
   * reset each time a new camera is opened so the stream is retried.
   */
  _startLive() {
    this._mode = "live";
    clearInterval(this._liveTimer);
    this._liveTimer = null;

    const img = this.shadowRoot.querySelector(".live-img");
    const vid = this.shadowRoot.querySelector(".arc-video");
    if (vid) vid.pause();
    this._isPlaying = false;
    this._setModeBadge("live");
    this._setVidStatus("");

    if (!this._liveStreamFail && this._activeEntry && this._activeCam) {
      // Show video element immediately; WebRTC or MP4 will fill it.
      if (vid) { vid.style.display = "block"; vid.srcObject = null; }
      if (img) img.style.display = "none";
      this._setVidStatus("Connecting…");
      // Try WebRTC first; fall back to MP4 on failure.
      this._startWebRTCOrFallback();
    } else {
      // JPEG polling fallback (no entry yet or stream known to fail).
      if (vid) vid.style.display = "none";
      if (img) img.style.display = "block";
      this._isPlaying = true;
      this._syncPlayBtn();
      this._pollLiveFrame();
      this._liveTimer = setInterval(() => this._pollLiveFrame(), LIVE_POLL_MS);
    }

    clearInterval(this._liveClockTimer);
    this._liveClockTimer = setInterval(() => {
      if (this._mode === "live") {
        this._playheadMs = Date.now();
        this._updateTimeDisplay();
        this._drawTimeline();
      }
    }, 1000);
  }

  _stopLive() {
    clearInterval(this._liveTimer);
    clearInterval(this._liveClockTimer);
    this._liveTimer      = null;
    this._liveClockTimer = null;
    this._stopWebRTC();
    const vid = this.shadowRoot.querySelector(".arc-video");
    if (vid) {
      this._ignoreVidErr = true;
      vid.pause();
    }
  }

  // ── WebRTC live stream ────────────────────────────────────────────────────

  /** Try WebRTC via HA proxy; if anything fails fall back to the MP4 proxy stream. */
  async _startWebRTCOrFallback() {
    const e   = this._activeEntry;
    const cam = this._activeCam;
    if (!e || !cam) return;
    if (this._mode !== "live") return;

    try {
      await this._startWebRTC(e, cam);
    } catch (err) {
      console.debug("[DW WebRTC] fell back to MP4:", err?.message || err);
      if (this._mode === "live") this._startLiveMp4();
    }
  }

  /**
   * Open a WebRTC connection via the HA signaling proxy.
   *
   * Flow:
   *   1. Open WebSocket to HA proxy (/api/dw_spectrum/{entry}/webrtc/{cam}).
   *   2. HA backend obtains a DW ticket and bridges to the DW WebSocket (SSL handled server-side).
   *   3. SDP offer/answer + ICE candidate exchange through the proxy.
   *   4. Attach the media stream to the <video> element.
   */
  async _startWebRTC(entry, cam) {
    const camId = cleanId(cam.id);

    // Build the signaling WebSocket URL via the HA proxy.
    // HA bridges to DW backend (bypassing the self-signed SSL cert issue).
    const haOrigin = window.location.origin;
    const wsProto  = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl    = `${wsProto}//${window.location.host}/api/dw_spectrum/${entry.entry_id}/webrtc/${camId}?token=${entry.media_token}`;

    // Tear down any previous connection then open the proxy WebSocket.
    this._stopWebRTC();
    this._webrtcCamId = camId;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this._webrtcWs = ws;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      this._webrtcPc = pc;

      // Receive remote video track → put on <video>.
      pc.ontrack = (evt) => {
        const vid = this.shadowRoot.querySelector(".arc-video");
        if (vid && evt.streams && evt.streams[0]) {
          vid.srcObject = evt.streams[0];
          vid.muted = !this._config?.default_audio;
          vid.play().catch(() => {});
          this._setVidStatus("");
          this._isPlaying = true;
          this._syncPlayBtn();
          resolve();
        }
      };

      // Send our ICE candidates to DW.
      pc.onicecandidate = (evt) => {
        if (evt.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ ice: evt.candidate.toJSON() }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          reject(new Error("WebRTC connection failed"));
        }
      };

      ws.onopen = async () => {
        try {
          // Tell DW we want to receive video (and audio if available).
          pc.addTransceiver("video", { direction: "recvonly" });
          pc.addTransceiver("audio", { direction: "recvonly" });

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ sdp: { type: offer.type, sdp: offer.sdp } }));
        } catch (err) {
          reject(err);
        }
      };

      ws.onmessage = async (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.sdp) {
            // DW sends an answer (or sometimes an offer — handle both).
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            if (msg.sdp.type === "offer") {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify({ sdp: { type: answer.type, sdp: answer.sdp } }));
            }
          } else if (msg.ice) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.ice));
          } else if (msg.error) {
            reject(new Error(`DW WebRTC error: ${JSON.stringify(msg.error)}`));
          }
        } catch (err) {
          reject(err);
        }
      };

      ws.onerror = () => reject(new Error("WebRTC signaling WebSocket error"));
      ws.onclose = (evt) => {
        if (pc.connectionState !== "connected") {
          reject(new Error(`WebRTC WS closed: ${evt.code}`));
        }
      };

      // Timeout if no track arrives within 8 seconds.
      setTimeout(() => reject(new Error("WebRTC timeout")), 8000);
    });
  }

  /** Ask HA backend for a short-lived DW ticket for WebRTC auth. */
  _fetchWebRtcTicket(entryId) {
    return new Promise((resolve, reject) => {
      if (!this._hass) { reject(new Error("no hass")); return; }
      this._hass.connection.sendMessagePromise({
        type: "dw_spectrum/get_webrtc_ticket",
        entry_id: entryId,
      }).then((res) => {
        if (res && res.ticket) resolve(res.ticket);
        else reject(new Error("no ticket in response"));
      }).catch(reject);
    });
  }

  /** Stop and clean up any active WebRTC connection. */
  _stopWebRTC() {
    if (this._webrtcWs) {
      try { this._webrtcWs.close(); } catch (_) {}
      this._webrtcWs = null;
    }
    if (this._webrtcPc) {
      try {
        this._webrtcPc.getSenders().forEach(s => { try { s.track?.stop(); } catch(_){} });
        this._webrtcPc.close();
      } catch (_) {}
      this._webrtcPc = null;
    }
    this._webrtcCamId = null;
    // Always mute and clear srcObject for a clean handoff to MP4.
    const vid = this.shadowRoot.querySelector(".arc-video");
    if (vid) {
      try { vid.pause(); } catch(_) {}
      if (vid.srcObject) { vid.srcObject = null; }
      // mute will be set by caller based on config
    }
  }

  /** MP4 proxy stream (existing path, extracted for clarity). */
  _startLiveMp4() {
    if (this._mode !== "live" || !this._activeEntry || !this._activeCam) return;
    const e  = this._activeEntry;
    const id = cleanId(this._activeCam.id);
    const vid = this.shadowRoot.querySelector(".arc-video");
    if (!vid) return;
    vid.srcObject = null;
    vid.src = `/api/dw_spectrum/${e.entry_id}/media/${id}?token=${e.media_token}&stream=1`;
    vid.load();
    vid.play().catch(() => {});
  }

  async _pollLiveFrame() {
    if (!this._hass || !this._activeEntry || !this._activeCam) return;
    if (this._mode !== "live") return;
    try {
      const tok = this._hass.auth?.data?.access_token;
      const id  = cleanId(this._activeCam.id);
      const e2 = this._activeEntry;
      const url = `/api/dw_spectrum/${e2.entry_id}/thumbnail/${id}?token=${e2.media_token}&_t=${Date.now()}`;
      const res = await fetch(url, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      if (!res.ok) return;
      const blob = await res.blob();
      const burl  = URL.createObjectURL(blob);
      if (this._mode !== "live") { URL.revokeObjectURL(burl); return; }
      const img   = this.shadowRoot.querySelector(".live-img");
      if (img) {
        const old = img.src;
        img.src   = burl;
        if (old && old.startsWith("blob:")) URL.revokeObjectURL(old);
      }
      this._setVidStatus("");
    } catch(_) {}
  }

  /* ── Archive mode (MP4 via DW media endpoint) */
  _playAt(ms) {
    this._stopLive();
    this._mode        = "archive";
    this._playheadMs  = ms;
    this._isPlaying   = true;
    this._lastVidTime = 0;
    this._setModeBadge("archive");
    this._syncPlayBtn();

    const img = this.shadowRoot.querySelector(".live-img");
    const vid = this.shadowRoot.querySelector(".arc-video");
    if (img) img.style.display = "none";
    if (vid) vid.style.display = "block";
    if (!vid || !this._activeEntry || !this._activeCam) return;

    const e   = this._activeEntry;
    const id  = cleanId(this._activeCam.id);
    // Proxy through HA — avoids SSL cert errors with self-signed DW certs and CORS issues.
    // pos=<ms> is DW's seek parameter; stream=1 = sub-stream; no duration = plays continuously.
    const url = `/api/dw_spectrum/${e.entry_id}/media/${id}?token=${e.media_token}&pos=${ms}&stream=1`;

    this._setVidStatus("Loading…");
    vid.muted  = !this._config?.default_audio;
    vid.volume = this._config?.default_audio ? (vid.volume || 0.8) : 0;
    vid.src = url;
    vid.load();
    vid.play().catch(() => {});
    this._drawTimeline();
  }

  _stopArchiveVideo() {
    const vid = this.shadowRoot.querySelector(".arc-video");
    if (vid) { vid.pause(); vid.src = ""; }
    this._isPlaying = false;
  }

  _togglePlay() {
    if (this._mode === "live") {
      if (this._isPlaying) {
        this._stopLive(); this._isPlaying = false; this._syncPlayBtn();
        const img = this.shadowRoot.querySelector(".live-img");
        if (img) img.style.display = "none";
      } else {
        this._startLive();
      }
    } else {
      const vid = this.shadowRoot.querySelector(".arc-video");
      if (!vid) return;
      if (this._isPlaying) {
        vid.pause(); this._isPlaying = false;
      } else {
        vid.play().catch(() => {}); this._isPlaying = true;
      }
      this._syncPlayBtn();
    }
  }

  _seekRelative(ds) {
    this._cancelMotionJump();
    const ms = (this._mode === "live" ? Date.now() : this._playheadMs) + ds * 1000;
    this._playAt(ms);
    this._loadFootagePeriods();
    if (this._showMotion) this._motionJumpStep();
  }

  _syncPlayBtn() {
    const btn = this.shadowRoot.querySelector(".play-btn");
    if (btn) btn.innerHTML = ic(this._isPlaying ? "mdi:pause" : "mdi:play");
  }

  _setModeBadge(mode) {
    const b = this.shadowRoot.querySelector(".mode-badge");
    if (!b) return;
    const show = this._config?.show_badges !== false;
    b.className = `mode-badge ${show ? mode : "hidden"}`;
    b.textContent = mode.toUpperCase();
    this._syncLiveBadge();
  }

  _setVidStatus(msg) {
    const el = this.shadowRoot.querySelector(".vid-status");
    if (el) el.textContent = msg;
  }

  _toggleMotion() {
    this._showMotion = !this._showMotion;
    const btn = this.shadowRoot.querySelector(".btn-motion");
    if (btn) btn.classList.toggle("active", this._showMotion);
    this._drawTimeline();

    if (this._showMotion) {
      // Jump to the nearest upcoming motion event and start skipping
      this._motionJumpStep();
    } else {
      // Cancel any pending jump
      this._cancelMotionJump();
    }
  }

  /* Cancel the pending motion-jump timer */
  _cancelMotionJump() {
    if (this._motionJumpTimer) {
      clearTimeout(this._motionJumpTimer);
      this._motionJumpTimer = null;
    }
  }

  /* Find the next motion period at or after `fromMs`. Returns the period or null. */
  _nextMotionPeriod(fromMs) {
    // _motionPer covers the current timeline window — may need a wider fetch
    const sorted = [...this._motionPer].sort((a, b) => a.startMs - b.startMs);
    // Find the first period that hasn't ended yet
    return sorted.find(p => p.endMs > fromMs) || null;
  }

  /* Called when motion mode is active to jump to next motion and schedule next skip.
     Searches in expanding windows with no hard limit — silently waits if no motion found. */
  async _motionJumpStep() {
    if (!this._showMotion) return;

    // In live mode: show motion on timeline but don't switch to archive.
    if (this._mode === "live") {
      this._drawTimeline();
      return;
    }

    const now = this._playheadMs;

    // Search in expanding windows: 15min → 1hr → 4hr → 24hr → keep doubling
    const windows = [15, 60, 240, 1440];
    for (const mins of windows) {
      if (!this._showMotion) return;
      await this._ensureMotionPeriods(now, now + mins * 60 * 1000);
      const next = this._nextMotionPeriod(now);
      if (next) return this._jumpToMotion(next, now);
    }

    // Nothing in 24hr window — silently do nothing, motion button stays on.
    // The user can drag the timeline to a different position and motion will resume.
  }

  /* Play a motion period. If fromMs is inside the period, play from there (don't seek back).
     If fromMs is before the period, seek to slightly before its start. */
  _jumpToMotion(period, fromMs) {
    if (!this._showMotion) return;

    const alreadyInside = fromMs != null && fromMs >= period.startMs && fromMs < period.endMs;
    if (alreadyInside) {
      // User dragged into the middle of a motion clip — play from current position
      this._playAt(fromMs);
    } else {
      // Jump to 200ms before motion starts
      this._playAt(period.startMs - 200);
    }
    this._loadFootagePeriods();

    // How long until this motion clip ends from the current playback position
    const playFrom = alreadyInside ? fromMs : period.startMs;
    const remainingMs = period.endMs - playFrom;
    this._cancelMotionJump();
    this._motionJumpTimer = setTimeout(() => {
      if (!this._showMotion) return;
      this._playheadMs = period.endMs + 100;
      this._motionJumpStep();
    }, remainingMs + 300);
  }

  /* Fetch motion periods for a specific range, merging into _motionPer */
  async _ensureMotionPeriods(startMs, endMs) {
    if (!this._hass || !this._activeEntry || !this._activeCam) return;
    try {
      const res = await this._hass.callWS({
        type:      "dw_spectrum/get_motion_periods",
        entry_id:  this._activeEntry.entry_id,
        camera_id: cleanId(this._activeCam.id),
        start_ms:  Math.floor(startMs),
        end_ms:    Math.floor(endMs),
      });
      const fresh = res?.periods || [];
      // Merge with existing, deduplicate by startMs
      const merged = [...this._motionPer, ...fresh];
      const seen = new Set();
      this._motionPer = merged.filter(p => {
        if (seen.has(p.startMs)) return false;
        seen.add(p.startMs);
        return true;
      }).sort((a, b) => a.startMs - b.startMs);
      this._drawTimeline();
    } catch(_) {}
  }

  /* ── Timeline (slides; playhead fixed at centre) */
  _drawTimeline() {
    const canvas = this.shadowRoot.querySelector(".tl-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W   = canvas.offsetWidth  || 400;
    const H   = canvas.offsetHeight || 40;
    canvas.width  = W;
    canvas.height = H;

    const windowMs = this._tlZoom * 60000;
    const startMs  = this._playheadMs - windowMs / 2;
    const endMs    = startMs + windowMs;

    // Dark background
    ctx.fillStyle = "rgba(20,22,30,1)";
    ctx.fillRect(0, 0, W, H);

    // ── Bottom recording strip (like DW Spectrum app)
    // Dark trough = entire width at bottom
    const STRIP_Y = H - 8;
    ctx.fillStyle = "rgba(255,255,255,.07)";
    ctx.fillRect(0, STRIP_Y, W, 8);

    // Green segments = recorded footage (only where footage exists)
    // Cap endMs at now so the green bar never extends into the future.
    // Draw from the accumulated cache so scrubbing back is instant (no re-fetch lag).
    const nowMs = Date.now();
    const visibleFootage = this._footageCache.length
      ? this._footageCache.filter(p => p.endMs > startMs && p.startMs < endMs)
      : this._footagePer;
    for (const p of visibleFootage) {
      const cappedEnd = Math.min(p.endMs, nowMs);
      const x1 = Math.max(0, ((p.startMs  - startMs) / windowMs) * W);
      const x2 = Math.min(W, ((cappedEnd  - startMs) / windowMs) * W);
      if (x2 <= x1) continue;
      // Subtle glow above the strip for recorded areas
      ctx.fillStyle = "rgba(62,207,110,.10)";
      ctx.fillRect(x1, STRIP_Y - 16, x2 - x1, 16);
      // Solid green bottom strip
      ctx.fillStyle = "#3ecf6e";
      ctx.fillRect(x1, STRIP_Y, x2 - x1, 8);
    }

    // Orange segments = motion (overlaid on green strip, only when enabled)
    if (this._showMotion) {
      for (const p of this._motionPer) {
        const x1 = Math.max(0, ((p.startMs - startMs) / windowMs) * W);
        const x2 = Math.min(W, ((p.endMs   - startMs) / windowMs) * W);
        if (x2 <= x1) continue;
        const w = Math.max(x2 - x1, 2);
        // Subtle orange glow above strip
        ctx.fillStyle = "rgba(255,140,0,.18)";
        ctx.fillRect(x1, STRIP_Y - 16, w, 16);
        // Orange stripe on top of green (motion within recording)
        ctx.fillStyle = "#ff8c00";
        ctx.fillRect(x1, STRIP_Y, w, 8);
      }
    }

    // Time tick marks and labels
    const stepMin = this._tlZoom <= 5 ? 1 : this._tlZoom <= 15 ? 5 : this._tlZoom <= 60 ? 10 : 30;
    const stepMs  = stepMin * 60000;
    const first   = Math.ceil(startMs / stepMs) * stepMs;
    ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1;
    ctx.fillStyle   = "rgba(255,255,255,.35)"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
    for (let t = first; t <= endMs; t += stepMs) {
      const x = ((t - startMs) / windowMs) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, STRIP_Y - 2); ctx.stroke();
      const d = new Date(t);
      ctx.fillText(`${p2(d.getHours())}:${p2(d.getMinutes())}`, x, STRIP_Y - 4);
    }
  }

  _updateTimeDisplay() {
    const el = this.shadowRoot.querySelector(".tl-time");
    if (el) el.textContent = fmtDT(this._playheadMs);
  }

  /* Drag = slide timeline */
  _dragStart(x) {
    this._dragging    = true;
    this._dragStartX  = x;
    this._dragStartMs = this._playheadMs;
    this.shadowRoot.querySelector(".tl-wrap")?.classList.add("drag");
  }
  _dragMove(x) {
    if (!this._dragging) return;
    const tw = this.shadowRoot.querySelector(".tl-wrap");
    if (!tw) return;
    const W  = tw.offsetWidth || 400;
    this._playheadMs = this._dragStartMs - ((x - this._dragStartX) / W) * (this._tlZoom * 60000);
    this._updateTimeDisplay();
    this._drawTimeline();
  }
  _dragEnd(x) {
    if (!this._dragging) return;
    this._dragging = false;
    this.shadowRoot.querySelector(".tl-wrap")?.classList.remove("drag");
    this._dragMove(x);
    this._cancelMotionJump(); // cancel current pending jump before seeking
    this._playAt(this._playheadMs);
    // Debounce fetch — cache already covers the visible area for smooth scrubbing.
    // A full fetch fires 250ms after the user lifts their finger/mouse.
    this._scheduleFootageLoad();
    // If motion mode is on, resume jumping from the new position
    if (this._showMotion) this._motionJumpStep();
  }

  _zoomTL(dir) {
    const idx  = TL_ZOOM_STEPS.indexOf(this._tlZoom);
    const next = TL_ZOOM_STEPS[Math.max(0, Math.min(TL_ZOOM_STEPS.length-1, idx+dir))];
    if (next === this._tlZoom) return;
    this._tlZoom = next;
    this._drawTimeline();
    this._loadFootagePeriods();
    const lbl = this.shadowRoot.querySelector(".zoom-lbl");
    if (lbl) lbl.textContent = zoomLbl(next);
  }

  /* Schedule a debounced footage fetch — used during drag so rapid back/forth
     doesn't hammer the server while the cache already covers the visible window. */
  _scheduleFootageLoad() {
    clearTimeout(this._footageLoadTimer);
    this._footageLoadTimer = setTimeout(() => this._loadFootagePeriods(), 250);
  }

  /* Footage + motion periods */
  async _loadFootagePeriods() {
    if (!this._hass || !this._activeEntry || !this._activeCam) return;
    // Fetch 3× the visible window so scrubbing back/forth hits the cache immediately.
    const windowMs = this._tlZoom * 60000;
    const fetchMs  = windowMs * 3;
    const startMs  = this._playheadMs - fetchMs / 2;
    const endMs    = Math.floor(startMs + fetchMs);
    const camId    = cleanId(this._activeCam.id);
    try {
      const res = await this._hass.callWS({
        type:      "dw_spectrum/get_footage_periods",
        entry_id:  this._activeEntry.entry_id,
        camera_id: camId,
        start_ms:  Math.floor(startMs),
        end_ms:    endMs,
      });
      const fresh = res?.periods || [];
      // Merge into the accumulated cache (dedup by startMs+endMs so re-fetching the same
      // area doesn't bloat memory — footage periods don't change retroactively).
      const all  = [...this._footageCache, ...fresh];
      const seen = new Set();
      this._footageCache = all.filter(p => {
        const key = `${p.startMs}_${p.endMs}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => a.startMs - b.startMs);
      // Keep _footagePer as the exact-window slice for anything that references it directly.
      this._footagePer = fresh;
      this._drawTimeline();
    } catch(err) { console.warn("[DwCard] footage periods:", err); }
    // Load motion periods in parallel (non-blocking — failure just means no orange markers)
    this._loadMotionPeriods(camId, Math.floor(startMs), endMs);
  }

  /* Efficiently patch just the last 3 minutes of the timeline with fresh data.
     Only merges/extends the trailing segment so the full window doesn't need a round-trip. */
  async _loadMotionPeriods(camId, startMs, endMs) {
    if (!this._hass || !this._activeEntry) return;
    try {
      const res = await this._hass.callWS({
        type:      "dw_spectrum/get_motion_periods",
        entry_id:  this._activeEntry.entry_id,
        camera_id: camId,
        start_ms:  startMs,
        end_ms:    endMs,
      });
      this._motionPer = res?.periods || [];
      this._drawTimeline();
    } catch(_) {
      // Motion events not available on this DW build — silently skip
      this._motionPer = [];
    }
  }

  /* ── Calendar */
  _openCal() {
    const ol = this.shadowRoot.querySelector(".cal-overlay");
    if (!ol) return;
    const d = new Date(this._playheadMs);
    this._calYear  = d.getFullYear();
    this._calMonth = d.getMonth();
    this._calSelMs = startOfDay(this._playheadMs);
    ol.classList.remove("hidden");
    this._renderCalDays();
    const ti = ol.querySelector(".cal-tin");
    if (ti) ti.value = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  }
  _closeCal() { this.shadowRoot.querySelector(".cal-overlay")?.classList.add("hidden"); }
  _renderCalDays() {
    const ol = this.shadowRoot.querySelector(".cal-overlay");
    if (!ol) return;
    const grid = ol.querySelector(".cal-grid-body");
    const mlbl = ol.querySelector(".cal-month");
    const MONS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    if (mlbl) mlbl.textContent = `${MONS[this._calMonth]} ${this._calYear}`;
    if (!grid) return;

    const today        = startOfDay(Date.now());
    const footageStart = this._footageStartMs ? startOfDay(this._footageStartMs) : null;
    const firstWd      = new Date(this._calYear, this._calMonth, 1).getDay();
    const daysInMonth  = new Date(this._calYear, this._calMonth+1, 0).getDate();

    // Build flat array of cells (null = blank, number = day)
    const cells = [];
    for (let i = 0; i < firstWd; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    // Group into weeks of 7
    let html = "";
    for (let w = 0; w < Math.ceil(cells.length / 7); w++) {
      const week = cells.slice(w * 7, w * 7 + 7);
      // Find first and last column in this week that have footage (same logic as no-footage opacity)
      let firstFoot = -1, lastFoot = -1;
      week.forEach((d, i) => {
        if (!d) return;
        const ms = new Date(this._calYear, this._calMonth, d).getTime();
        if (footageStart !== null && ms >= footageStart && ms <= today) {
          if (firstFoot === -1) firstFoot = i;
          lastFoot = i;
        }
      });

      let weekCls = "cal-week";
      let weekStyle = "";
      if (firstFoot !== -1) {
        const fromPct = Math.round(firstFoot / 7 * 100);
        const toPct   = Math.round((lastFoot + 1) / 7 * 100);
        if (fromPct === 0 && toPct === 100) {
          weekCls += " has-footage";
        } else {
          weekCls += " has-footage-partial";
          weekStyle = ` style="--foot-from:${fromPct}%;--foot-pct:${toPct}%"`;
        }
      }
      html += `<div class="${weekCls}"${weekStyle}>`;
      for (const d of week) {
        if (!d) { html += `<div class="cal-day other-month"></div>`; continue; }
        const ms       = new Date(this._calYear, this._calMonth, d).getTime();
        const hasFoot  = footageStart !== null && ms >= footageStart && ms <= today;
        const cls = ["cal-day",
          ms === today             ? "today"      : "",
          ms === this._calSelMs    ? "selected"   : "",
          !hasFoot && footageStart ? "no-footage" : "",
        ].filter(Boolean).join(" ");
        html += `<div class="${cls}" data-ms="${ms}">${d}</div>`;
      }
      html += `</div>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll(".cal-day[data-ms]:not(.no-footage)").forEach(el =>
      el.addEventListener("click", () => { this._calSelMs = +el.dataset.ms; this._renderCalDays(); })
    );
  }
  _applyCal() {
    const ol = this.shadowRoot.querySelector(".cal-overlay");
    if (!ol) return;
    const ti = ol.querySelector(".cal-tin");
    let tMs = 0;
    if (ti?.value) {
      const [hh,mm,ss] = ti.value.split(":").map(Number);
      tMs = ((hh||0)*3600+(mm||0)*60+(ss||0))*1000;
    }
    this._playheadMs = this._calSelMs + tMs;
    this._updateTimeDisplay();
    this._closeCal();
    this._playAt(this._playheadMs);
    this._loadFootagePeriods();
  }

  /* ── Download */
  _openDl() {
    const ol = this.shadowRoot.querySelector(".dl-overlay");
    if (!ol) return;
    // Snapshot the position NOW — don't let it drift while dialog is open.
    // For live mode we store "now" and subtract the chosen duration at download time
    // so the clip covers the LAST N minutes ending at now (not starting at now).
    this._dlSnapMs = Date.now();
    this._dlIsLive = this._mode === "live";
    const fromDisplay = this._dlIsLive ? (this._dlSnapMs - (this._dlMin * 60 * 1000)) : this._playheadMs;
    this._dlFromMs = fromDisplay;
    const st = ol.querySelector(".dl-start");
    if (st) st.textContent = fmtDT(fromDisplay);
    ol.querySelector(".dl-status").textContent = "";
    ol.classList.remove("hidden");
  }
  _closeDl() { this.shadowRoot.querySelector(".dl-overlay")?.classList.add("hidden"); }
  _startDl() {
    if (!this._activeEntry || !this._activeCam) return;
    const e      = this._activeEntry;
    const id     = cleanId(this._activeCam.id);
    const from   = Math.floor(this._dlFromMs || (this._mode === "live" ? Date.now() : this._playheadMs));
    const durMs  = this._dlMin * 60 * 1000;    // durationMs in milliseconds (matches DW app)
    // Use same REST v3 params the DW mobile app uses: positionMs + durationMs
    const url    = `/api/dw_spectrum/${e.entry_id}/media/${id}?token=${e.media_token}&type=download&positionMs=${from}&durationMs=${durMs}`;
    const status = this.shadowRoot.querySelector(".dl-status");

    // Let the browser handle the download natively via a direct link.
    // The HA proxy streams chunks immediately (Content-Disposition: attachment),
    // so the browser shows its own download progress bar without us buffering
    // the whole clip in JS memory first — no more 524 gateway timeouts.
    const a = document.createElement("a");
    a.href = url;
    // filename hint — server's Content-Disposition takes precedence in most browsers
    a.download = `footage_${id}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    status.textContent = "Download started — check your browser downloads.";
    setTimeout(() => this._closeDl(), 3000);
  }

  /* ── Render */
  _render() {
    const root = this.shadowRoot;
    root.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = STYLES;
    root.appendChild(style);
    const card = document.createElement("div");
    card.className = "card";
    if      (this._view === "loading") card.innerHTML = `<div class="loading"><span class="spinner"></span>&nbsp;Connecting…</div>`;
    else if (this._view === "grid")    card.appendChild(this._buildGrid());
    else {
      card.appendChild(this._buildDetail());
      card.appendChild(this._buildCalPopup());
      card.appendChild(this._buildDlPopup());
    }
    root.appendChild(card);
    if (this._view === "detail") this._bindDetail();
  }

  /* ── Grid */
  _buildGrid() {
    const wrap  = document.createElement("div");
    const multi = this._entries.length > 1;
    const selH  = multi ? `<select class="srv-sel">${this._entries.map(e=>
      `<option value="${e.entry_id}"${e===this._activeEntry?" selected":""}>${e.title}</option>`).join("")}</select>` : "";
    wrap.className = "grid-wrapper";
    wrap.innerHTML = `
      <div class="hdr"><span class="hdr-title">DW Spectrum</span>${selH}${this._config?.show_search!==false?`<div class="search-wrap">${ic("mdi:magnify")}<input class="cam-search" type="text" placeholder="Search cameras…" value="${this._searchQuery||""}"><button class="search-clear" aria-label="Clear">✕</button></div>`:""}</div>
      <div class="grid-scroll">
        ${(()=>{ const q=(this._searchQuery||"").toLowerCase(); const cams=q?this._cameras.filter(c=>c.name.toLowerCase().includes(q)):this._cameras; return cams.length===0?`<div class="no-cam">No cameras found.</div>`:`<div class="cam-grid">${cams.map(c=>this._tileHtml(c)).join("")}</div>`; })()}
      </div>`;
    if (multi) wrap.querySelector(".srv-sel").addEventListener("change", e => this._switchEntry(e.target.value));
    wrap.querySelectorAll(".cam-tile").forEach(t =>
      t.addEventListener("click", () => {
        const cam = this._cameras.find(c => c.id === t.dataset.cid);
        if (cam) this._openCamera(cam);
      })
    );
    // Use delegation — clear button only exists in DOM when query is non-empty
    wrap.addEventListener("click", e => {
      if (e.target.closest(".search-clear")) {
        this._searchQuery = "";
        this._render();
      }
    });
    const srch = wrap.querySelector(".cam-search");
    if (srch) {
      srch.addEventListener("input", e => {
        this._searchQuery = e.target.value;
        // Update grid in-place — no full re-render so focus is never lost.
        const scroll = wrap.querySelector(".grid-scroll");
        if (scroll) {
          const q = this._searchQuery.toLowerCase();
          const cams = q ? this._cameras.filter(c => c.name.toLowerCase().includes(q)) : this._cameras;
          scroll.innerHTML = cams.length === 0
            ? `<div class="no-cam">No cameras found.</div>`
            : `<div class="cam-grid">${cams.map(c => this._tileHtml(c)).join("")}</div>`;
          scroll.querySelectorAll(".cam-tile").forEach(t =>
            t.addEventListener("click", () => {
              const cam = this._cameras.find(c => c.id === t.dataset.cid);
              if (cam) this._openCamera(cam);
            })
          );
        }
      });
    }
    return wrap;
  }
  _tileHtml(cam) {
    const src       = this._thumbUrls[cam.id] || "";
    const offline   = this._offlineCams.has(cam.id);
    const loading   = !src && !offline;
    return `<div class="cam-tile" data-cid="${cam.id}">
      <img data-cam="${cam.id}" src="${src}" alt="${cam.name}" style="${src&&!offline?"":"display:none"}">
      ${loading  ? `<div class="tile-loading">Loading…</div>` : ""}
      ${offline  ? `<div class="tile-offline">OFFLINE</div>` : ""}
      <div class="tile-bar">
        <span class="dot${offline?" offline":""}"></span>
        <span class="tile-name">${cam.name}</span>
      </div>
    </div>`;
  }

  /* ── Detail */
  _buildDetail() {
    const cam  = this._activeCam;
    const wrap = document.createElement("div");
    wrap.className = "detail";
    wrap.innerHTML = `
      <div class="topbar">
        <button class="back-btn">${ic("mdi:arrow-left")}</button>
        <span class="cam-title">${cam?.name||""}</span>
      </div>
      <div class="vid-wrap">
        <img  class="live-img" alt="live">
        <video class="arc-video" playsinline preload="none"></video>
        <div class="live-badge${this._mode==="live"?" is-live":""}">LIVE</div>
        <div class="mode-badge hidden"></div>
        <div class="vid-status"></div>
      </div>
      <div class="tl-section">
        <div class="tl-time">${fmtDT(this._playheadMs)}</div>
        <div class="tl-wrap"><canvas class="tl-canvas"></canvas><div class="tl-head"></div></div>
      </div>
      <div class="transport">
        <div></div>
        <div class="transport-center">
          <button class="tb seek-back" title="−30s">${ic("mdi:rewind-30")}</button>
          <button class="tb primary play-btn">${ic("mdi:play")}</button>
          <button class="tb seek-fwd"  title="+30s">${ic("mdi:fast-forward-30")}</button>
        </div>
        <div class="transport-right">
          <button class="live-text${this._mode==="live"?" is-live":""}">LIVE</button>
        </div>
      </div>
      <div class="bot-bar">
        <div class="bot-left">
          ${this._config?.show_motion!==false?`<button class="bot-btn btn-motion${this._showMotion?" active":""}" title="Toggle motion markers">${ic("mdi:motion-sensor")}</button>`:""}
          ${this._config?.show_calendar!==false?`<button class="bot-btn btn-cal" title="Calendar">${ic("mdi:calendar")}</button>`:""}
          ${this._config?.show_download!==false?`<button class="bot-btn btn-dl" title="Download">${ic("mdi:download")}</button>`:""}
          <button class="bot-btn btn-vol" title="Volume">${ic("mdi:volume-high")}</button>
          <div class="vol-wrap"><input class="vol-slider" type="range" min="0" max="1" step="0.05" value="${this._config?.default_audio?1:0}"></div>
        </div>
        <div class="zoom-row">
          <button class="zoom-btn zoom-out">${ic("mdi:minus")}</button>
          <span class="zoom-lbl">${zoomLbl(this._tlZoom)}</span>
          <button class="zoom-btn zoom-in">${ic("mdi:plus")}</button>
        </div>
      </div>`;
    return wrap;
  }

  _syncLiveBadge() {
    const isLive = this._mode === "live";
    this.shadowRoot?.querySelector(".live-badge")?.classList.toggle("is-live", isLive);
    this.shadowRoot?.querySelector(".live-text") ?.classList.toggle("is-live", isLive);
  }

  _bindPinchZoom(wrap) {
    if (!wrap) return;
    // Persistent state — survives lifting all fingers
    let scale = 1, tx = 0, ty = 0;

    // Pinch state
    let pinchDist = 0, pinchScale = 1, pinchTx = 0, pinchTy = 0, pinchMx = 0, pinchMy = 0;
    let wasPinching = false;  // prevents 2-finger lift being mistaken for double-tap

    // Pan state — updated on every single-finger touchstart AND on 2→1 transition
    let panX = 0, panY = 0;  // offset from touch point to current tx/ty

    const target = () => wrap.querySelector(".arc-video") || wrap.querySelector(".live-img");

    const applyTransform = () => {
      const el = target();
      if (!el) return;
      el.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      el.style.transformOrigin = "center center";
      el.classList.toggle("zoomed", scale > 1.05);
    };

    const clamp = () => {
      if (scale <= 1) { tx = 0; ty = 0; return; }
      const maxX = (wrap.clientWidth  * (scale - 1)) / 2;
      const maxY = (wrap.clientHeight * (scale - 1)) / 2;
      tx = Math.max(-maxX, Math.min(maxX, tx));
      ty = Math.max(-maxY, Math.min(maxY, ty));
    };

    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid  = t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    wrap.addEventListener("touchstart", e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        // Begin pinch — snapshot current transform
        wasPinching = true;
        pinchDist  = dist(e.touches);
        pinchScale = scale;
        pinchTx = tx; pinchTy = ty;
        const m = mid(e.touches);
        pinchMx = m.x; pinchMy = m.y;
      } else if (e.touches.length === 1 && scale > 1) {
        // Single finger start — capture offset so pan is relative
        panX = e.touches[0].clientX - tx;
        panY = e.touches[0].clientY - ty;
      }
    }, { passive: false });

    wrap.addEventListener("touchmove", e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const d = dist(e.touches);
        scale = Math.max(1, Math.min(6, pinchScale * (d / pinchDist)));
        const m = mid(e.touches);
        tx = pinchTx + (m.x - pinchMx);
        ty = pinchTy + (m.y - pinchMy);
        clamp(); applyTransform();
      } else if (e.touches.length === 1 && scale > 1) {
        // Pan — works whether user kept 1 finger down during pinch or put it back after
        tx = e.touches[0].clientX - panX;
        ty = e.touches[0].clientY - panY;
        clamp(); applyTransform();
      }
    }, { passive: false });

    // touchend: recapture pan origin when going 2→1, double-tap to reset
    let lastTap = 0;
    wrap.addEventListener("touchend", e => {
      if (e.touches.length === 1 && scale > 1) {
        // One finger remaining after pinch — recapture pan origin for that finger
        panX = e.touches[0].clientX - tx;
        panY = e.touches[0].clientY - ty;
      }

      const now = Date.now();

      // Clear pinch flag only when all fingers are lifted
      if (e.touches.length === 0) {
        const comingOffPinch = wasPinching;
        wasPinching = false;

        // Double-tap resets zoom — but ONLY for genuine single taps, not pinch releases
        if (!comingOffPinch && e.changedTouches.length === 1 && now - lastTap < 300) {
          scale = 1; tx = 0; ty = 0; applyTransform();
          lastTap = 0; return;
        }
        if (!comingOffPinch) lastTap = now;
      }
    }, { passive: false });
  }

    _bindDetail() {
    const r = this.shadowRoot;
    r.querySelector(".back-btn")  ?.addEventListener("click", () => this._goBack());
    r.querySelector(".play-btn")  ?.addEventListener("click", () => this._togglePlay());
    r.querySelector(".seek-back") ?.addEventListener("click", () => this._seekRelative(-30));
    r.querySelector(".seek-fwd")  ?.addEventListener("click", () => this._seekRelative(30));
    r.querySelector(".live-badge")?.addEventListener("click", () => this._startLive());
    r.querySelector(".live-text") ?.addEventListener("click", () => this._startLive());
    r.querySelector(".btn-motion")?.addEventListener("click", () => this._toggleMotion());
    r.querySelector(".btn-cal")   ?.addEventListener("click", () => this._openCal());
    r.querySelector(".btn-dl")    ?.addEventListener("click", () => this._openDl());
    r.querySelector(".zoom-in")   ?.addEventListener("click", () => this._zoomTL(-1));
    r.querySelector(".zoom-out")  ?.addEventListener("click", () => this._zoomTL(1));

    // Volume button — mute/unmute + open slider, auto-close after 2s
    const btnVol    = r.querySelector(".btn-vol");
    const volWrap   = r.querySelector(".vol-wrap");
    const volSlider = r.querySelector(".vol-slider");
    if (btnVol && volWrap && volSlider) {
      let volTimer = null;
      const closeVol = () => { volWrap.classList.remove("open"); };
      const resetTimer = () => {
        clearTimeout(volTimer);
        volTimer = setTimeout(closeVol, 2000);
      };

      const syncVolIcon = (val) => {
        btnVol.innerHTML = val === 0 ? ic("mdi:volume-off") : val < 0.5 ? ic("mdi:volume-medium") : ic("mdi:volume-high");
        // Update slider gradient fill
        volSlider.style.setProperty("--vol-pct", (val * 100) + "%");
      };

      btnVol.addEventListener("click", () => {
        const vid = r.querySelector(".arc-video");
        // Toggle mute
        const newMuted = vid ? !vid.muted : false;
        if (vid) { vid.muted = newMuted; }
        const displayVal = newMuted ? 0 : parseFloat(volSlider.value) || 0.8;
        syncVolIcon(newMuted ? 0 : parseFloat(volSlider.value));
        // Open slider
        volWrap.classList.add("open");
        resetTimer();
      });

      volSlider.addEventListener("input", () => {
        const vid = r.querySelector(".arc-video");
        const val = parseFloat(volSlider.value);
        if (vid) { vid.volume = val; vid.muted = val === 0; }
        syncVolIcon(val);
        resetTimer();
      });

      // Close on any touch/click outside the slider
      document.addEventListener("click", (e) => {
        if (!volWrap.contains(e.target) && e.target !== btnVol) closeVol();
      }, { capture: true });

      // Set initial state from config
      const vid0 = r.querySelector(".arc-video");
      const initVol = this._config?.default_audio ? 0.8 : 0;
      if (vid0) { vid0.volume = initVol; vid0.muted = initVol === 0; }
      volSlider.value = initVol;
      syncVolIcon(initVol);
    }

    // Pinch-to-zoom and pan on the video/img
    this._bindPinchZoom(r.querySelector(".vid-wrap"));

    const vid = r.querySelector(".arc-video");
    if (vid) {
      vid.addEventListener("play",  () => {
        this._ignoreVidErr = false;   // successfully playing — no stale error to suppress
        this._isPlaying = true; this._syncPlayBtn(); this._setVidStatus("");
      });
      vid.addEventListener("pause", () => { this._isPlaying=false; this._syncPlayBtn(); });
      vid.addEventListener("ended", () => { this._isPlaying=false; this._syncPlayBtn(); });
      vid.addEventListener("error", () => {
        // Suppress stale errors from the live stream URL that fire AFTER we have
        // already transitioned to archive mode (_stopLive sets this flag).
        if (this._ignoreVidErr) {
          this._ignoreVidErr = false;
          return;
        }
        if (this._mode === "live") {
          // Live stream not supported by this DW build — switch to JPEG polling.
          // Don't clear vid.src here (would fire another error); just hide it.
          this._liveStreamFail = true;
          vid.style.display = "none";
          const img = this.shadowRoot.querySelector(".live-img");
          if (img) img.style.display = "block";
          this._isPlaying = true;
          this._syncPlayBtn();
          clearInterval(this._liveTimer);
          this._pollLiveFrame();
          this._liveTimer = setInterval(() => this._pollLiveFrame(), LIVE_POLL_MS);
          return;
        }
        this._setVidStatus(this._hasFootage === false ? "No archive available for this camera." : "Playback error — check DW server URL and credentials.");
        this._isPlaying=false; this._syncPlayBtn();
      });
      vid.addEventListener("timeupdate", () => {
        if (this._isPlaying && this._mode==="archive") {
          const d = vid.currentTime - this._lastVidTime;
          if (Math.abs(d) < 5) { this._playheadMs += d*1000; this._updateTimeDisplay(); this._drawTimeline(); }
          this._lastVidTime = vid.currentTime;
        }
      });
    }

    const tw = r.querySelector(".tl-wrap");
    if (tw) {
      tw.addEventListener("mousedown",  e => this._dragStart(e.clientX));
      tw.addEventListener("mousemove",  e => this._dragMove(e.clientX));
      tw.addEventListener("mouseup",    e => this._dragEnd(e.clientX));
      tw.addEventListener("mouseleave", e => { if(this._dragging) this._dragEnd(e.clientX); });
      tw.addEventListener("touchstart", e => this._dragStart(e.touches[0].clientX), {passive:true});
      tw.addEventListener("touchmove",  e => this._dragMove(e.touches[0].clientX),  {passive:true});
      tw.addEventListener("touchend",   e => this._dragEnd(e.changedTouches[0].clientX));
    }
  }

  /* ── Calendar popup */
  _buildCalPopup() {
    const d    = new Date(this._playheadMs);
    const wrap = document.createElement("div");
    wrap.className = "overlay hidden cal-overlay";
    wrap.innerHTML = `
      <div class="popup">
        <div class="pop-title">Go to date / time<button class="pop-close">${ic("mdi:close")}</button></div>
        <div class="cal-nav">
          <button class="cal-nb cal-prev">${ic("mdi:chevron-left")}</button>
          <span class="cal-month"></span>
          <button class="cal-nb cal-next">${ic("mdi:chevron-right")}</button>
        </div>
        <div class="cal-grid">
          <div class="cal-hdr-row">${["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>`<div class="cal-hdr">${d}</div>`).join("")}</div>
          <div class="cal-grid-body"></div>
        </div>
        <div class="cal-time-row">
          <span class="cal-tlbl">Time:</span>
          <input type="time" step="1" class="cal-tin" value="${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}">
        </div>
        <button class="cal-go">Go to this time</button>
      </div>`;
    wrap.querySelector(".pop-close").addEventListener("click", () => this._closeCal());
    wrap.querySelector(".cal-prev").addEventListener("click", () => {
      this._calMonth--; if(this._calMonth<0){this._calMonth=11;this._calYear--;} this._renderCalDays();
    });
    wrap.querySelector(".cal-next").addEventListener("click", () => {
      this._calMonth++; if(this._calMonth>11){this._calMonth=0;this._calYear++;} this._renderCalDays();
    });
    wrap.querySelector(".cal-go").addEventListener("click", () => this._applyCal());
    wrap.addEventListener("click", e => { if(e.target===wrap) this._closeCal(); });
    requestAnimationFrame(() => this._renderCalDays());
    return wrap;
  }

  /* ── Download popup */
  _buildDlPopup() {
    const wrap = document.createElement("div");
    wrap.className = "overlay hidden dl-overlay";
    wrap.innerHTML = `
      <div class="popup">
        <div class="pop-title">Download clip<button class="pop-close">${ic("mdi:close")}</button></div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">From: <strong class="dl-start"></strong></div>
        <div style="font-size:13px;font-weight:500;margin-bottom:8px;">Select duration:</div>
        <div class="dl-opts">
          ${[1,5,10,20].map(m=>`<div class="dl-opt${m===this._dlMin?" sel":""}" data-min="${m}">${m} min</div>`).join("")}
        </div>
        <button class="dl-go">${ic("mdi:download")} Download</button>
        <div class="dl-status"></div>
      </div>`;
    wrap.querySelector(".pop-close").addEventListener("click", () => this._closeDl());
    wrap.querySelectorAll(".dl-opt").forEach(el => el.addEventListener("click", () => {
      wrap.querySelectorAll(".dl-opt").forEach(o=>o.classList.remove("sel"));
      el.classList.add("sel");
      this._dlMin = +el.dataset.min;
      // Update displayed start time for live mode (last N minutes)
      if (this._dlIsLive) {
        const fromMs = this._dlSnapMs - (this._dlMin * 60 * 1000);
        this._dlFromMs = fromMs;
        const st = wrap.querySelector(".dl-start");
        if (st) st.textContent = fmtDT(fromMs);
      }
    }));
    wrap.querySelector(".dl-go").addEventListener("click", () => this._startDl());
    wrap.addEventListener("click", e => { if(e.target===wrap) this._closeDl(); });
    return wrap;
  }

  disconnectedCallback() {
    this._stopGridThumbs();
    this._stopLive();
    this._stopArchiveVideo();
    clearTimeout(this._motionJumpTimer);
    clearInterval(this._liveClockTimer);
    this._thumbUrls = {};
  }
}

customElements.define("dw-spectrum-playback-card", DwSpectrumPlaybackCard);

// ── Card editor ──────────────────────────────────────────────────────────────

class DwSpectrumPlaybackCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
  }

  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  set hass(_) {}

  _fire(config) {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config },
      bubbles: true,
      composed: true,
    }));
  }

  _render() {
    const c = this._config;
    const tlOptions = [
      { v: 5,  l: "5 min" },
      { v: 10, l: "10 min" },
      { v: 20, l: "20 min" },
      { v: 30, l: "30 min" },
      { v: 45, l: "45 min" },
      { v: 60, l: "1 hr" },
    ];
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; padding: 16px; }
        .section { font-size: 12px; font-weight: 600; text-transform: uppercase;
          color: var(--secondary-text-color, #888); padding: 12px 0 4px; }
        .row { display: flex; align-items: center; justify-content: space-between;
          padding: 10px 0; border-bottom: 1px solid var(--divider-color, #eee); }
        .row:last-child { border-bottom: none; }
        label { font-size: 14px; color: var(--primary-text-color, #333); }
        select {
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #333);
          border: 1px solid var(--divider-color, #ccc);
          border-radius: 4px; padding: 4px 8px; font-size: 14px; min-width: 110px;
        }
        input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color, #03a9f4); }
      </style>

      <div class="section">Buttons</div>
      <div class="row"><label>Show Download button</label>
        <input type="checkbox" id="show_download" ${c.show_download!==false?"checked":""}></div>
      <div class="row"><label>Show Calendar button</label>
        <input type="checkbox" id="show_calendar" ${c.show_calendar!==false?"checked":""}></div>
      <div class="row"><label>Show Motion button</label>
        <input type="checkbox" id="show_motion" ${c.show_motion!==false?"checked":""}></div>

      <div class="section">Timeline</div>
      <div class="row"><label>Default timeline length</label>
        <select id="default_timeline">
          ${tlOptions.map(o=>`<option value="${o.v}" ${(c.default_timeline||10)==o.v?"selected":""}>${o.l}</option>`).join("")}
        </select></div>

      <div class="section">Audio</div>
      <div class="row"><label>Default audio on</label>
        <input type="checkbox" id="default_audio" ${c.default_audio?"checked":""}></div>

      <div class="section">Search</div>
      <div class="row"><label>Show search bar</label>
        <input type="checkbox" id="show_search" ${c.show_search!==false?"checked":""}></div>

      <div class="section">Video Overlays</div>
      <div class="row"><label>Show live/archive badge on video</label>
        <input type="checkbox" id="show_badges" ${c.show_badges!==false?"checked":""}></div>
    `;

    const update = () => this._fire({
      ...this._config,
      show_download:    this.shadowRoot.getElementById("show_download").checked,
      show_calendar:    this.shadowRoot.getElementById("show_calendar").checked,
      show_motion:      this.shadowRoot.getElementById("show_motion").checked,
      default_timeline: Number(this.shadowRoot.getElementById("default_timeline").value),
      default_audio:    this.shadowRoot.getElementById("default_audio").checked,
      show_search:      this.shadowRoot.getElementById("show_search").checked,
      show_badges:      this.shadowRoot.getElementById("show_badges").checked,
    });

    this.shadowRoot.querySelectorAll("input, select").forEach(el =>
      el.addEventListener("change", update)
    );
  }
}

customElements.define("dw-spectrum-playback-card-editor", DwSpectrumPlaybackCardEditor);

// ── Card picker registration ──────────────────────────────────────────────────

window.customCards = window.customCards || [];
window.customCards.push({
  type: "dw-spectrum-playback-card",
  name: "DW Spectrum Playback",
  description: "Live view, archive playback, and timeline for DW Spectrum cameras.",
  preview: false,
});
