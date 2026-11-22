'use strict';

const STORAGE_KEY = 'lwl_speiseplan_only_v1';
const REMOTE_FEED_URL = 'https://raw.githubusercontent.com/Lauju1909/BarrierefreiesWebUntis/main/canteen_seed.json';

const state = {
  canteen: null,
  selectedWeekId: null,
  selectedDay: 'all',
  dietFilter: 'all', // all | menu1 | menu2 | menu3
  theme: 'dark',     // dark | light | contrast
  fontSize: 'normal', // normal | large | xlarge
  manualWeekChoice: false
};

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function announceSR(text, priority = 'polite') {
  const el = document.getElementById(priority === 'assertive' ? 'sr-live-assertive' : 'sr-live-polite');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 40);
}

function triggerHaptic() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
    }
  } catch (_) {}
}

function getISOWeekNumber(dateInput = new Date()) {
  const d = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getDateRangeOfKW(year, kw) {
  const simple = new Date(Date.UTC(year, 0, 1 + (kw - 1) * 7));
  const dow = simple.getUTCDay();
  const isoStart = new Date(simple);
  if (dow <= 4) isoStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else isoStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  const fri = new Date(isoStart);
  fri.setUTCDate(isoStart.getUTCDate() + 4);
  const fmt = (d) =>
    String(d.getUTCDate()).padStart(2, '0') + '.' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '.' +
    d.getUTCFullYear();
  return fmt(isoStart) + ' bis ' + fmt(fri);
}

function isDateToday(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const today =
    String(now.getDate()).padStart(2, '0') + '.' +
    String(now.getMonth() + 1).padStart(2, '0') + '.' +
    now.getFullYear();
  return dateStr.trim() === today;
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      canteen: state.canteen,
      selectedDay: state.selectedDay,
      dietFilter: state.dietFilter,
      theme: state.theme,
      fontSize: state.fontSize
    }));
  } catch (_) {}
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.canteen && Array.isArray(saved.canteen.weeks)) state.canteen = saved.canteen;
    if (saved.selectedDay) state.selectedDay = saved.selectedDay;
    if (saved.dietFilter) state.dietFilter = saved.dietFilter;
    if (saved.theme) state.theme = saved.theme;
    if (saved.fontSize) state.fontSize = saved.fontSize;
  } catch (_) {}
}

function applyAppearance() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.documentElement.setAttribute('data-font', state.fontSize);

  const themeLabels = { dark: 'Dunkel', light: 'Hell', contrast: 'Hoher Kontrast' };
  const fontLabels = { normal: 'Normal', large: 'Groß', xlarge: 'Sehr groß' };

  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.innerHTML = `<span aria-hidden="true">🎨</span> Design: ${themeLabels[state.theme] || 'Dunkel'}`;
  const btnFont = document.getElementById('btn-font');
  if (btnFont) btnFont.innerHTML = `<span aria-hidden="true">🔤</span> Schrift: ${fontLabels[state.fontSize] || 'Normal'}`;
}

function cycleTheme() {
  const order = ['dark', 'light', 'contrast'];
  state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
  applyAppearance();
  savePrefs();
  triggerHaptic();
  announceSR(`Design gewechselt auf ${state.theme === 'dark' ? 'Dunkel' : state.theme === 'light' ? 'Hell' : 'Hoher Kontrast'}.`);
}

function cycleFontSize() {
  const order = ['normal', 'large', 'xlarge'];
  state.fontSize = order[(order.indexOf(state.fontSize) + 1) % order.length];
  applyAppearance();
  savePrefs();
  triggerHaptic();
  announceSR(`Schriftgröße gewechselt auf ${state.fontSize === 'normal' ? 'Normal' : state.fontSize === 'large' ? 'Groß' : 'Sehr groß'}.`);
}

function getWeeksList() {
  const known = (state.canteen && Array.isArray(state.canteen.weeks)) ? state.canteen.weeks : [];
  const dict = {};
  known.forEach(w => {
    if (w && w.weekId) dict[w.weekId] = w;
  });

  const now = new Date();
  const curKw = getISOWeekNumber(now);
  const year = now.getFullYear();

  const kws = new Set([curKw - 1, curKw, curKw + 1, curKw + 2, curKw + 3]);
  Object.values(dict).forEach(w => {
    if (typeof w.kw === 'number' && w.kw > 0) kws.add(w.kw);
  });

  return Array.from(kws)
    .filter(k => k >= 1 && k <= 53)
    .sort((a, b) => a - b)
    .map(kw => {
      const wid = 'kw' + kw;
      const found = dict[wid];
      const range = (found && found.dateRange) || getDateRangeOfKW(year, kw);
      const isCur = kw === curKw;
      const hasData = !!(found && Array.isArray(found.days) && found.days.length > 0);
      let label = `KW ${kw} (${range})`;
      if (isCur) label = `Diese Woche · KW ${kw} (${range})`;
      else if (kw === curKw + 1) label = `Nächste Woche · KW ${kw} (${range})`;
      else if (kw === curKw - 1) label = `Vorige Woche · KW ${kw} (${range})`;

      return {
        weekId: wid,
        kw,
        label,
        dateRange: range,
        isCurrent: isCur,
        hasData,
        days: hasData ? found.days : []
      };
    });
}

function getSmartDefaultWeekId(weeks) {
  const now = new Date();
  const curKw = getISOWeekNumber(now);
  const dow = now.getDay(); // 0=So, 5=Fr, 6=Sa
  const preferNext = (dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 15));

  if (preferNext) {
    const nextWid = 'kw' + (curKw + 1);
    if (weeks.some(w => w.weekId === nextWid && w.hasData)) return nextWid;
  }
  const curWid = 'kw' + curKw;
  if (weeks.some(w => w.weekId === curWid && w.hasData)) return curWid;

  const upcoming = weeks.find(w => w.kw >= curKw && w.hasData);
  if (upcoming) return upcoming.weekId;

  const latest = [...weeks].reverse().find(w => w.hasData);
  return latest ? latest.weekId : curWid;
}

function selectWeek(weekId, fromSelect = false) {
  state.manualWeekChoice = true;
  state.selectedWeekId = weekId;
  triggerHaptic();
  renderAll();
  if (!fromSelect) {
    const wk = getWeeksList().find(w => w.weekId === weekId);
    announceSR(`Speiseplan für ${wk ? wk.label : weekId} angezeigt.`);
  }
}

function changeWeek(delta) {
  const weeks = getWeeksList();
  let idx = weeks.findIndex(w => w.weekId === state.selectedWeekId);
  if (idx === -1) idx = weeks.findIndex(w => w.isCurrent);
  if (idx === -1) idx = 0;
  const nextIdx = Math.max(0, Math.min(weeks.length - 1, idx + delta));
  selectWeek(weeks[nextIdx].weekId, false);
}

function selectDay(dayId) {
  state.selectedDay = dayId;
  savePrefs();
  triggerHaptic();
  renderAll();
  announceSR(`Tagesfilter: ${dayId === 'all' ? 'Ganze Woche' : dayId}.`);
}

function selectDiet(dietId) {
  state.dietFilter = dietId;
  savePrefs();
  triggerHaptic();
  renderAll();
  const labels = {
    all: 'Alle Menüs',
    menu1: 'Nur Menü 1 Vollkost',
    menu2: 'Nur Menü 2 Muslimisch ohne Schwein',
    menu3: 'Nur Menü 3 Vegetarisch'
  };
  announceSR(`Menü-Ansicht: ${labels[dietId] || 'Alle Menüs'}.`);
}

function renderAll() {
  const weeks = getWeeksList();
  const curKw = getISOWeekNumber();

  if (!state.selectedWeekId || !weeks.some(w => w.weekId === state.selectedWeekId)) {
    state.selectedWeekId = getSmartDefaultWeekId(weeks);
  }

  // Statusbar
  const statusEl = document.getElementById('status-bar');
  if (statusEl && state.canteen) {
    const src = state.canteen.source || 'LWL Mensa Soest';
    const upd = state.canteen.lastUpdated || 'Aktuell';
    statusEl.textContent = `Quelle: ${src} · Stand: ${upd}`;
  }

  // Dropdown
  const sel = document.getElementById('week-select');
  if (sel) {
    sel.innerHTML = weeks.map(w => `
      <option value="${escHtml(w.weekId)}" ${w.weekId === state.selectedWeekId ? 'selected' : ''}>
        ${escHtml(w.label)} ${w.hasData ? '✓' : '(kein Plan)'}
      </option>
    `).join('');
  }

  // Quick Week Pills
  const quickEl = document.getElementById('week-quick-pills');
  if (quickEl) {
    const quickKws = [curKw - 1, curKw, curKw + 1, curKw + 2].filter(k => k >= 1 && k <= 53);
    quickEl.innerHTML = quickKws.map(kw => {
      const wid = 'kw' + kw;
      const wkObj = weeks.find(w => w.weekId === wid);
      const active = state.selectedWeekId === wid;
      const tag = kw === curKw ? 'Diese Woche' : kw === curKw + 1 ? 'Nächste' : kw === curKw - 1 ? 'Vorige' : `KW ${kw}`;
      const label = (kw === curKw || kw === curKw + 1 || kw === curKw - 1) ? `KW ${kw} (${tag})` : `KW ${kw}`;
      return `
        <button type="button" class="pill-btn ${active ? 'active' : ''}"
                onclick="selectWeek('${wid}', false)"
                aria-pressed="${active}">
          ${escHtml(label)}${wkObj && wkObj.hasData ? '' : ' · leer'}
        </button>
      `;
    }).join('');
  }

  // Day Filter Bar
  const dayBar = document.getElementById('day-filter-bar');
  if (dayBar) {
    const dayBtns = [
      { id: 'all', label: 'Ganze Woche' },
      { id: 'Montag', label: 'Mo' },
      { id: 'Dienstag', label: 'Di' },
      { id: 'Mittwoch', label: 'Mi' },
      { id: 'Donnerstag', label: 'Do' },
      { id: 'Freitag', label: 'Fr' }
    ];
    dayBar.innerHTML = dayBtns.map(b => {
      const active = state.selectedDay === b.id;
      return `
        <button type="button" role="tab" aria-selected="${active}"
                class="pill-btn ${active ? 'active' : ''}"
                onclick="selectDay('${b.id}')">
          ${escHtml(b.label)}
        </button>
      `;
    }).join('');
  }

  // Diet Filter Bar
  const dietBar = document.getElementById('diet-filter-bar');
  if (dietBar) {
    const dietBtns = [
      { id: 'all', label: 'Alle Menüs' },
      { id: 'menu1', label: '🍲 Vollkost' },
      { id: 'menu2', label: '🥩 Ohne Schwein' },
      { id: 'menu3', label: '🥗 Vegetarisch' }
    ];
    dietBar.innerHTML = dietBtns.map(b => {
      const active = state.dietFilter === b.id;
      return `
        <button type="button" aria-pressed="${active}"
                class="pill-btn ${active ? 'active' : ''}"
                onclick="selectDiet('${b.id}')">
          ${escHtml(b.label)}
        </button>
      `;
    }).join('');
  }

  // Days Container
  const container = document.getElementById('canteen-container');
  if (!container) return;

  const activeWeek = weeks.find(w => w.weekId === state.selectedWeekId);
  if (!activeWeek || !activeWeek.hasData) {
    container.innerHTML = `
      <article class="empty-card">
        <h2>Noch kein Speiseplan für KW ${activeWeek ? activeWeek.kw : ''}</h2>
        <p>Für den Zeitraum <strong>${escHtml(activeWeek ? activeWeek.dateRange : '')}</strong> liegt aktuell noch kein Plan der Mensa vor.</p>
        <p>Neue Pläne erscheinen in der Regel am Freitag vor Beginn der Woche.</p>
        <button type="button" class="icon-btn primary" onclick="refreshCanteenPlans(false)">
          🔄 Jetzt neu laden
        </button>
      </article>
    `;
    return;
  }

  let days = activeWeek.days;
  if (state.selectedDay !== 'all') {
    days = days.filter(d => (d.day || '').toLowerCase() === state.selectedDay.toLowerCase());
  }

  if (days.length === 0) {
    container.innerHTML = `
      <article class="empty-card">
        <h2>Kein Eintrag für ${escHtml(state.selectedDay)}</h2>
        <p>Am Freitag findet im Internat in der Regel die Heimreise mit Snack- und Lunchpaket-Ausgabe bis 12:30 Uhr statt.</p>
        <button type="button" class="pill-btn active" onclick="selectDay('all')">Ganze Woche anzeigen</button>
      </article>
    `;
    return;
  }

  const showM1 = state.dietFilter === 'all' || state.dietFilter === 'menu1';
  const showM2 = state.dietFilter === 'all' || state.dietFilter === 'menu2';
  const showM3 = state.dietFilter === 'all' || state.dietFilter === 'menu3';

  let html = days.map(d => {
    const today = isDateToday(d.date);
    return `
      <article class="day-card ${today ? 'is-today' : ''}" aria-label="${escHtml(d.day)}, ${escHtml(d.date)}">
        <header class="day-header">
          <h2 class="day-title">
            <span>📅 ${escHtml(d.day)}, ${escHtml(d.date)}</span>
            ${today ? '<span class="today-badge">Heute</span>' : ''}
          </h2>
          <span class="serving-time">Ausgabe: 11:45 – 13:45 Uhr</span>
        </header>

        <div class="menus-grid">
          ${showM1 ? `
            <div class="menu-box">
              <div class="menu-box-header">
                <h3 class="menu-box-title">🍲 Menü 1</h3>
                <span class="menu-badge badge-m1">Vollkost</span>
              </div>
              <div class="dish-text">${escHtml(d.menu1 || 'Kein Angebot')}</div>
            </div>
          ` : ''}

          ${showM2 ? `
            <div class="menu-box">
              <div class="menu-box-header">
                <h3 class="menu-box-title">🥩 Menü 2</h3>
                <span class="menu-badge badge-m2">Ohne Schwein</span>
              </div>
              <div class="dish-text">${escHtml(d.menu2 || 'Kein Angebot')}</div>
            </div>
          ` : ''}

          ${showM3 ? `
            <div class="menu-box">
              <div class="menu-box-header">
                <h3 class="menu-box-title">🥗 Menü 3</h3>
                <span class="menu-badge badge-m3">Vegetarisch</span>
              </div>
              <div class="dish-text">${escHtml(d.menu3 || 'Kein Angebot')}</div>
            </div>
          ` : ''}
        </div>

        ${(d.breakfast || d.extra || d.dinner) ? `
          <div class="side-grid">
            ${d.breakfast ? `
              <div class="side-box">
                <h4 class="side-title">🥐 Frühstück</h4>
                <div class="dish-text">${escHtml(d.breakfast)}</div>
              </div>
            ` : ''}
            ${d.extra ? `
              <div class="side-box">
                <h4 class="side-title">🥗 Salattheke &amp; Extras</h4>
                <div class="dish-text">${escHtml(d.extra)}</div>
              </div>
            ` : ''}
            ${d.dinner ? `
              <div class="side-box">
                <h4 class="side-title">🥪 Abendessen (Internat)</h4>
                <div class="dish-text">${escHtml(d.dinner)}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </article>
    `;
  }).join('');

  if (state.selectedDay === 'all' && !days.some(d => (d.day || '').toLowerCase() === 'freitag')) {
    html += `
      <article class="day-card" style="border-style: dashed;">
        <header class="day-header" style="border-bottom: none; padding-bottom: 0;">
          <h2 class="day-title">🚌 Freitag (Heimreisetag)</h2>
          <span class="serving-time">Mensa bis 12:30 Uhr</span>
        </header>
        <p style="margin: 0; color: var(--text-secondary);">
          Am Freitag gibt es belegte Brötchen, Snacks und Lunchpakete für die Heimreise.
        </p>
      </article>
    `;
  }

  container.innerHTML = html;
}

function readCurrentPlanAloud() {
  const weeks = getWeeksList();
  const activeWeek = weeks.find(w => w.weekId === state.selectedWeekId);
  if (!activeWeek || !activeWeek.hasData) {
    speakText('Für die ausgewählte Woche liegt noch kein Speiseplan vor.');
    return;
  }

  let targetDay = null;
  if (state.selectedDay !== 'all') {
    targetDay = activeWeek.days.find(d => (d.day || '').toLowerCase() === state.selectedDay.toLowerCase());
  } else {
    targetDay = activeWeek.days.find(d => isDateToday(d.date)) || activeWeek.days[0];
  }
  if (!targetDay) targetDay = activeWeek.days[0];

  const clean = (t) => String(t || '').replace(/\n/g, ', ');
  let msg = `Speiseplan für ${targetDay.day}, den ${targetDay.date}. `;
  if ((state.dietFilter === 'all' || state.dietFilter === 'menu1') && targetDay.menu1) {
    msg += `Menü 1 Vollkost: ${clean(targetDay.menu1)}. `;
  }
  if ((state.dietFilter === 'all' || state.dietFilter === 'menu2') && targetDay.menu2) {
    msg += `Menü 2 Muslimisch ohne Schwein: ${clean(targetDay.menu2)}. `;
  }
  if ((state.dietFilter === 'all' || state.dietFilter === 'menu3') && targetDay.menu3) {
    msg += `Menü 3 Vegetarisch: ${clean(targetDay.menu3)}. `;
  }
  if (targetDay.extra) {
    msg += `Zusatzangebot: ${clean(targetDay.extra)}.`;
  }
  speakText(msg);
}

function speakText(text) {
  announceSR(text, 'assertive');
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'de-DE';
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    }
  } catch (_) {}
}

async function fetchJsonSafe(url) {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp && url.startsWith('http')) {
    try {
      const res = await window.Capacitor.Plugins.CapacitorHttp.get({ url });
      if (res.status >= 200 && res.status < 300 && res.data) {
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }
    } catch (_) {}
  }
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return await resp.json();
}

async function refreshCanteenPlans(silent = false) {
  const btn = document.getElementById('btn-refresh');
  if (btn && !silent) btn.disabled = true;

  let loaded = null;
  try {
    const remote = await fetchJsonSafe(`${REMOTE_FEED_URL}?t=${Date.now()}`);
    if (remote && Array.isArray(remote.weeks) && remote.weeks.length > 0) {
      loaded = remote;
    }
  } catch (_) {}

  if (!loaded) {
    try {
      const localSeed = await fetchJsonSafe('canteen_seed.json');
      if (localSeed && Array.isArray(localSeed.weeks) && localSeed.weeks.length > 0) {
        loaded = localSeed;
      }
    } catch (_) {}
  }

  if (loaded) {
    state.canteen = loaded;
    const weeks = getWeeksList();
    if (!state.manualWeekChoice) {
      state.selectedWeekId = getSmartDefaultWeekId(weeks);
    }
    savePrefs();
    renderAll();
    if (!silent) {
      const activeWk = weeks.find(w => w.weekId === state.selectedWeekId);
      announceSR(`Speisepläne aktualisiert. Kalenderwoche ${activeWk ? activeWk.kw : ''} wird angezeigt.`, 'assertive');
    }
  } else {
    renderAll();
    if (!silent) {
      announceSR('Offline-Modus: Gespeicherter Speiseplan wird angezeigt.', 'assertive');
    }
  }

  if (btn) btn.disabled = false;
}

async function initApp() {
  loadPrefs();
  applyAppearance();

  // Sofort lokalen Seed laden, damit ohne Verzögerung etwas sichtbar ist
  if (!state.canteen) {
    try {
      const seed = await fetchJsonSafe('canteen_seed.json');
      if (seed && Array.isArray(seed.weeks)) {
        state.canteen = seed;
      }
    } catch (_) {}
  }
  renderAll();

  // Im Hintergrund sofort den neuesten Live-Stand laden
  refreshCanteenPlans(true);
}

document.addEventListener('DOMContentLoaded', initApp);
