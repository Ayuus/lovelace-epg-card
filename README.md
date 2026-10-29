# Lovelace EPG Card

A timeline EPG (TV guide) card for Home Assistant, for use with the
[HomeAssistant-EPG](https://github.com/yohaybn/HomeAssistant-EPG) integration.

This is a customized fork of
[peno64/lovelace-epg-card](https://github.com/peno64/lovelace-epg-card)
(itself a fork of [yohaybn/lovelace-epg-card](https://github.com/yohaybn/lovelace-epg-card)).

## Features

- **Today + tomorrow** in one timeline, using the real end times from the
  integration (including programmes that end after midnight).
- **Timeline range** starts at the whole hour of the earliest programme with
  data today (scroll back as far as data is available; on first render the
  card is scrolled to *now − 30 min*), and ends at the whole hour after the last programme.
- **Fixed time header** (the hours stay visible at the top) and a **sticky
  channel column** (channel stays visible while scrolling horizontally).
- **Channel logos**: taken from the integration's `channel_icon` attribute;
  falls back to the channel name if there is no logo (the generic open‑epg
  placeholder `1700.png` is treated as "no logo"). You can override logos per
  channel via `logos`, and strip a common prefix from channel names via
  `strip_prefix`.
- **Now line** on the current time (white in dark theme, black in light theme),
  a **day divider** (dashed) at midnight, and dark‑blue fill blocks for the
  empty "past" (before the current programme) and "future" (after the last
  programme) areas.
- **Tooltip** with title, description and start–end time, centered on the
  programme the mouse is over.
- **Responsive**: the hour width scales with the card width; scrollbars stay
  inside the card (horizontal + vertical) and the card fits the screen.
- **Scroll with mouse drag** (grab‑to‑scroll) as well as touch.
- Programme titles are clamped to **2 lines** with an ellipsis.

## Installation

### HACS (custom repository)
1. HACS → ⋮ → Custom repositories → add this repo's URL, category *Dashboard*.
2. Install "Lovelace EPG Card".
3. HACS adds the resource automatically.

### Manual
1. Copy `dist/epg-card.js` to `/config/www/epg-card.js`.
2. Settings → Dashboards → ⋮ → Resources → Add:
   - URL `/local/epg-card.js?v=1`, type **JavaScript Module**.
   - Bump `?v=` when you update the file.

## Configuration

```yaml
type: custom:epg-card
entities:
  - sensor.epg_npo_1
  - sensor.epg_rtl_4
row_height: 65          # px, height of each channel row (default 100)
hours_per_screen: 8     # how many hours roughly fit across the card width (default 8)
min_hour_width: 80      # px, minimum width per hour on small screens (default 80)
# hour_width: 120       # px, optional FIXED width per hour (overrides responsive sizing)
logo_size: 36           # px, max logo height (default 36)
strip_prefix: "EPG Netherlands 1 "   # string or list; removed from channel names
logos:                  # optional: override logo per channel (name OR entity id)
  sensor.epg_npo_1: /local/images/tv/npo1.png
```

| Option             | Type            | Default | Description |
| ------------------ | --------------- | ------- | ----------- |
| `entities`         | list (required) | –       | EPG sensor entity ids from the integration. |
| `row_height`       | number (px)     | 100     | Height of each channel row. |
| `hours_per_screen` | number          | 8       | Target number of hours visible across the card width (responsive). |
| `min_hour_width`   | number (px)     | 80      | Lower bound for the hour width (readability on small screens). |
| `start_offset_minutes` | number      | 30      | On first render the card scrolls so the left edge is at *now minus this many minutes*. Earlier programmes stay reachable by scrolling left. |
| `hour_width`       | number (px)     | –       | Fixed width per hour; overrides the responsive sizing. |
| `logo_size`        | number (px)     | 36      | Maximum logo height. |
| `strip_prefix`     | string or list  | –       | Prefix(es) removed from channel names in the display. |
| `logos`            | map             | –       | Logo URL per channel, keyed by channel name or entity id. |

All of these are also editable in the card's visual (UI) editor.

## Credits

- Integration: [yohaybn/HomeAssistant-EPG](https://github.com/yohaybn/HomeAssistant-EPG)
- Original card: [yohaybn/lovelace-epg-card](https://github.com/yohaybn/lovelace-epg-card)
  and [peno64/lovelace-epg-card](https://github.com/peno64/lovelace-epg-card)
