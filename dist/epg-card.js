const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class EPGCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("epg-card-editor");
  }

  static getStubConfig() {
    return { entities: [], row_height: 100 };
  }

  set hass(hass) {
    if (!this.content) {
      this.style.display = "block";
      this.style.width = "100%";
      this.content = document.createElement("div");
      this.content.style.padding = "16px";
      this.content.style.boxSizing = "border-box";
      this.appendChild(this.content);

      // Gedeelde tooltip die de muis volgt (los element, niet geknipt door scroll)
      this._tip = document.createElement("div");
      Object.assign(this._tip.style, {
        position: "fixed",
        zIndex: "99999",
        display: "none",
        pointerEvents: "none",
        background: "rgba(0, 0, 0, 0.9)",
        color: "#fff",
        padding: "10px 15px",
        borderRadius: "8px",
        fontSize: "14px",
        lineHeight: "1.5",
        maxWidth: "300px",
        whiteSpace: "normal",
        boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
      });
      this.appendChild(this._tip);

      // Tooltip via event-delegatie (overleeft herbouw): het vaste kaartje wordt
      // gecentreerd (fixed) binnen het programma waar de muis op staat, en
      // geklemd binnen het scherm.
      const over = (e) => {
        if (this._drag) {
          // tijdens muis-slepen geen tooltip
          this._tip.style.display = "none";
          this._tipProg = null;
          return;
        }
        const prog = e.target.closest ? e.target.closest(".program") : null;
        if (prog === this._tipProg) return; // zelfde programma: niets doen
        this._tipProg = prog;
        if (!prog) {
          this._tip.style.display = "none";
          return;
        }
        this._tip.replaceChildren();
        // Omschrijving die gewoon de titel herhaalt weglaten.
        const desc =
          this._normTitle(prog.dataset.desc) ===
          this._normTitle(prog.dataset.title)
            ? ""
            : prog.dataset.desc;
        [prog.dataset.title, desc, prog.dataset.times].forEach(
          (t) => {
            const d = document.createElement("div");
            d.textContent = t || "";
            this._tip.appendChild(d);
          }
        );
        this._tip.style.display = "block";
        const place = () => {
          const pr = prog.getBoundingClientRect();
          const tr = this._tip.getBoundingClientRect();
          let x = pr.left + pr.width / 2 - tr.width / 2; // horizontaal centreren
          let y = pr.top + pr.height / 2 - tr.height / 2; // verticaal centreren
          x = Math.max(4, Math.min(x, window.innerWidth - tr.width - 4));
          y = Math.max(4, Math.min(y, window.innerHeight - tr.height - 4));
          this._tip.style.left = `${x}px`;
          this._tip.style.top = `${y}px`;
        };
        place();

        // Films: aanvullende gegevens van TMDB (alleen met tmdb_api_key).
        if (this._isFilmCandidate(prog.dataset)) {
          this._lookupMovie(prog.dataset.title, prog.dataset.dur).then(
            (info) => {
              if (!info || this._tipProg !== prog) return;
              const meta = [
                info.rating ? `★ ${info.rating}` : "",
                info.year,
                info.runtime ? `${info.runtime} min` : "",
              ]
                .filter(Boolean)
                .join(" · ");
              [meta, info.overview, "Bron: TMDB"].forEach((t, i) => {
                if (!t) return;
                const d = document.createElement("div");
                d.textContent = t;
                if (i === 0) d.style.fontWeight = "bold";
                if (i === 2) {
                  d.style.fontSize = "11px";
                  d.style.opacity = "0.6";
                }
                if (i > 0) d.style.marginTop = "6px";
                this._tip.appendChild(d);
              });
              place();
            }
          );
        }
      };
      this.content.addEventListener("mouseover", over);
      this.content.addEventListener("mouseleave", () => {
        this._tipProg = null;
        this._tip.style.display = "none";
      });

      // Herbouw bij breedte- of vensterwijziging zodat de kaart passend blijft
      this._ro = new ResizeObserver(() => {
        const w = this.content.clientWidth;
        if (w === this._lastWidth) return;
        this._lastWidth = w;
        this._sig = null;
        if (this._hass) this.hass = this._hass;
      });
      this._ro.observe(this.content);
      this._onWinResize = () => {
        this._sig = null;
        if (this._hass) this.hass = this._hass;
      };
      window.addEventListener("resize", this._onWinResize);

      // Slepen met de muis om te scrollen (touch werkt al native)
      this._drag = null;
      this.content.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return; // alleen linkermuisknop
        const sc = e.target.closest && e.target.closest(".epg-scroll");
        if (!sc) return;
        this._drag = {
          sc,
          x: e.clientX,
          y: e.clientY,
          l: sc.scrollLeft,
          t: sc.scrollTop,
        };
        sc.style.cursor = "grabbing";
        this._tip.style.display = "none";
        this._tipProg = null;
      });
      window.addEventListener("mousemove", (e) => {
        const d = this._drag;
        if (!d) return;
        d.sc.scrollLeft = d.l - (e.clientX - d.x);
        d.sc.scrollTop = d.t - (e.clientY - d.y);
        e.preventDefault(); // geen tekst-/afbeeldingselectie tijdens slepen
      });
      window.addEventListener("mouseup", () => {
        if (!this._drag) return;
        this._drag.sc.style.cursor = "";
        this._drag = null;
      });
    }
    this._hass = hass;

    const entityIds = this.config.entities;
    const row_height = this.config.row_height || 100;
    const CHANNEL_WIDTH = 120; // px, vaste kanaalnaam-kolom
    const HEADER_HEIGHT = 24; // px, vaste tijdheader
    const LOGO_SIZE = this.config.logo_size || 36; // px, max. logo-hoogte

    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      this.content.innerHTML = `<b>Error:</b> No entities configured.`;
      return;
    }

    const nowMin = (() => {
      const t = new Date();
      return t.getHours() * 60 + t.getMinutes();
    })();

    const epgData = {};
    const channelIcons = {};
    const cfgLogos = this.config.logos || {}; // optioneel: naam/entity -> logo-URL
    let maxEndAbs = 0;
    let earliestStart = null;

    // Vandaag (offset 0) + morgen (offset 1440) samenvoegen; echte eindtijd,
    // einde na middernacht doorrollen.
    entityIds.forEach((entityId) => {
      const state = hass.states[entityId];
      if (!state) {
        this.content.innerHTML = `<b>Error:</b> Entity ${entityId} not found.`;
        return;
      }
      const name = state.attributes.friendly_name || entityId;
      let icon =
        cfgLogos[name] ||
        cfgLogos[entityId] ||
        state.attributes.channel_icon ||
        state.attributes.entity_picture ||
        null;
      // Generieke open-epg placeholder telt niet als logo -> dan de naam tonen
      if (icon && /open-epg\.com\/1700\.png/i.test(icon)) icon = null;
      channelIcons[name] = icon;
      const list = [];
      const addDay = (programs, dayOffset) => {
        if (!programs) return;
        const keys = Object.keys(programs);
        keys.forEach((start_time) => {
          const program = programs[start_time];
          const end_time =
            program.end || this._calculateEndTime(start_time, keys);
          const startAbs = this._convertTimeToMinutes(start_time) + dayOffset;
          let endAbs = this._convertTimeToMinutes(end_time) + dayOffset;
          if (endAbs <= startAbs) endAbs += 1440;
          if (endAbs > maxEndAbs) maxEndAbs = endAbs;
          if (dayOffset === 0 && (earliestStart === null || startAbs < earliestStart)) {
            earliestStart = startAbs;
          }
          list.push({
            title: program.title,
            desc: program.desc,
            sub: program.sub_title,
            start: start_time,
            end: end_time,
            startAbs: startAbs,
            endAbs: endAbs,
          });
        });
      };
      addDay(state.attributes.today, 0);
      addDay(state.attributes.tomorrow, 1440);
      epgData[name] = list;
    });

    const channels = Object.keys(epgData);
    const hasTomorrow = entityIds.some((id) => {
      const st = hass.states[id];
      return (
        st &&
        st.attributes.tomorrow &&
        Object.keys(st.attributes.tomorrow).length > 0
      );
    });

    // Begin op het hele uur van het vroegste programma waarvan data is.
    const anchor = earliestStart !== null ? Math.min(earliestStart, nowMin) : nowMin;
    const base = Math.floor(anchor / 60) * 60;

    // Einde op het hele uur ná de laatste eindtijd.
    if (maxEndAbs < base + 60) maxEndAbs = base + 60;
    let endMinutes = Math.ceil(maxEndAbs / 60) * 60;
    if (endMinutes === maxEndAbs) endMinutes += 60;

    const totalHours = (endMinutes - base) / 60;

    // Uur-breedte: standaard responsief (schaalt mee met de schermbreedte),
    // tenzij een vaste hour_width is opgegeven. hours_per_screen = hoeveel uren
    // er ongeveer in de kaartbreedte passen.
    const avail = (this.content.clientWidth || 0) - 32 - CHANNEL_WIDTH;
    let HOUR_WIDTH;
    if (this.config.hour_width) {
      HOUR_WIDTH = this.config.hour_width; // vaste override
    } else {
      const hps = this.config.hours_per_screen || 8;
      const minHW = this.config.min_hour_width || 80; // ondergrens (leesbaarheid)
      HOUR_WIDTH = avail > 0 ? Math.max(minHW, avail / hps) : minHW;
    }
    // Weinig uren: minstens de kaartbreedte vullen (geen lege ruimte rechts).
    if (avail > 0) {
      const fill = avail / totalHours;
      if (fill > HOUR_WIDTH) HOUR_WIDTH = fill;
    }

    const timesWidth = totalHours * HOUR_WIDTH;
    const innerWidth = CHANNEL_WIDTH + timesWidth;
    const toPx = (absMin) => ((absMin - base) / 60) * HOUR_WIDTH;

    const nowOffsetPx = toPx(nowMin);
    const nowLineLeft = CHANNEL_WIDTH + nowOffsetPx;
    const pastWidthPx = nowOffsetPx;

    const dayDividerLeft =
      hasTomorrow && 1440 > base && 1440 < endMinutes
        ? CHANNEL_WIDTH + toPx(1440)
        : null;

    const timeline = [];
    for (let m = base; m <= endMinutes; m += 60) {
      timeline.push({
        label: `${(Math.floor(m / 60) % 24).toString().padStart(2, "0")}:00`,
        left: toPx(m),
      });
    }

    // Alleen herbouwen bij echte wijziging; anders enkel de nu-lijn bijwerken.
    const signature = JSON.stringify({
      epgData,
      channelIcons,
      stripPrefix: this.config.strip_prefix || null,
      base,
      endMinutes,
      row_height,
      HOUR_WIDTH,
      logoSize: LOGO_SIZE,
    });
    if (this._sig === signature && this.content.querySelector(".epg-scroll")) {
      const nl = this.content.querySelector(".now-line");
      if (nl) nl.style.left = `${nowLineLeft}px`;
      this.content
        .querySelectorAll(".past")
        .forEach((el) => (el.style.width = `${pastWidthPx}px`));
      return;
    }
    this._sig = signature;

    const prevScroll = this.content.querySelector(".epg-scroll");
    const savedLeft = prevScroll ? prevScroll.scrollLeft : 0;
    const savedTop = prevScroll ? prevScroll.scrollTop : 0;

    this.content.innerHTML = `
        <style>
            .epg-card {
                font-family: inherit; /* standaard HA-lettertype */
                width: 100%;
            }
            /* Vaste tijdheader BUITEN het scrollvlak: uren blijven altijd bovenin. */
            .epg-head {
                display: flex;
                height: ${HEADER_HEIGHT}px;
                overflow: hidden;
                border-bottom: 1px solid var(--divider-color, rgba(127,127,127,0.4));
                background-color: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            }
            .corner {
                flex: 0 0 auto;
                width: ${CHANNEL_WIDTH}px;
                background-color: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            }
            .head-scroll {
                flex: 1 1 auto;
                overflow: hidden;
                position: relative;
            }
            .times {
                position: relative;
                width: ${timesWidth}px;
                height: ${HEADER_HEIGHT}px;
                will-change: transform;
            }
            .time {
                position: absolute;
                top: 0;
                height: ${HEADER_HEIGHT}px;
                font-weight: bold;
                font-size: 14px;
                white-space: nowrap;
            }
            /* Alleen dit vlak scrollt (max-height wordt via JS gezet) */
            .epg-scroll {
                width: 100%;
                overflow: auto;
                box-sizing: border-box;
                overscroll-behavior: contain;
                -webkit-overflow-scrolling: touch;
                touch-action: pan-x pan-y;
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
            }
            .epg-inner {
                position: relative;
                width: ${innerWidth}px;
            }
            .now-line {
                position: absolute;
                top: 0;
                bottom: 0;
                left: ${nowLineLeft}px;
                width: 2px;
                background-color: var(--primary-text-color);
                z-index: 400;
                pointer-events: none;
            }
            .day-divider {
                position: absolute;
                top: 0;
                bottom: 0;
                width: 0;
                border-left: 2px dashed var(--primary-text-color);
                opacity: 0.6;
                z-index: 400;
                pointer-events: none;
            }
            .channel-row {
                display: flex;
                align-items: center;
                height: ${row_height}px;
                margin-bottom: 5px;
            }
            .channel-name {
                position: sticky;
                left: 0;
                width: ${CHANNEL_WIDTH}px;
                min-width: ${CHANNEL_WIDTH}px;
                height: ${row_height}px;
                z-index: 500;
                background-color: var(--ha-card-background, var(--card-background-color, #1c1c1c));
                font-weight: bold;
                text-align: center;
                padding: 4px;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .chan-logo {
                max-width: ${CHANNEL_WIDTH - 24}px;
                max-height: ${LOGO_SIZE}px;
                object-fit: contain;
                -webkit-user-drag: none;
            }
            .programs {
                position: relative;
                width: ${timesWidth}px;
                height: ${row_height}px;
            }
            .fill {
                position: absolute;
                top: 0;
                height: ${row_height}px;
                background-color: rgba(30, 70, 120, 0.45);
                border-radius: 4px;
                z-index: 0;
                pointer-events: none;
            }
            .program {
                position: absolute;
                height: ${row_height}px;
                background-color: rgba(0, 123, 255, 0.6);
                color: white;
                box-sizing: border-box;
                border-radius: 4px;
                border-right: 1px solid #333;
                padding: 5px;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                white-space: normal;
                word-wrap: break-word;
                cursor: pointer;
                font-size: 14px;
            }
            .prog-title {
                display: -webkit-box;
                -webkit-line-clamp: 2;       /* max 2 regels */
                line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;     /* ... aan het einde */
                word-break: break-word;
                text-align: center;
                width: 100%;                 /* begrens op programmabreedte */
                max-width: 100%;
            }
            .program:hover {
                background-color: #0056b3;
            }
        </style>

        <div class="epg-card">
          <div class="epg-head">
            <div class="corner"></div>
            <div class="head-scroll">
              <div class="times">
                ${timeline
                  .map(
                    (t) =>
                      `<div class="time" style="left: ${t.left}px;">${t.label}</div>`
                  )
                  .join("")}
              </div>
            </div>
          </div>

          <div class="epg-scroll">
            <div class="epg-inner">
                <div class="now-line"></div>
                ${
                  dayDividerLeft !== null
                    ? `<div class="day-divider" style="left: ${dayDividerLeft}px;"></div>`
                    : ""
                }

                ${channels
                  .map(
                    (channel) => `
                        <div class="channel-row">
                            <div class="channel-name">${
                              channelIcons[channel]
                                ? `<img class="chan-logo" src="${this._esc(
                                    channelIcons[channel]
                                  )}" alt="${this._esc(
                                    this._chanName(channel)
                                  )}" title="${this._esc(
                                    this._chanName(channel)
                                  )}" data-name="${this._esc(
                                    this._chanName(channel)
                                  )}" />`
                                : this._esc(this._chanName(channel))
                            }</div>
                            <div class="programs">
                                <div class="fill past" style="left: 0; width: ${pastWidthPx}px;"></div>
                                ${(() => {
                                  let chEnd = base;
                                  epgData[channel].forEach((p) => {
                                    const pe = Math.min(p.endAbs, endMinutes);
                                    if (pe > chEnd) chEnd = pe;
                                  });
                                  const rl = toPx(chEnd);
                                  const rw = timesWidth - rl;
                                  return rw > 0.5
                                    ? `<div class="fill future" style="left: ${rl}px; width: ${rw}px;"></div>`
                                    : "";
                                })()}
                                ${epgData[channel]
                                  .map((program) => {
                                    const s = Math.min(
                                      Math.max(program.startAbs, base),
                                      endMinutes
                                    );
                                    const e = Math.min(
                                      Math.max(program.endAbs, base),
                                      endMinutes
                                    );
                                    const left = toPx(s);
                                    const width = ((e - s) / 60) * HOUR_WIDTH;
                                    if (width <= 0) return "";
                                    return `
                                        <div class="program"
                                            style="left: ${left}px; width: ${width}px;"
                                            data-title="${this._esc(program.title)}"
                                            data-desc="${this._esc(program.desc)}"
                                            data-sub="${this._esc(program.sub)}"
                                            data-dur="${program.endAbs - program.startAbs}"
                                            data-times="${this._esc(program.start)}-${this._esc(program.end)}">
                                            <span class="prog-title">${this._esc(
                                              program.title
                                            )}</span>
                                        </div>
                                    `;
                                  })
                                  .join("")}
                            </div>
                        </div>`
                  )
                  .join("")}
            </div>
          </div>
        </div>
        `;

    // Horizontale sync van de vaste header + hoogte begrenzen zodat de
    // scrollbars ín de kaart zitten; scrollpositie herstellen.
    const scrollEl = this.content.querySelector(".epg-scroll");
    const headTimes = this.content.querySelector(".times");
    if (scrollEl && headTimes) {
      const sync = () => {
        headTimes.style.transform = `translateX(${-scrollEl.scrollLeft}px)`;
      };
      scrollEl.addEventListener("scroll", sync, { passive: true });
      // Voorkom dat de HA-app horizontale swipes onderschept (view-navigatie)
      scrollEl.addEventListener("touchstart", (e) => e.stopPropagation(), {
        passive: true,
      });
      scrollEl.addEventListener("touchmove", (e) => e.stopPropagation(), {
        passive: true,
      });
      // Ondermarge zodat de kaart binnen het scherm past en de pagina zelf
      // geen tweede scrollbar krijgt.
      const BOTTOM_MARGIN = 12;
      const top = scrollEl.getBoundingClientRect().top;
      const availH = window.innerHeight - top - BOTTOM_MARGIN;
      scrollEl.style.maxHeight = `${availH > 140 ? availH : 300}px`;
      // Corrigeer resterende overschrijding van de hele kaart (voorkomt een
      // tweede, pagina-scrollbar naast die van de kaart).
      const overshoot = this.getBoundingClientRect().bottom - window.innerHeight;
      if (overshoot > 0) {
        const mh = Math.max(
          140,
          parseFloat(scrollEl.style.maxHeight) - overshoot - BOTTOM_MARGIN
        );
        scrollEl.style.maxHeight = `${mh}px`;
      }
      // Eerste weergave: beginnen bij (nu - start_offset_minutes); daarna de
      // door de gebruiker gekozen scrollpositie behouden.
      const startOffset =
        this.config.start_offset_minutes !== undefined
          ? Number(this.config.start_offset_minutes)
          : 30;
      // Zolang de gebruiker niet zelf gescrold heeft blijft de startpositie
      // gelden (ook na herbouw door resize); daarna de eigen positie behouden.
      scrollEl.scrollLeft = this._userScrolled
        ? savedLeft
        : Math.max(0, toPx(nowMin - startOffset));
      const markUser = () => (this._userScrolled = true);
      scrollEl.addEventListener("wheel", markUser, { passive: true });
      scrollEl.addEventListener("touchstart", markUser, { passive: true });
      scrollEl.addEventListener("mousedown", markUser);
      scrollEl.scrollTop = savedTop;
      sync();
    }

    // Logo dat niet laadt: terugvallen op de zendernaam
    this.content.querySelectorAll(".chan-logo").forEach((img) => {
      img.addEventListener("error", () => {
        img.replaceWith(document.createTextNode(img.dataset.name || ""));
      });
    });
  }

  // Verwijder geconfigureerde prefix(en) van de zendernaam voor de weergave.
  _chanName(name) {
    const p = this.config.strip_prefix;
    if (!p) return name;
    const arr = Array.isArray(p) ? p : [p];
    for (const pre of arr) {
      if (pre && name.startsWith(pre)) {
        const short = name.slice(pre.length).replace(/^[\s:_-]+/, "").trim();
        return short || name;
      }
    }
    return name;
  }

  // Lijkt dit programma een film? (lang, geen ondertitel, weinig omschrijving)
  _isFilmCandidate(d) {
    if (!this.config.tmdb_api_key) return false;
    const minDur = this.config.film_min_minutes || 80;
    const maxDesc = this.config.film_max_desc_length || 100;
    return (
      Number(d.dur) >= minDur &&
      !(d.sub || "").trim() &&
      (d.desc || "").trim().length < maxDesc
    );
  }

  _normTitle(t) {
    return String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^(film|speelfilm|bioscoop)\s*:\s*/, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  // Zoek de film bij TMDB; resultaat (ook "niet gevonden") wordt 30 dagen
  // in localStorage bewaard. Geeft null als er niets betrouwbaars is.
  async _lookupMovie(rawTitle, dur) {
    const durMin = Number(dur);
    const key = this.config.tmdb_api_key;
    const lang = this.config.tmdb_language || "nl-NL";
    const yearMatch = String(rawTitle).match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? yearMatch[1] : "";
    const title = String(rawTitle).replace(/\s*\(\d{4}\)\s*$/, "").trim();
    const want = this._normTitle(title);
    if (!want) return null;

    const cacheKey = `${lang}|${want}|${year}|${Math.round(durMin / 15)}`;
    this._movieMem = this._movieMem || {};
    const TTL = 30 * 24 * 3600 * 1000;
    const read = () => {
      try {
        return JSON.parse(localStorage.getItem("epg-card-movies") || "{}");
      } catch (e) {
        return {};
      }
    };
    const hit = this._movieMem[cacheKey] || read()[cacheKey];
    if (hit && Date.now() - hit.t < TTL) return hit.info;
    if (this._movieBusy && this._movieBusy[cacheKey])
      return this._movieBusy[cacheKey];

    this._movieBusy = this._movieBusy || {};
    const run = (async () => {
      const bearer = key.length > 40; // v4-token i.p.v. v3-sleutel
      const headers = bearer ? { Authorization: `Bearer ${key}` } : {};
      const api = async (path, params) => {
        const q = new URLSearchParams({ language: lang, ...params });
        if (!bearer) q.set("api_key", key);
        const r = await fetch(`https://api.themoviedb.org/3/${path}?${q}`, {
          headers,
        });
        if (!r.ok) throw new Error(`TMDB ${r.status}`);
        return r.json();
      };
      let info = null;
      try {
        const sp = { query: title };
        if (year) sp.year = year;
        const res = (await api("search/movie", sp)).results || [];
        const exact = res
          .filter(
            (m) =>
              this._normTitle(m.title) === want ||
              this._normTitle(m.original_title) === want
          )
          .slice(0, 3);
        for (const m of exact) {
          const det = await api(`movie/${m.id}`, {});
          const rt = det.runtime || 0;
          // Zendtijd bevat reclame: speelduur ligt iets onder de blokduur.
          if (rt && (rt > durMin + 10 || rt < durMin - 60)) continue;
          if (!det.overview) continue;
          info = {
            overview: det.overview,
            year: (det.release_date || "").slice(0, 4),
            rating: det.vote_average ? det.vote_average.toFixed(1) : "",
            runtime: rt,
          };
          break;
        }
      } catch (e) {
        return null; // netwerk/sleutelfout: niet cachen, later opnieuw proberen
      }
      const store = read();
      store[cacheKey] = { t: Date.now(), info };
      try {
        localStorage.setItem("epg-card-movies", JSON.stringify(store));
      } catch (e) {}
      this._movieMem[cacheKey] = { t: Date.now(), info };
      return info;
    })();
    this._movieBusy[cacheKey] = run;
    run.finally(() => delete this._movieBusy[cacheKey]);
    return run;
  }

  _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  _convertTimeToMinutes(time) {
    const [hours, minutes] = time.split(":").map((t) => parseInt(t, 10));
    return hours * 60 + minutes;
  }

  _calculateEndTime(current, keys) {
    const times = keys.sort();
    const index = times.indexOf(current);
    if (index === -1 || index === times.length - 1) {
      return "24:00";
    }
    return times[index + 1];
  }

  setConfig(config) {
    if (
      !config.entities ||
      !Array.isArray(config.entities) ||
      config.entities.length === 0
    ) {
      throw new Error("You need to define at least one entity.");
    }
    this.config = config;
  }

  getCardSize() {
    return 5;
  }
}

customElements.define("epg-card", EPGCard);

class EPGCardEditor extends LitElement {
  static get properties() {
    return { hass: { type: Object }, config: { type: Object } };
  }

  constructor() {
    super();
    this.config = {};
  }

  static get styles() {
    return css`
      :host {
        display: block;
        padding: 16px;
      }
    `;
  }

  setConfig(config) {
    this.config = config;
  }

  _valueChanged(ev) {
    const newValue = ev.detail.value;
    this.config = { ...this.config, ...newValue };
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config: this.config } })
    );
  }

  render() {
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${[
          {
            name: "row_height",
            selector: {
              number: { min: 50, max: 300, unit: "px", default: 100 },
            },
            default: 100,
          },
          {
            name: "logo_size",
            selector: { number: { min: 16, max: 100, unit: "px", default: 36 } },
          },
          {
            name: "hours_per_screen",
            selector: { number: { min: 3, max: 24, step: 1, default: 8 } },
          },
          {
            name: "min_hour_width",
            selector: { number: { min: 40, max: 300, unit: "px", default: 80 } },
          },
          {
            name: "hour_width",
            selector: {
              number: { min: 40, max: 400, unit: "px" },
            },
          },
          {
            name: "strip_prefix",
            selector: { text: {} },
          },
          {
            name: "logos",
            selector: { object: {} },
          },
          {
            name: "entities",
            selector: {
              entity: { domain: "sensor", multiple: true, integration: "epg" },
            },
          },
        ]}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}
customElements.define("epg-card-editor", EPGCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "epg-card",
  name: "EPG Card",
  preview: false,
  description: "A custom card for HomeAssistant-EPG!",
  documentationURL: "https://github.com/yohaybn/lovelace-epg-card",
});
