// PIN lock — content stays hidden until the access code is entered.
// Unlock lasts for the browser session (cleared when the tab is closed).
const ACCESS_PIN = "1310";
(function pinGate() {
  const lock = document.getElementById("lock");
  const dots = document.querySelectorAll("#pin-dots span");
  const errorEl = document.getElementById("pin-error");
  let entry = "";

  function unlock() {
    document.body.classList.remove("locked");
    lock.classList.add("unlocked");
    sessionStorage.setItem("pinOk", "1");
  }

  if (sessionStorage.getItem("pinOk") === "1") { unlock(); return; }

  function paint() {
    dots.forEach((d, i) => d.classList.toggle("filled", i < entry.length));
  }
  function reject() {
    errorEl.classList.add("show");
    lock.classList.add("shake");
    setTimeout(() => lock.classList.remove("shake"), 400);
    entry = "";
    paint();
  }
  function press(key) {
    if (key === "del") {
      entry = entry.slice(0, -1);
      errorEl.classList.remove("show");
      paint();
      return;
    }
    if (entry.length >= 4) return;
    errorEl.classList.remove("show");
    entry += key;
    paint();
    if (entry.length === 4) {
      if (entry === ACCESS_PIN) unlock();
      else setTimeout(reject, 150);
    }
  }

  lock.querySelectorAll(".key").forEach(btn =>
    btn.addEventListener("click", () => press(btn.dataset.key))
  );
  document.addEventListener("keydown", e => {
    if (document.body.classList.contains("locked") === false) return;
    if (e.key >= "0" && e.key <= "9") press(e.key);
    else if (e.key === "Backspace") press("del");
  });
})();

// Data comes from a Google Sheet shared as "anyone with the link can view".
// Row-based format: columns "gage" (text), "player" (homme/femme/both),
// "min" / "max" (duration bounds in minutes), "keyword" (one or more
// filter tags, comma-separated),
// "weight" (optional draw weight, default 1) and "level" (soft/hard;
// the legacy "type" header is also accepted).
// A column-based layout (one soft column, one hard column) is still
// supported; such entries apply to both players with default durations.
const SHEET_ID = "1eSbNFqS38as8rDRG5yLwZljaFEV1aUk-dR4_718YBMM";
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv";
const MIN_MINUTES = 1;
const MAX_MINUTES = 10;

// Sound played when the timer ends: the segment [START, END] (seconds)
// of the mp3 below. Adjust the two timestamps to taste.
const END_SOUND_URL = "assets/SF-cum.mp3";
const END_SOUND_START = 0;
const END_SOUND_END = 3;

let activities = null;
let timerId = null;
let remaining = 0;
let player = localStorage.getItem("player") || "homme";
let selectedKeywords = new Set();
let endSound = null;
let endSoundStopper = null;
let paused = false;
let wakeLock = null;
let drawn = new Set(JSON.parse(localStorage.getItem("drawnGages") || "[]"));
let totalSeconds = 0;
let alternate = localStorage.getItem("alternate") === "1";
let hiddenTime = localStorage.getItem("hiddenTime") === "1";
let muted = localStorage.getItem("muted") === "1";
let score = JSON.parse(localStorage.getItem("score") || '{"homme":0,"femme":0}');
let currentGagePlayer = null;
let gageCounted = true;
let hasPicked = false;
let replaceArmed = false;
let replaceTimer = null;

const badge = document.getElementById("badge");
const itemEl = document.getElementById("item");
const countdownEl = document.getElementById("countdown");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const errorEl = document.getElementById("error");
const btnSoft = document.getElementById("btn-soft");
const btnHard = document.getElementById("btn-hard");
const btnPlus = document.getElementById("btn-plus");
const btnPause = document.getElementById("btn-pause");
const btnFinish = document.getElementById("btn-finish");
const btnHomme = document.getElementById("player-homme");
const btnFemme = document.getElementById("player-femme");
const keywordsEl = document.getElementById("keywords");
const noteEl = document.getElementById("note");
const btnSurprise = document.getElementById("btn-surprise");
const btnAlternate = document.getElementById("btn-alternate");
const btnHidden = document.getElementById("btn-hidden");
const btnSound = document.getElementById("btn-sound");
const scoreHommeEl = document.getElementById("score-homme");
const scoreFemmeEl = document.getElementById("score-femme");
const btnResetScore = document.getElementById("btn-reset-score");
const zoomEl = document.getElementById("zoom");
const ringEl = document.getElementById("ring");
const ringWrap = document.getElementById("ring-wrap");
const RING_CIRC = 2 * Math.PI * 54;

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// The "keyword" cell may hold several comma-separated tags. Return them
// as a deduped list of lowercase, trimmed, non-empty keywords.
function splitKeywords(cellValue) {
  const out = [];
  for (const kw of (cellValue || "").split(",")) {
    const k = kw.trim().toLowerCase();
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

function csvToActivities(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = {};
  headers.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
  const data = {};

  const levelIdx = "level" in idx ? idx.level : idx.type;
  if (levelIdx !== undefined) {
    // Row-based format: one entry per row.
    const textIdx = "gage" in idx
      ? idx.gage
      : headers.findIndex((h, i) => h && i !== levelIdx);
    const cell = (r, i) => (i !== undefined && r[i] !== undefined ? r[i] : "").trim();
    for (const r of rows.slice(1)) {
      const value = cell(r, textIdx);
      const key = cell(r, levelIdx).toLowerCase();
      if (!value || !key) continue;
      const weight = parseFloat(cell(r, idx.weight));
      (data[key] = data[key] || []).push({
        text: value,
        player: cell(r, idx.player).toLowerCase() || "both",
        min: parseInt(cell(r, idx.min), 10),
        max: parseInt(cell(r, idx.max), 10),
        keywords: splitKeywords(cell(r, idx.keyword)),
        weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      });
    }
  } else {
    // Column-based format: one column per key.
    headers.forEach(h => { if (h) data[h] = []; });
    for (const r of rows.slice(1)) {
      r.forEach((value, i) => {
        const key = headers[i];
        if (key && value && value.trim()) {
          data[key].push({ text: value.trim(), player: "both", min: NaN, max: NaN, keywords: [], weight: 1 });
        }
      });
    }
  }
  return data;
}

function isValid(data) {
  // At least one level bucket must have entries; a sheet with only
  // soft (or only hard) gages is valid — the draw handles empty pools.
  return data &&
    ((Array.isArray(data.soft) && data.soft.length > 0) ||
     (Array.isArray(data.hard) && data.hard.length > 0));
}

// Cache keys are bound to the sheet: switching SHEET_ID never shows
// stale data from a previous sheet.
const CACHE_KEY = "sheetCsv:" + SHEET_ID;
const CACHE_TIME_KEY = "sheetCsvTime:" + SHEET_ID;
let noteTimer = null;

function showNote(message, autoHide) {
  noteEl.textContent = message;
  noteEl.style.display = "block";
  clearTimeout(noteTimer);
  if (autoHide) noteTimer = setTimeout(() => { noteEl.style.display = "none"; }, 6000);
}

function applyData(text) {
  const data = csvToActivities(text);
  if (!isValid(data)) return false;
  activities = data;
  renderKeywords();
  return true;
}

function cacheAge() {
  const t = parseInt(localStorage.getItem(CACHE_TIME_KEY), 10);
  if (!t) return "";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return "";
  return " datant d'il y a " + days + " jour" + (days > 1 ? "s" : "");
}

// Stale-while-revalidate: render instantly from the cached copy, then
// always re-fetch the sheet; the network version wins when it differs.
async function loadData() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached && applyData(cached)) {
    console.info("Activities loaded from cache");
  }
  try {
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (text === cached) {
      console.info("Sheet unchanged since last visit");
      return;
    }
    if (!applyData(text)) throw new Error("missing soft/hard entries");
    localStorage.setItem(CACHE_KEY, text);
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    if (cached) showNote("Données mises à jour depuis la feuille Google.", true);
    console.info("Activities loaded from Google Sheet");
  } catch (err) {
    if (activities) {
      showNote("Feuille Google injoignable — utilisation des données en cache" + cacheAge() + ".");
      console.warn("Sheet unreachable (" + err.message + "), using cached data");
    } else {
      btnSoft.disabled = true;
      btnHard.disabled = true;
      btnSurprise.disabled = true;
      errorEl.textContent = "Impossible de charger les gages depuis la feuille Google (" +
        err.message + "). Vérifie que la feuille est partagée en « Tous les utilisateurs disposant du lien ».";
      errorEl.style.display = "block";
    }
  }
}

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + ":" + String(s).padStart(2, "0");
}

// Render the countdown; "temps caché" masks it while the gage runs.
function renderCountdown() {
  const ended = countdownEl.classList.contains("done");
  countdownEl.textContent = (hiddenTime && !ended && remaining > 0)
    ? "🙈"
    : formatTime(Math.max(remaining, 0));
}

function updateRing() {
  // Hidden-time mode: the ring would leak the remaining time, keep it full.
  const frac = (hiddenTime && remaining > 0 && !ringWrap.classList.contains("done"))
    ? 1
    : (totalSeconds > 0 ? Math.max(remaining, 0) / totalSeconds : 0);
  ringEl.style.strokeDashoffset = String(RING_CIRC * (1 - frac));
}

// Audio must be unlocked during a user gesture (autoplay policy), so
// pick() calls this: it loads the mp3 and does a muted play/pause to
// authorize later playback when the timer ends.
function ensureAudio() {
  if (endSound) return;
  endSound = new Audio(END_SOUND_URL);
  endSound.preload = "auto";
  endSound.muted = true;
  const p = endSound.play();
  if (p) p.then(() => {
    endSound.pause();
    endSound.muted = false;
    endSound.currentTime = 0;
  }).catch(() => { endSound.muted = false; });
}

// Play the [END_SOUND_START, END_SOUND_END] segment of the mp3.
function playEndSound() {
  if (!endSound || muted) return;
  clearTimeout(endSoundStopper);
  endSound.currentTime = END_SOUND_START;
  endSound.play().catch(() => {});
  endSoundStopper = setTimeout(() => {
    endSound.pause();
  }, (END_SOUND_END - END_SOUND_START) * 1000);
}

// Keep the screen awake while the countdown runs (mobile screens would
// otherwise lock mid-gage). The lock is auto-released when the tab is
// hidden, so it is re-acquired on return if the timer is still running.
async function acquireWakeLock() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch (err) { /* unsupported or denied — not critical */ }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && timerId) acquireWakeLock();
});

function updateScoreDisplay() {
  scoreHommeEl.textContent = String(score.homme || 0);
  scoreFemmeEl.textContent = String(score.femme || 0);
}

function countGageDone() {
  if (gageCounted || !currentGagePlayer) return;
  gageCounted = true;
  score[currentGagePlayer] = (score[currentGagePlayer] || 0) + 1;
  localStorage.setItem("score", JSON.stringify(score));
  updateScoreDisplay();
}

function celebrate(message) {
  clearInterval(timerId);
  timerId = null;
  paused = false;
  countdownEl.classList.add("done");
  ringWrap.classList.add("done");
  renderCountdown();
  updateRing();
  statusEl.textContent = message;
  btnPause.disabled = true;
  btnFinish.disabled = true;
  releaseWakeLock();
  playEndSound();
  if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
  countGageDone();
}

function tick() {
  remaining--;
  renderCountdown();
  updateRing();
  if (remaining <= 0) {
    celebrate("Temps écoulé ! Bien joué 🎉");
  }
}

// "Terminé": the gage is done before the clock runs out — stop the
// timer and wait for the next draw.
function finishGage() {
  if (!resultEl.classList.contains("visible") || btnFinish.disabled) return;
  celebrate("Gage terminé 🎉 À qui le tour ?");
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(tick, 1000);
  paused = false;
  btnPause.textContent = "⏸";
  btnPause.disabled = false;
  btnFinish.disabled = false;
  acquireWakeLock();
}

function togglePause() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
    paused = true;
    btnPause.textContent = "▶";
    statusEl.textContent = "En pause";
    releaseWakeLock();
  } else if (paused && remaining > 0) {
    statusEl.textContent = "C'est reparti !";
    startTimer();
  }
}

let keywordUniverse = null;

function renderKeywords() {
  const keywords = [];
  for (const key of Object.keys(activities)) {
    for (const g of activities[key]) {
      for (const kw of g.keywords) {
        if (!keywords.includes(kw)) keywords.push(kw);
      }
    }
  }
  if (keywordUniverse) {
    // Re-render after a background data refresh: keep the user's
    // choices; keywords that are new to the sheet start selected.
    selectedKeywords = new Set(keywords.filter(kw =>
      keywordUniverse.has(kw) ? selectedKeywords.has(kw) : true));
  } else {
    selectedKeywords = new Set(keywords);
  }
  keywordUniverse = new Set(keywords);
  keywordsEl.innerHTML = "";
  for (const kw of keywords) {
    const btn = document.createElement("button");
    btn.className = "kw" + (selectedKeywords.has(kw) ? " active" : "");
    btn.textContent = kw;
    btn.setAttribute("aria-pressed", String(selectedKeywords.has(kw)));
    btn.addEventListener("click", () => {
      if (selectedKeywords.has(kw)) selectedKeywords.delete(kw);
      else selectedKeywords.add(kw);
      btn.classList.toggle("active", selectedKeywords.has(kw));
      btn.setAttribute("aria-pressed", String(selectedKeywords.has(kw)));
    });
    keywordsEl.appendChild(btn);
  }
}

function setPlayer(p) {
  player = p;
  localStorage.setItem("player", p);
  btnHomme.classList.toggle("active", p === "homme");
  btnFemme.classList.toggle("active", p === "femme");
  btnHomme.setAttribute("aria-pressed", String(p === "homme"));
  btnFemme.setAttribute("aria-pressed", String(p === "femme"));
}

function weightedPick(list) {
  const total = list.reduce((sum, g) => sum + g.weight, 0);
  let r = Math.random() * total;
  for (const g of list) {
    r -= g.weight;
    if (r <= 0) return g;
  }
  return list[list.length - 1];
}

function pick(key) {
  if (!activities) return;
  ensureAudio();
  // Guard against accidental taps: replacing a running gage takes two
  // clicks within 3 seconds.
  if (timerId && !replaceArmed) {
    replaceArmed = true;
    showNote("Un gage est en cours — reclique pour le remplacer.", true);
    clearTimeout(replaceTimer);
    replaceTimer = setTimeout(() => { replaceArmed = false; }, 3000);
    return;
  }
  replaceArmed = false;
  // "Chacun son tour": switch player automatically for each new gage.
  const p = (alternate && hasPicked)
    ? (player === "homme" ? "femme" : "homme")
    : player;
  const list = (activities[key] || []).filter(g =>
    (g.player === "both" || g.player === p) &&
    (!g.keywords.length || g.keywords.some(kw => selectedKeywords.has(kw))));
  if (!list.length) {
    errorEl.textContent = "Aucun gage ne correspond à cette sélection.";
    errorEl.style.display = "block";
    return;
  }
  if (p !== player) setPlayer(p);
  hasPicked = true;
  errorEl.style.display = "none";
  // Avoid repeats: draw among the gages not yet seen; once the whole
  // pool for this selection has been drawn, start a fresh round.
  let fresh = list.filter(g => !drawn.has(g.text));
  let newRound = false;
  if (!fresh.length) {
    list.forEach(g => drawn.delete(g.text));
    localStorage.setItem("drawnGages", JSON.stringify([...drawn]));
    fresh = list;
    newRound = true;
  }
  const gage = weightedPick(fresh);
  drawn.add(gage.text);
  localStorage.setItem("drawnGages", JSON.stringify([...drawn]));
  let lo = Number.isInteger(gage.min) ? gage.min : MIN_MINUTES;
  let hi = Number.isInteger(gage.max) ? gage.max : MAX_MINUTES;
  if (hi < lo) { const t = lo; lo = hi; hi = t; }
  const minutes = lo + Math.floor(Math.random() * (hi - lo + 1));
  remaining = minutes * 60;
  totalSeconds = remaining;
  currentGagePlayer = p;
  gageCounted = false;

  badge.textContent = key;
  badge.className = "badge " + key;
  itemEl.textContent = gage.text;
  countdownEl.classList.remove("done");
  ringWrap.className = "ring-wrap" + (key === "hard" ? " hard" : "");
  renderCountdown();
  updateRing();
  statusEl.textContent = (hiddenTime
    ? "Durée surprise — c'est parti !"
    : minutes + " minute" + (minutes > 1 ? "s" : "") + " — c'est parti !") +
    (newRound ? " (tous les gages ont été tirés, nouvelle tournée)" : "");
  resultEl.classList.add("visible");

  startTimer();
}

function addMinute() {
  if (!resultEl.classList.contains("visible")) return;
  remaining += 60;
  totalSeconds += 60;
  countdownEl.classList.remove("done");
  ringWrap.classList.remove("done");
  renderCountdown();
  updateRing();
  if (!timerId && !paused) {
    statusEl.textContent = "Encore une minute — c'est parti !";
    startTimer();
  }
}

// Small option toggles ------------------------------------------------

function bindToggle(btn, key, onChange) {
  btn.addEventListener("click", () => onChange(!btn.classList.contains("active")));
  return (on) => {
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  };
}

const paintAlternate = bindToggle(btnAlternate, "alternate", (on) => {
  alternate = on;
  localStorage.setItem("alternate", on ? "1" : "0");
  paintAlternate(on);
});

const paintHidden = bindToggle(btnHidden, "hiddenTime", (on) => {
  hiddenTime = on;
  localStorage.setItem("hiddenTime", on ? "1" : "0");
  paintHidden(on);
  renderCountdown();
  updateRing();
});

const paintSound = bindToggle(btnSound, "muted", (on) => {
  muted = !on; // the toggle shows "sound ON"
  localStorage.setItem("muted", muted ? "1" : "0");
  paintSound(on);
  btnSound.textContent = muted ? "🔇 son" : "🔊 son";
});

// "Surprise" picks a level (soft or hard) at random.
function surprise() {
  if (!activities) return;
  const levels = ["soft", "hard"].filter(k => (activities[k] || []).length);
  if (!levels.length) return;
  const level = levels[Math.floor(Math.random() * levels.length)];
  pick(level);
}

// Fullscreen gage display ----------------------------------------------

function openZoom() {
  if (!itemEl.textContent) return;
  zoomEl.textContent = itemEl.textContent;
  zoomEl.classList.add("visible");
}

function closeZoom() {
  zoomEl.classList.remove("visible");
}

function resetScore() {
  score = { homme: 0, femme: 0 };
  localStorage.setItem("score", JSON.stringify(score));
  updateScoreDisplay();
}

btnSoft.addEventListener("click", () => pick("soft"));
btnHard.addEventListener("click", () => pick("hard"));
btnSurprise.addEventListener("click", surprise);
btnPlus.addEventListener("click", addMinute);
btnPause.addEventListener("click", togglePause);
btnFinish.addEventListener("click", finishGage);
btnHomme.addEventListener("click", () => setPlayer("homme"));
btnFemme.addEventListener("click", () => setPlayer("femme"));
itemEl.addEventListener("click", openZoom);
zoomEl.addEventListener("click", closeZoom);
btnResetScore.addEventListener("click", resetScore);

setPlayer(player);
paintAlternate(alternate);
paintHidden(hiddenTime);
paintSound(!muted);
btnSound.textContent = muted ? "🔇 son" : "🔊 son";
updateScoreDisplay();
loadData();

// PWA: offline support for the app shell (the sheet data is already
// cached in localStorage by loadData).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
