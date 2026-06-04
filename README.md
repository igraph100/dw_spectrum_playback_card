# DW Spectrum Playback Card

A custom Lovelace card for Home Assistant that gives you a full camera browser and archive player for your **DW Spectrum / Digital Watchdog** system — built to work alongside the [DW Spectrum IPVMS integration](https://github.com/igraph100/DW_Spectrum).

---

## Features

### Grid view
- Thumbnail grid of all your cameras, auto-refreshed every 30 seconds.
- Search bar to filter cameras by name.
- Offline cameras show a red dot and an **OFFLINE** overlay on a black tile.
- Multi-server support — switch between DW Spectrum servers from a dropdown.

### Camera detail view
- **Live stream** via WebRTC, with automatic fallback to MP4 stream then JPEG polling.
- **Archive playback** — scrub to any point in recorded footage using the sliding timeline.
- Timeline shows green bars where footage exists; window is cached so scrubbing back and forth is instant.
- Zoom the timeline from 2 minutes up to 24 hours.
- **Calendar picker** — jump directly to any date and time.
- **Clip download** — choose 1, 5, 10, or 20-minute clips downloaded straight to your browser.
- **Motion markers** — orange highlights on the timeline with a motion-skip playback mode.
- Pinch-to-zoom and pan on mobile.
- Volume control with slider.

---

## Installation

### HACS
1. Add this repository to HACS as a custom repository (**Frontend** category).
2. Install **DW Spectrum Playback Card**.
3. Add the resource (HACS may do this automatically).

### Manual
1. Copy `dw_spectrum_playback_card.js` to `config/www/`.
2. Go to **Settings → Dashboards → Resources** and add:
   - URL: `/local/dw_spectrum_playback_card.js`
   - Type: **JavaScript module**
3. Reload your browser.

---

## Usage

Add a card to your dashboard:

```yaml
type: custom:dw-spectrum-playback-card
```

### Configuration options

| Option | Default | Description |
|---|---|---|
| `show_download` | `true` | Show the download button |
| `show_calendar` | `true` | Show the calendar button |
| `show_motion` | `true` | Show the motion markers button |
| `show_search` | `true` | Show the camera search bar |
| `show_badges` | `true` | Show LIVE / ARCHIVE badge on video |
| `default_timeline` | `10` | Default timeline window in minutes — `5`, `10`, `20`, `30`, `45`, or `60` |
| `default_audio` | `false` | Start with audio enabled |

### Example

```yaml
type: custom:dw-spectrum-playback-card
default_timeline: 30
default_audio: false
show_download: true
show_motion: true
```

---

## Requirements
- [DW Spectrum IPVMS integration](https://github.com/your-repo-here) installed and configured.
- Home Assistant 2024.x or later.
