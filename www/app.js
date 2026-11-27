'use strict';

const STORAGE_KEY = 'lwl_speiseplan_android_v2';
const REMOTE_CANTEEN_URL = 'https://raw.githubusercontent.com/Lauju1909/BarrierefreiesWebUntis/main/canteen_seed.json';

let currentTab = 'canteen';

let appData = {
  settings: {
    theme: 'theme-light',
    fontSize: 'font-normal',
    ttsEnabled: true,
    ttsRate: 1.0,
    textOnlyMode: false,
    dietFilter: 'all'
  },
  canteen: null,
  selectedCanteenWeek: null,
  selectedCanteenDay: 'all'
};

// =============================================================================
// 1. HILFSFUNKTIONEN, SCREENREADER & SPRACHAUSGABE (WIE IM STUNDENPLAN)
// =============================================================================
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function announceSR(text, priority = 'polite') {
  const el = document.getElementById(priority === 'assertive' ? 'sr-live-assertive' : 'sr-live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}

function speak(text, force = false) {
  if (!force && appData.settings && appData.settings.ttsEnabled === false) return;
  if (!appData.settings.ttsEnabled && force) {
    announceSR(text, 'assertive');
    return;
  }
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      utterance.rate = parseFloat(appData.settings.ttsRate) || 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (_) {}
}

function triggerHaptic() {
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
    }
  } catch (_) {}
}

function saveAppData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (_) {}
}

function loadAppData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.settings) {
      appData.settings = Object.assign({}, appData.settings, parsed.settings);
    }
    if (parsed.canteen && Array.isArray(parsed.canteen.weeks)) {
      appData.canteen = parsed.canteen;
    }
    if (parsed.selectedCanteenWeek) {
      appData.selectedCanteenWeek = parsed.selectedCanteenWeek;
    }
    if (parsed.selectedCanteenDay) {
      appData.selectedCanteenDay = parsed.selectedCanteenDay;
    }
  } catch (_) {}
}

// =============================================================================
// 2. REITER-NAVIGATION (1 = SPEISEPLAN, 2 = EINSTELLUNGEN)
// =============================================================================
function switchTab(tabId) {
  currentTab = tabId;
  const tabs = ['canteen', 'settings'];
  tabs.forEach(t => {
    const btn = document.getElementById('tab-' + t);
    const panel = document.getElementById('view-' + t);
    const isActive = (t === tabId);
    if (btn) {
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    }
    if (panel) {
      panel.classList.toggle('active', isActive);
    }
  });

  triggerHaptic();
  if (tabId === 'canteen') {
    renderCanteenView();
    announceSR('Reiter Mensa und Speisepläne geöffnet.', 'polite');
  } else if (tabId === 'settings') {
    syncSettingsForm();
    announceSR('Reiter Einstellungen geöffnet.', 'polite');
  }
}

// =============================================================================
// 3. EINSTELLUNGEN (1:1 WIE IM STUNDENPLAN)
// =============================================================================
function applySettings() {
  const body = document.getElementById('app-body') || document.body;
  body.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');
  body.classList.add(appData.settings.theme || 'theme-light');

  body.classList.remove('font-normal', 'font-large', 'font-xlarge');
  body.classList.add(appData.settings.fontSize || 'font-normal');

  body.classList.toggle('text-only-mode', !!appData.settings.textOnlyMode);
}

function syncSettingsForm() {
  const themeEl = document.getElementById('cfg-theme');
  const fontEl = document.getElementById('cfg-font-size');
  const rateEl = document.getElementById('cfg-tts-rate');
  const ttsEl = document.getElementById('cfg-tts');
  const textOnlyEl = document.getElementById('cfg-text-only');
  const dietEl = document.getElementById('cfg-diet-filter');

  if (themeEl) themeEl.value = appData.settings.theme || 'theme-light';
  if (fontEl) fontEl.value = appData.settings.fontSize || 'font-normal';
  if (rateEl) rateEl.value = String(appData.settings.ttsRate || '1.0');
  if (ttsEl) ttsEl.checked = appData.settings.ttsEnabled !== false;
  if (textOnlyEl) textOnlyEl.checked = !!appData.settings.textOnlyMode;
  if (dietEl) dietEl.value = appData.settings.dietFilter || 'all';

  const srcEl = document.getElementById('settings-canteen-source');
  const updEl = document.getElementById('settings-canteen-updated');
  if (srcEl && appData.canteen) {
    srcEl.textContent = appData.canteen.source || 'LWL-Von-Vincke-Schule Soest & BBW Soest';
  }
  if (updEl && appData.canteen) {
    updEl.textContent = 'Letzte Aktualisierung: ' + (appData.canteen.lastUpdated || 'Aktuell');
  }
}

function saveSettings(e) {
  if (e && e.preventDefault) e.preventDefault();
  const themeEl = document.getElementById('cfg-theme');
  const fontEl = document.getElementById('cfg-font-size');
  const rateEl = document.getElementById('cfg-tts-rate');
  const ttsEl = document.getElementById('cfg-tts');
  const textOnlyEl = document.getElementById('cfg-text-only');
  const dietEl = document.getElementById('cfg-diet-filter');

  if (themeEl) appData.settings.theme = themeEl.value;
  if (fontEl) appData.settings.fontSize = fontEl.value;
  if (rateEl) appData.settings.ttsRate = parseFloat(rateEl.value) || 1.0;
  if (ttsEl) appData.settings.ttsEnabled = ttsEl.checked;
  if (textOnlyEl) appData.settings.textOnlyMode = textOnlyEl.checked;
  if (dietEl) appData.settings.dietFilter = dietEl.value;

  applySettings();
  saveAppData();
  renderCanteenView();
  triggerHaptic();
  announceSR('Einstellungen wurden gespeichert und angewendet.', 'polite');
}

function resetCanteenCache() {
  appData.canteen = null;
  appData.selectedCanteenWeek = null;
  window._canteenWeekManuallySelected = false;
  saveAppData();
  refreshCanteenData(false);
}

// =============================================================================
// 4. SPEISEPLAN-LOGIK (1:1 VERHALTEN WIE IM STUNDENPLAN)
// =============================================================================
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
  const ISOweekStart = new Date(simple);
  if (dow <= 4) ISOweekStart.setUTCDate(simple.getUTCDate() - simple.getUTCDay() + 1);
  else ISOweekStart.setUTCDate(simple.getUTCDate() + 8 - simple.getUTCDay());
  const mon = new Date(ISOweekStart);
  const fri = new Date(ISOweekStart);
  fri.setUTCDate(mon.getUTCDate() + 4);
  const fmt = (d) =>
    String(d.getUTCDate()).padStart(2, '0') + '.' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '.' +
    d.getUTCFullYear();
  return fmt(mon) + ' bis ' + fmt(fri);
}

function getCanteenData() {
  return appData.canteen || {
    source: 'LWL-Von-Vincke-Schule Soest & BBW Soest',
    lastUpdated: 'Lädt...',
    weeks: []
  };
}

function getFullCanteenWeeksList(canteenData) {
  const data = canteenData || getCanteenData();
  const knownWeeks = (data && Array.isArray(data.weeks)) ? data.weeks : [];
  const knownDict = {};
  knownWeeks.forEach(w => { if (w && w.weekId) knownDict[w.weekId] = w; });

  const now = new Date();
  const currentKw = getISOWeekNumber(now);
  const currentYear = now.getFullYear();

  const candidateKws = [
    currentKw - 1,
    currentKw,
    currentKw + 1,
    currentKw + 2,
    currentKw + 3
  ];

  Object.keys(knownDict).forEach(wid => {
    const w = knownDict[wid];
    if (typeof w.kw === 'number' && !candidateKws.includes(w.kw)) {
      candidateKws.push(w.kw);
    }
  });

  const validKws = candidateKws.filter(k => k >= 1 && k <= 53).sort((a, b) => a - b);

  return validKws.map(kw => {
    const wid = 'kw' + kw;
    const range = getDateRangeOfKW(currentYear, kw);
    const isCur = (kw === currentKw);

    let defaultLabel = 'Kalenderwoche ' + kw + ' (' + range + ')';
    if (isCur) {
      defaultLabel = 'Diese Woche (KW ' + kw + ': ' + range + ')';
    } else if (kw === currentKw - 1) {
      defaultLabel = 'Vorige Woche (KW ' + kw + ': ' + range + ')';
    } else if (kw === currentKw + 1) {
      defaultLabel = 'Nächste Woche (KW ' + kw + ': ' + range + ')';
    }

    if (knownDict[wid]) {
      const k = knownDict[wid];
      const hasDays = Array.isArray(k.days) && k.days.length > 0;
      return {
        weekId: wid,
        kw: kw,
        label: isCur ? ('Diese Woche (KW ' + kw + ': ' + (k.dateRange || range) + ')') : (k.label || defaultLabel),
        dateRange: k.dateRange || range,
        isCurrent: isCur,
        hasData: hasDays,
        days: k.days || []
      };
    }

    return {
      weekId: wid,
      kw: kw,
      label: defaultLabel,
      dateRange: range,
      isCurrent: isCur,
      hasData: false,
      days: []
    };
  });
}

function getSmartDefaultCanteenWeekId(allWeeks) {
  const now = new Date();
  const curKw = getISOWeekNumber(now);
  const dow = now.getDay(); // 0=So, 5=Fr, 6=Sa
  const isWeekendOrFriAfternoon = (dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 15));
  if (isWeekendOrFriAfternoon) {
    const nextWid = 'kw' + (curKw + 1);
    if (allWeeks && allWeeks.some(w => w.weekId === nextWid && w.hasData)) {
      return nextWid;
    }
  }
  const curWid = 'kw' + curKw;
  if (allWeeks && allWeeks.some(w => w.weekId === curWid && w.hasData)) {
    return curWid;
  }
  if (allWeeks) {
    const upcoming = allWeeks.find(w => w.kw >= curKw && w.hasData);
    if (upcoming) return upcoming.weekId;
    const latestWithData = [...allWeeks].reverse().find(w => w.hasData);
    if (latestWithData) return latestWithData.weekId;
  }
  return curWid;
}

function setCanteenWeek(weekId, fromSelect = false) {
  window._canteenWeekManuallySelected = true;
  if (appData.selectedCanteenWeek === weekId) return;
  appData.selectedCanteenWeek = weekId;
  saveAppData();
  triggerHaptic();
  renderCanteenView(fromSelect);
  if (!fromSelect) {
    const allWeeks = getFullCanteenWeeksList();
    const wk = allWeeks.find(w => w.weekId === weekId);
    const label = wk ? wk.label : weekId;
    announceSR(`Speiseplan für ${label} geladen.`, 'polite');
  }
}

function changeCanteenWeek(delta) {
  const allWeeks = getFullCanteenWeeksList();
  let currentIdx = allWeeks.findIndex(w => w.weekId === appData.selectedCanteenWeek);
  if (currentIdx === -1) {
    const curIdx = allWeeks.findIndex(w => w.isCurrent);
    currentIdx = curIdx !== -1 ? curIdx : 0;
  }
  let newIdx = currentIdx + delta;
  if (newIdx < 0) newIdx = 0;
  if (newIdx >= allWeeks.length) newIdx = allWeeks.length - 1;
  setCanteenWeek(allWeeks[newIdx].weekId, false);
}

function setCanteenDay(dayName) {
  appData.selectedCanteenDay = dayName;
  saveAppData();
  triggerHaptic();
  renderCanteenView();
  const label = dayName === 'all' ? 'Alle Wochentage' : dayName;
  announceSR(`Tagesfilter ${label} aktiviert.`, 'polite');
}

function isCanteenDateToday(dateStr) {
  if (!dateStr) return false;
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear());
  return dateStr.trim() === `${d}.${m}.${y}`;
}

function renderCanteenView() {
  const container = document.getElementById('canteen-days-container');
  if (!container) return;

  const data = getCanteenData();
  const allWeeks = getFullCanteenWeeksList(data);

  // 1. Wochenauswahl-Dropdown synchronisieren (identisch zum Stundenplan)
  const curKw = getISOWeekNumber();
  const smartWeekId = getSmartDefaultCanteenWeekId(allWeeks);
  let selectedWeekId = appData.selectedCanteenWeek;
  const savedKwNum = selectedWeekId ? parseInt(String(selectedWeekId).replace(/^kw/i, ''), 10) : 0;
  const smartKwNum = parseInt(String(smartWeekId).replace(/^kw/i, ''), 10) || curKw;
  if (
    !selectedWeekId ||
    !allWeeks.some(w => w.weekId === selectedWeekId) ||
    (!window._canteenWeekManuallySelected && savedKwNum < smartKwNum)
  ) {
    selectedWeekId = smartWeekId;
    appData.selectedCanteenWeek = selectedWeekId;
  }

  const weekSelect = document.getElementById('canteen-week-select');
  if (weekSelect) {
    weekSelect.innerHTML = allWeeks.map(w => `
      <option value="${escHtml(w.weekId)}" ${w.weekId === selectedWeekId ? 'selected' : ''}>
        ${escHtml(w.label)} ${w.hasData ? '(Speiseplan verfügbar)' : '(Noch kein Plan)'}
      </option>
    `).join('');
    if (weekSelect.value !== selectedWeekId) {
      weekSelect.value = selectedWeekId;
    }
  }

  // 2. Schnellwahl-Buttons für Wochen
  const quickNav = document.getElementById('canteen-week-quick-nav');
  if (quickNav) {
    const quickItems = [
      { id: 'kw' + (curKw - 1), label: 'KW ' + (curKw - 1) + ' (Vorige)' },
      { id: 'kw' + curKw, label: 'KW ' + curKw + ' (Diese Woche)' },
      { id: 'kw' + (curKw + 1), label: 'KW ' + (curKw + 1) + ' (Nächste)' },
      { id: 'kw' + (curKw + 2), label: 'KW ' + (curKw + 2) }
    ].filter(it => {
      const n = parseInt(it.id.replace('kw', ''), 10);
      return n >= 1 && n <= 53;
    });
    quickNav.innerHTML = quickItems.map(item => {
      const isSel = (selectedWeekId === item.id);
      return `
        <button type="button"
                class="canteen-day-btn ${isSel ? 'active' : ''}"
                style="font-size: 13px; padding: 5px 10px;"
                onclick="setCanteenWeek('${item.id}', false)"
                aria-label="${escHtml(item.label)}">
          ${escHtml(item.label)}
        </button>
      `;
    }).join('');
  }

  // 3. Status- und Quellen-Banner
  const statusBanner = document.getElementById('canteen-status-banner');
  if (statusBanner) {
    statusBanner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="canteen-source-tag">
          <span class="emoji-icon" aria-hidden="true">🏫 </span>
          <strong>Quelle:</strong> ${escHtml(data.source || 'LWL-Bildungszentrum Soest')}
        </span>
        <span style="color: var(--text-secondary); font-size: 13.5px;">
          <span class="emoji-icon" aria-hidden="true">🕒 </span>Stand: ${escHtml(data.lastUpdated || 'Aktuell')}
        </span>
      </div>
      <div style="font-size: 13.5px; color: var(--text-secondary);">
        <span class="emoji-icon" aria-hidden="true">ℹ️ </span>Offizieller Speiseplan (Mo–Do Vollkost, Muslimisch &amp; Vegetarisch)
      </div>
    `;
  }

  // 4. Tages-Schnellfilter-Leiste
  const dayFilterBar = document.getElementById('canteen-day-filter-bar');
  const selectedDay = appData.selectedCanteenDay || 'all';
  if (dayFilterBar) {
    const dayButtons = [
      { id: 'all', label: 'Ganze Woche' },
      { id: 'Montag', label: 'Montag' },
      { id: 'Dienstag', label: 'Dienstag' },
      { id: 'Mittwoch', label: 'Mittwoch' },
      { id: 'Donnerstag', label: 'Donnerstag' },
      { id: 'Freitag', label: 'Freitag' }
    ];
    dayFilterBar.innerHTML = dayButtons.map(btn => {
      const isActive = (selectedDay === btn.id);
      return `
        <button type="button"
                class="canteen-day-btn ${isActive ? 'active' : ''}"
                role="tab"
                aria-selected="${isActive}"
                onclick="setCanteenDay('${btn.id}')"
                aria-label="${btn.label} anzeigen">
          ${escHtml(btn.label)}
        </button>
      `;
    }).join('');
  }

  // 5. Gewählte Woche ermitteln & Tage darstellen
  const activeWeek = allWeeks.find(w => w.weekId === selectedWeekId) || allWeeks[1];
  if (!activeWeek || !activeWeek.hasData || !activeWeek.days || activeWeek.days.length === 0) {
    container.innerHTML = `
      <article class="canteen-day-card" style="padding: 34px 20px; text-align: center; border: 2px dashed var(--accent-info); background: var(--bg-surface-elevated);" aria-labelledby="heading-no-canteen-plan">
        <h3 id="heading-no-canteen-plan" class="canteen-day-title" style="justify-content: center; font-size: 1.3rem; margin-bottom: 12px;">
          <span class="emoji-icon" aria-hidden="true">📅 </span>Für diese Woche liegt noch kein Speiseplan vor
        </h3>
        <p style="font-size: 16px; color: var(--text-primary); max-width: 620px; margin: 0 auto 16px auto; line-height: 1.6;">
          Für die <strong>Kalenderwoche ${activeWeek ? activeWeek.kw : ''} (${escHtml(activeWeek ? activeWeek.dateRange : '')})</strong> hat die Mensa noch keinen Speiseplan herausgegeben.
        </p>
        <div style="background: var(--bg-surface); padding: 14px 18px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); display: inline-block; text-align: left; max-width: 550px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 14.5px; color: var(--text-secondary); line-height: 1.5;">
            <span class="emoji-icon" aria-hidden="true">ℹ️ </span><strong>Wann erscheint der Plan?</strong><br>
            Die Küche der Mensa (Von-Vincke-Schule &amp; BBW Soest) veröffentlicht neue Speisepläne gewöhnlich am <strong>Freitag vor Beginn der jeweiligen Schulwoche</strong>.
          </p>
        </div>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button type="button" class="btn btn-primary" onclick="refreshCanteenData(false)" aria-label="Jetzt prüfen ob ein Speiseplan veröffentlicht wurde">
            <span class="emoji-icon" aria-hidden="true">🔄 </span>Speisepläne jetzt neu abrufen (Taste A)
          </button>
          <button type="button" class="btn btn-secondary" onclick="setCanteenWeek('kw' + getISOWeekNumber(), false)" aria-label="Zur aktuellen Schulwoche (KW ${curKw}) zurückkehren">
            <span class="emoji-icon" aria-hidden="true">🍽️ </span>Zur aktuellen Woche (KW ${curKw})
          </button>
        </div>
      </article>
    `;
    return;
  }

  let daysToRender = activeWeek.days;
  if (selectedDay !== 'all') {
    daysToRender = activeWeek.days.filter(d => (d.day || '').toLowerCase() === selectedDay.toLowerCase());
  }

  const dietFilter = (appData.settings && appData.settings.dietFilter) || 'all';
  const showM1 = dietFilter === 'all' || dietFilter === 'menu1';
  const showM2 = dietFilter === 'all' || dietFilter === 'menu2';
  const showM3 = dietFilter === 'all' || dietFilter === 'menu3';

  let html = '';
  daysToRender.forEach(d => {
    const isToday = isCanteenDateToday(d.date);
    html += `
      <article class="canteen-day-card ${isToday ? 'is-today' : ''}" aria-labelledby="heading-day-${escHtml(d.day)}">
        <header class="canteen-day-header">
          <h3 id="heading-day-${escHtml(d.day)}" class="canteen-day-title">
            <span class="emoji-icon" aria-hidden="true">📅 </span>
            <span>${escHtml(d.day)}, ${escHtml(d.date)}</span>
            ${isToday ? '<span class="canteen-today-badge"><span class="emoji-icon" aria-hidden="true">🔴 </span>Heute</span>' : ''}
          </h3>
          <span style="font-size: 13.5px; color: var(--text-secondary); font-weight: 600;">
            Mensa Essensausgabe 11:45 – 13:45 Uhr
          </span>
        </header>

        <div class="canteen-menus-grid" role="region" aria-label="Mittagsmenüs">
          ${showM1 ? `
            <div class="canteen-menu-card">
              <div class="canteen-menu-header">
                <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary);">
                  <span class="emoji-icon" aria-hidden="true">🍲 </span>Menü 1: Vollkost
                </h4>
                <span class="canteen-menu-badge badge-vollkost">Vollkost</span>
              </div>
              <div class="canteen-dish-text">${escHtml(d.menu1 || 'Kein Angebot')}</div>
            </div>
          ` : ''}

          ${showM2 ? `
            <div class="canteen-menu-card">
              <div class="canteen-menu-header">
                <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary);">
                  <span class="emoji-icon" aria-hidden="true">🥩 </span>Menü 2: Muslimische Kost
                </h4>
                <span class="canteen-menu-badge badge-muslimisch">Ohne Schwein</span>
              </div>
              <div class="canteen-dish-text">${escHtml(d.menu2 || 'Kein Angebot')}</div>
            </div>
          ` : ''}

          ${showM3 ? `
            <div class="canteen-menu-card">
              <div class="canteen-menu-header">
                <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-primary);">
                  <span class="emoji-icon" aria-hidden="true">🥗 </span>Menü 3: Vegetarisch
                </h4>
                <span class="canteen-menu-badge badge-vegetarisch">Vegetarisch</span>
              </div>
              <div class="canteen-dish-text">${escHtml(d.menu3 || 'Kein Angebot')}</div>
            </div>
          ` : ''}
        </div>

        <div class="canteen-side-grid" role="region" aria-label="Zusatzangebot und weitere Mahlzeiten">
          ${d.breakfast ? `
            <div class="canteen-side-box">
              <h5 class="canteen-side-title"><span class="emoji-icon" aria-hidden="true">🥐 </span>Frühstück:</h5>
              <div class="canteen-dish-text">${escHtml(d.breakfast)}</div>
            </div>
          ` : ''}

          ${d.extra ? `
            <div class="canteen-side-box">
              <h5 class="canteen-side-title"><span class="emoji-icon" aria-hidden="true">🥗 </span>Salattheke &amp; Extras:</h5>
              <div class="canteen-dish-text">${escHtml(d.extra)}</div>
            </div>
          ` : ''}

          ${d.dinner ? `
            <div class="canteen-side-box">
              <h5 class="canteen-side-title"><span class="emoji-icon" aria-hidden="true">🥪 </span>Abendessen (Internat):</h5>
              <div class="canteen-dish-text">${escHtml(d.dinner)}</div>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  });

  if (selectedDay === 'all' && !daysToRender.some(d => (d.day || '').toLowerCase() === 'freitag')) {
    html += `
      <article class="canteen-day-card" style="border-style: dashed; background: var(--bg-surface-elevated);" aria-labelledby="heading-day-freitag">
        <header class="canteen-day-header" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">
          <h3 id="heading-day-freitag" class="canteen-day-title" style="font-size: 1.05rem;">
            <span class="emoji-icon" aria-hidden="true">🚌 </span>
            <span>Freitag (Heimreisetag / Lunchpakete)</span>
          </h3>
          <span style="font-size: 13px; color: var(--text-secondary);">Mensa geöffnet bis 12:30 Uhr</span>
        </header>
        <p style="margin: 8px 0 0 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5;">
          Am Freitag findet im Internat und Bildungszentrum die Heimreise statt. In der Mensa werden Snackangebote, belegte Brötchen und Lunchpakete ausgegeben.
        </p>
      </article>
    `;
  }

  container.innerHTML = html;
}

function readCanteenSummary() {
  const data = getCanteenData();
  const allWeeks = getFullCanteenWeeksList(data);
  const selectedWeekId = appData.selectedCanteenWeek || getSmartDefaultCanteenWeekId(allWeeks);
  const activeWeek = allWeeks.find(w => w.weekId === selectedWeekId) || allWeeks[1];

  if (!activeWeek || !activeWeek.hasData || !activeWeek.days || activeWeek.days.length === 0) {
    const kwLabel = activeWeek ? `Kalenderwoche ${activeWeek.kw}` : 'diese Woche';
    const msg = `Für die ${kwLabel} liegt noch kein Speiseplan der Mensa vor. Die Pläne werden in der Regel am Freitag der Vorwoche veröffentlicht.`;
    speak(msg, true);
    announceSR(msg, 'assertive');
    return;
  }

  const selectedDay = appData.selectedCanteenDay || 'all';
  let targetDay = null;
  if (selectedDay !== 'all') {
    targetDay = activeWeek.days.find(d => (d.day || '').toLowerCase() === selectedDay.toLowerCase());
  } else {
    targetDay = activeWeek.days.find(d => isCanteenDateToday(d.date)) || activeWeek.days[0];
  }
  if (!targetDay) targetDay = activeWeek.days[0];

  const dietFilter = (appData.settings && appData.settings.dietFilter) || 'all';
  let speech = `Mensa Speiseplan für ${targetDay.day}, den ${targetDay.date}. `;
  if ((dietFilter === 'all' || dietFilter === 'menu1') && targetDay.menu1) {
    speech += `Menü 1 Vollkost: ${targetDay.menu1.replace(/\n/g, ', ')}. `;
  }
  if ((dietFilter === 'all' || dietFilter === 'menu2') && targetDay.menu2) {
    speech += `Menü 2 Muslimische Kost ohne Schwein: ${targetDay.menu2.replace(/\n/g, ', ')}. `;
  }
  if ((dietFilter === 'all' || dietFilter === 'menu3') && targetDay.menu3) {
    speech += `Menü 3 Vegetarisch: ${targetDay.menu3.replace(/\n/g, ', ')}. `;
  }
  if (targetDay.extra) {
    speech += `Salattheke und Zusatzangebot: ${targetDay.extra.replace(/\n/g, ', ')}. `;
  }

  speak(speech, true);
  announceSR(speech, 'assertive');
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

async function refreshCanteenData(silent = false) {
  const btn = document.getElementById('btn-sync-canteen');
  const statusText = document.getElementById('sync-status-text');
  if (btn && !silent) {
    btn.disabled = true;
    btn.innerHTML = '<span class="emoji-icon" aria-hidden="true">⏳ </span>Lade Speisepläne...';
  }
  if (statusText) statusText.textContent = 'Aktualisiere...';

  if (!silent) {
    announceSR('Mensa-Speisepläne werden aus dem Internet synchronisiert...', 'assertive');
  }

  try {
    let freshData = null;

    // 1. Online GitHub Raw Live-Feed (funktioniert auf Android im Internet)
    try {
      const json = await fetchJsonSafe(REMOTE_CANTEEN_URL + '?t=' + Date.now());
      if (json && Array.isArray(json.weeks) && json.weeks.length > 0) {
        freshData = json;
      }
    } catch (_) {}

    // 2. Fallback: Lokale Datei canteen_seed.json (Android APK Assets / Offline-Seed)
    if (!freshData) {
      try {
        const json = await fetchJsonSafe('canteen_seed.json');
        if (json && Array.isArray(json.weeks) && json.weeks.length > 0) {
          freshData = json;
        }
      } catch (_) {}
    }

    if (freshData) {
      appData.canteen = freshData;
      const allWeeksNow = getFullCanteenWeeksList(appData.canteen);
      const smartWid = getSmartDefaultCanteenWeekId(allWeeksNow);
      const curSelectedObj = allWeeksNow.find(w => w.weekId === appData.selectedCanteenWeek);
      if (!appData.selectedCanteenWeek || !window._canteenWeekManuallySelected || !curSelectedObj || !curSelectedObj.hasData) {
        appData.selectedCanteenWeek = smartWid;
      }
      const activeKwLabel = String(appData.selectedCanteenWeek).replace(/^kw/i, '');
      saveAppData();
      renderCanteenView();
      syncSettingsForm();
      if (statusText) statusText.textContent = 'Aktuell (KW ' + activeKwLabel + ')';
      if (!silent) {
        const totalW = freshData.weeks.length;
        const successMsg = `Mensa-Speisepläne erfolgreich aktualisiert (${totalW} Wochen verfügbar. KW ${activeKwLabel} aktiv).`;
        speak(successMsg, true);
        announceSR(successMsg, 'assertive');
      }
      return true;
    } else {
      renderCanteenView();
      if (statusText) statusText.textContent = 'Offline-Modus';
      if (!silent) {
        const warnMsg = 'Speisepläne konnten nicht neu aus dem Internet geladen werden. Gespeicherter Speiseplan wird verwendet.';
        speak(warnMsg, true);
        announceSR(warnMsg, 'assertive');
      }
      return false;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="emoji-icon" aria-hidden="true">🔄 </span><strong>Aktualisieren (A)</strong>';
    }
  }
}

// =============================================================================
// 5. INITIALISIERUNG & TASTATURKÜRZEL (1, 2, A, V WIE IM STUNDENPLAN)
// =============================================================================
async function initApp() {
  loadAppData();
  applySettings();
  syncSettingsForm();

  // Tastaturkürzel wie im Stundenplan
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.ctrlKey || e.altKey || e.metaKey) return;

    if (e.key === '1') {
      e.preventDefault();
      switchTab('canteen');
    } else if (e.key === '2') {
      e.preventDefault();
      switchTab('settings');
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      refreshCanteenData(false);
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      readCanteenSummary();
    }
  });

  if (!appData.canteen) {
    try {
      const seed = await fetchJsonSafe('canteen_seed.json');
      if (seed && Array.isArray(seed.weeks)) {
        appData.canteen = seed;
      }
    } catch (_) {}
  }

  renderCanteenView();
  syncSettingsForm();

  // Im Hintergrund live aktualisieren
  refreshCanteenData(true);
}

document.addEventListener('DOMContentLoaded', initApp);
