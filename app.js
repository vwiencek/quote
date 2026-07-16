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
// One gage per row: a text column whose header contains "gage" (e.g.
// "Gage détaillé"), "player" (homme/femme/both), "min" / "max" (duration
// bounds in minutes), "keyword" (one or more filter tags, comma-separated),
// "weight" (optional draw weight, default 1) and "intensité" (1-10; the
// slider draws among the gages closest to the chosen value).
// Display names: the drawn gage is prefixed with the name of the player
// it is addressed to.
const PLAYER_NAMES = { homme: "Vincent", femme: "Carole" };

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
let endAt = 0; // wall-clock timestamp (ms) when the countdown reaches zero
let alternate = localStorage.getItem("alternate") === "1";
let hiddenTime = localStorage.getItem("hiddenTime") === "1";
// Intensity slider (1-10), persisted; default in the middle of the scale.
let intensityLevel = Math.min(10, Math.max(1, parseInt(localStorage.getItem("intensityLevel"), 10) || 7));
let muted = localStorage.getItem("muted") === "1";
// Score is per playing session (reset when the tab is closed), matching
// the "score de session" intent — kept in sessionStorage.
let score = JSON.parse(sessionStorage.getItem("score") || '{"homme":0,"femme":0}');
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
const btnGo = document.getElementById("btn-go");
const intensitySlider = document.getElementById("intensity");
const intensityValEl = document.getElementById("intensity-val");
const btnPlus = document.getElementById("btn-plus");
const btnPause = document.getElementById("btn-pause");
const btnFinish = document.getElementById("btn-finish");
const btnSkip = document.getElementById("btn-skip");
const btnSpeak = document.getElementById("btn-speak");
const btnHomme = document.getElementById("player-homme");
const btnFemme = document.getElementById("player-femme");
const keywordsEl = document.getElementById("keywords");
const noteEl = document.getElementById("note");
const btnAlternate = document.getElementById("btn-alternate");
const btnHidden = document.getElementById("btn-hidden");
const btnSound = document.getElementById("btn-sound");
const scoreHommeEl = document.getElementById("score-homme");
const scoreFemmeEl = document.getElementById("score-femme");
const btnResetScore = document.getElementById("btn-reset-score");
const totalGagesEl = document.getElementById("total-gages");
const zoomEl = document.getElementById("zoom");
const ringEl = document.getElementById("ring");
const ringWrap = document.getElementById("ring-wrap");
const RING_CIRC = 2 * Math.PI * 95;

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
  if (!rows.length || !rows[0]) return []; // empty/malformed input -> invalid
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = {};
  headers.forEach((h, i) => { if (h && !(h in idx)) idx[h] = i; });
  // Text column: "gage" or any header containing it ("gage détaillé"...).
  const textIdx = "gage" in idx
    ? idx.gage
    : headers.findIndex(h => h && h.includes("gage"));
  const intIdx = ["intensité", "intensite", "intensity"]
    .map(k => idx[k]).find(v => v !== undefined);
  if (textIdx === -1 || intIdx === undefined) return [];
  const cell = (r, i) => (i !== undefined && r[i] !== undefined ? r[i] : "").trim();
  const data = [];
  for (const r of rows.slice(1)) {
    const value = cell(r, textIdx);
    const intensity = parseInt(cell(r, intIdx), 10);
    if (!value || !Number.isFinite(intensity)) continue; // no text/intensity -> skipped
    const weight = parseFloat(cell(r, idx.weight));
    data.push({
      text: value,
      player: cell(r, idx.player).toLowerCase() || "both",
      min: parseInt(cell(r, idx.min), 10),
      max: parseInt(cell(r, idx.max), 10),
      keywords: splitKeywords(cell(r, idx.keyword)),
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      intensity: Math.min(10, Math.max(1, intensity)),
    });
  }
  return data;
}

function isValid(data) {
  return Array.isArray(data) && data.length > 0;
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
  btnGo.disabled = false;
  renderKeywords();
  updateTotalGages();
  return true;
}

// Total number of gages loaded from the sheet.
function updateTotalGages() {
  const n = activities.length;
  totalGagesEl.textContent = n + " gage" + (n > 1 ? "s" : "") + " au total";
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
  // A corrupt cache must not abort the load — swallow it and revalidate.
  try {
    if (cached && applyData(cached)) console.info("Activities loaded from cache");
  } catch (e) {
    console.warn("Ignoring unreadable cached data:", e);
  }
  // Abort a hung connection so the offline/error fallback still fires.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(SHEET_CSV_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (text === cached) {
      console.info("Sheet unchanged since last visit");
      return;
    }
    if (!applyData(text)) throw new Error("missing soft/hard entries");
    try {
      localStorage.setItem(CACHE_KEY, text);
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch (e) {
      console.warn("Could not cache sheet (storage full?):", e);
    }
    if (cached) showNote("Données mises à jour depuis la feuille Google.", true);
    console.info("Activities loaded from Google Sheet");
  } catch (err) {
    clearTimeout(timeout);
    if (activities) {
      showNote("Feuille Google injoignable — utilisation des données en cache" + cacheAge() + ".");
      console.warn("Sheet unreachable (" + err.message + "), using cached data");
    } else {
      btnGo.disabled = true;
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
// authorize later playback when the timer ends. The element stays MUTED
// from here on — only playEndSound() unmutes it, for the end segment —
// so a button click never produces any audible sound.
function ensureAudio() {
  if (endSound) return;
  endSound = new Audio(END_SOUND_URL);
  endSound.preload = "auto";
  endSound.muted = true;
  // Stop the unlock playback the moment it starts — as a safety net in case
  // a browser is slow to honour `muted` or leaves the play() promise
  // pending (which would otherwise let the whole clip play through).
  const stop = () => { endSound.pause(); endSound.currentTime = 0; };
  endSound.addEventListener("playing", stop, { once: true });
  const p = endSound.play();
  if (p && p.then) p.then(stop).catch(() => {});
  else stop();
}

// Play the [END_SOUND_START, END_SOUND_END] segment of the mp3. The
// element is unmuted only for the duration of the segment, then muted
// and paused again.
function playEndSound() {
  if (!endSound || muted) return;
  clearTimeout(endSoundStopper);
  endSound.muted = false;
  endSound.currentTime = END_SOUND_START;
  endSound.play().catch(() => {});
  endSoundStopper = setTimeout(() => {
    endSound.pause();
    endSound.muted = true;
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
  if (document.visibilityState === "visible" && timerId) {
    acquireWakeLock();
    tick(); // re-sync the display to real elapsed time after being hidden
  }
});

function updateScoreDisplay() {
  scoreHommeEl.textContent = String(score.homme || 0);
  scoreFemmeEl.textContent = String(score.femme || 0);
}

function countGageDone() {
  if (gageCounted || !currentGagePlayer) return;
  gageCounted = true;
  score[currentGagePlayer] = (score[currentGagePlayer] || 0) + 1;
  sessionStorage.setItem("score", JSON.stringify(score));
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

// Derive the remaining seconds from a wall-clock deadline rather than
// counting ticks: background tabs throttle setInterval (and the wake lock
// is dropped when hidden), so a tick-counting timer would run too slow.
function tick() {
  const msLeft = endAt - Date.now();
  remaining = Math.max(0, Math.ceil(msLeft / 1000));
  renderCountdown();
  updateRing();
  if (msLeft <= 0) {
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
  ringWrap.classList.remove("ready");
  endAt = Date.now() + remaining * 1000;
  timerId = setInterval(tick, 500);
  paused = false;
  btnPause.textContent = "⏸";
  btnPause.disabled = false;
  btnFinish.disabled = false;
  acquireWakeLock();
}

function togglePause() {
  if (timerId) {
    // Freeze the remaining seconds from the deadline before stopping.
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    clearInterval(timerId);
    timerId = null;
    paused = true;
    btnPause.textContent = "▶";
    statusEl.textContent = "En pause";
    releaseWakeLock();
  } else if (remaining > 0 && !ringWrap.classList.contains("done")) {
    // Idle (fresh draw) -> start; paused -> resume.
    statusEl.textContent = paused ? "C'est reparti !" : "C'est parti !";
    startTimer();
  }
}

let keywordUniverse = null;

function renderKeywords() {
  const keywords = [];
  for (const g of activities) {
    for (const kw of g.keywords) {
      if (!keywords.includes(kw)) keywords.push(kw);
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
  if (!keywords.length) return;
  // "Tout / Rien": select all categories, or clear them all.
  const allBtn = document.createElement("button");
  allBtn.className = "kw-all";
  allBtn.type = "button";
  allBtn.textContent = "Tout / Rien";
  allBtn.title = "Tout sélectionner ou tout désélectionner";
  allBtn.addEventListener("click", () => setAllKeywords(selectedKeywords.size < keywords.length));
  keywordsEl.appendChild(allBtn);
  for (const kw of keywords) {
    const btn = document.createElement("button");
    btn.className = "kw" + (selectedKeywords.has(kw) ? " active" : "");
    btn.dataset.kw = kw;
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

// Select or clear every category chip at once (used by "Tout / Rien").
function setAllKeywords(on) {
  selectedKeywords = on ? new Set(keywordUniverse) : new Set();
  keywordsEl.querySelectorAll(".kw").forEach(btn => {
    const active = selectedKeywords.has(btn.dataset.kw);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function setPlayer(p) {
  player = p;
  localStorage.setItem("player", p);
  btnHomme.classList.toggle("active", p === "homme");
  btnFemme.classList.toggle("active", p === "femme");
  btnHomme.setAttribute("aria-pressed", String(p === "homme"));
  btnFemme.setAttribute("aria-pressed", String(p === "femme"));
}

// Colour for an intensity 1-10: green (mild) -> gold -> red (extreme).
function intensityColor(i) {
  const hue = Math.round(145 * (10 - i) / 9); // 1 -> 145 (green), 10 -> 0 (red)
  return "hsl(" + hue + ", 62%, 52%)";
}

// Reflect the slider position: value bubble + GO button tinted to match.
function paintIntensity() {
  intensitySlider.value = String(intensityLevel);
  intensityValEl.textContent = String(intensityLevel);
  const c = intensityColor(intensityLevel);
  intensityValEl.style.color = c;
  btnGo.style.background = c;
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

function pick() {
  if (!activities || !activities.length) return;
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
  // "On alterne": switch player automatically for each new gage — but not
  // on a "Passer" re-roll, which stays on the current player.
  const p = (alternate && hasPicked && !rerolling)
    ? (player === "homme" ? "femme" : "homme")
    : player;
  let list = activities.filter(g =>
    (g.player === "both" || g.player === p) &&
    (!g.keywords.length || g.keywords.some(kw => selectedKeywords.has(kw))));
  if (!list.length) {
    errorEl.textContent = "Aucun gage ne correspond à cette sélection.";
    errorEl.style.display = "block";
    return;
  }
  // The slider is a MAX intensity: draw at that level, and when it has no
  // gage, fall back to the next level below — never above.
  let pool = [];
  for (let lvl = intensityLevel; lvl >= 1 && !pool.length; lvl--) {
    pool = list.filter(g => g.intensity === lvl);
  }
  if (!pool.length) {
    errorEl.textContent = "Aucun gage d'intensité " + intensityLevel + " ou moins dans cette sélection.";
    errorEl.style.display = "block";
    return;
  }
  list = pool;
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

  stopSpeaking(); // a new gage is showing — cancel any ongoing read
  badge.textContent = "intensité " + gage.intensity;
  // Address the gage to the player it is for ("Vincent — Tu dois…").
  itemEl.textContent = (PLAYER_NAMES[p] ? PLAYER_NAMES[p] + " — " : "") + gage.text;
  countdownEl.classList.remove("done");
  // Draw in a stopped "ready" state — the timer starts on the user's tap.
  clearInterval(timerId);
  timerId = null;
  paused = false;
  ringWrap.className = "ring-wrap ready";
  // The ring takes the drawn gage's intensity colour (green -> red).
  ringWrap.style.setProperty("--ring-color", intensityColor(gage.intensity));
  btnPause.textContent = "▶";
  btnPause.disabled = false;
  btnFinish.disabled = false;
  renderCountdown();
  updateRing();
  statusEl.textContent = "Appuie sur le minuteur pour démarrer" +
    (gage.intensity !== intensityLevel ? " (intensité " + gage.intensity + ")" : "") +
    (newRound ? " (nouvelle tournée)" : "");
  resultEl.classList.add("visible");
}

function addMinute() {
  if (!resultEl.classList.contains("visible")) return;
  const wasDone = ringWrap.classList.contains("done");
  remaining += 60;
  totalSeconds += 60;
  countdownEl.classList.remove("done");
  ringWrap.classList.remove("done");
  if (timerId) {
    endAt += 60000; // extend the running deadline
  } else if (wasDone) {
    // The gage had ended — revive and start it.
    statusEl.textContent = "Encore une minute — c'est parti !";
    startTimer();
    return;
  }
  // Idle or paused: just add the minute, stay stopped.
  renderCountdown();
  updateRing();
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
  btnSound.textContent = muted ? "🔇" : "🔊";
});

// Fullscreen gage display ----------------------------------------------

function openZoom() {
  if (!itemEl.textContent) return;
  zoomEl.textContent = itemEl.textContent;
  zoomEl.classList.add("visible");
  zoomEl.focus();
}

function closeZoom() {
  if (!zoomEl.classList.contains("visible")) return;
  zoomEl.classList.remove("visible");
  itemEl.focus(); // return focus to the trigger
}

// Read the gage aloud. Prefers a natural neural voice via the /api/tts
// proxy (Azure), and falls back to the browser's built-in speech synthesis
// when the API is unavailable (offline, or not yet configured). Pressing
// again stops. No API key ever reaches the client.
const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
// Tiny silent clip: playing it during the click gesture unlocks the audio
// element on iOS so the (async-fetched) neural MP3 can play afterwards.
const SILENT_WAV = "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
let ttsAudio = null;   // persistent, unlocked audio element for neural playback
let ttsReqId = 0;      // cancels an in-flight request when the user hits stop

function setSpeakState(speaking) {
  btnSpeak.textContent = speaking ? "⏹ Stop" : "🔈 Lire le gage";
  btnSpeak.classList.toggle("speaking", speaking);
}

function ensureTtsAudio() {
  if (ttsAudio) return;
  ttsAudio = new Audio(SILENT_WAV);
  ttsAudio.preload = "auto";
  ttsAudio.play().then(() => { ttsAudio.pause(); ttsAudio.currentTime = 0; }).catch(() => {});
}

function isSpeaking() {
  return (ttsAudio && !ttsAudio.paused && !ttsAudio.ended && ttsAudio.currentSrc.indexOf("wav") === -1)
    || (canSpeak && speechSynthesis.speaking);
}

function stopSpeaking() {
  ttsReqId++; // invalidate any in-flight neural request
  if (ttsAudio) ttsAudio.pause();
  if (canSpeak) speechSynthesis.cancel();
  setSpeakState(false);
}

// Pick the most natural-sounding French voice available (browser fallback):
// enhanced / neural and Google/Apple named voices beat the default "compact"
// voice that sounds robotic.
function pickFrenchVoice() {
  let fr = speechSynthesis.getVoices().filter(v => (v.lang || "").toLowerCase().startsWith("fr"));
  if (!fr.length) return null;
  // Offline, network voices (Google / MS online) won't play — keep local ones.
  if (!navigator.onLine) {
    const local = fr.filter(v => v.localService);
    if (local.length) fr = local;
  }
  const rank = (v) => {
    const n = (v.name + " " + (v.voiceURI || "")).toLowerCase();
    let s = 0;
    if (/natural|neural|enhanced|premium|siri/.test(n)) s += 100; // high-quality
    if (/google/.test(n)) s += 60;                                // Google FR is smooth
    if (/amélie|amelie|aurélie|aurelie|thomas|marie|virginie|audrey/.test(n)) s += 25;
    if (v.localService === false) s += 8;                         // network voices tend to be richer
    if ((v.lang || "").toLowerCase() === "fr-fr") s += 4;
    return s;
  };
  return fr.slice().sort((a, b) => rank(b) - rank(a))[0];
}

function speakBrowser(text) {
  if (!canSpeak) { setSpeakState(false); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  const voice = pickFrenchVoice();
  if (voice) u.voice = voice;
  u.rate = 0.98;  // a touch slower reads more naturally
  u.pitch = 1;
  u.onend = () => setSpeakState(false);
  u.onerror = () => setSpeakState(false);
  setSpeakState(true);
  speechSynthesis.speak(u);
}

async function speakGage() {
  if (!itemEl.textContent) return;
  if (isSpeaking()) { stopSpeaking(); return; }
  const text = itemEl.textContent;
  ensureTtsAudio();          // unlock audio within the click gesture (iOS)
  const reqId = ++ttsReqId;
  setSpeakState(true);
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const ct = res.headers.get("content-type") || "";
    if (!res.ok || ct.indexOf("audio") === -1) throw new Error("tts unavailable");
    const url = URL.createObjectURL(await res.blob());
    if (reqId !== ttsReqId) { URL.revokeObjectURL(url); return; } // stopped meanwhile
    ttsAudio.onended = () => setSpeakState(false);
    ttsAudio.onerror = () => setSpeakState(false);
    ttsAudio.src = url;
    ttsAudio.currentTime = 0;
    await ttsAudio.play();
  } catch (e) {
    if (reqId !== ttsReqId) return;
    speakBrowser(text); // offline / API not configured -> browser voice
  }
}

// "Passer": draw a different gage at the same level without tripping the
// two-click replace guard, and WITHOUT switching player — it's a re-roll
// of the current turn, not a new one.
let rerolling = false;
function reroll() {
  if (!resultEl.classList.contains("visible")) return;
  replaceArmed = true;
  rerolling = true;
  pick();
  rerolling = false;
}

function resetScore() {
  score = { homme: 0, femme: 0 };
  sessionStorage.setItem("score", JSON.stringify(score));
  updateScoreDisplay();
}

btnGo.addEventListener("click", pick);
intensitySlider.addEventListener("input", () => {
  intensityLevel = parseInt(intensitySlider.value, 10);
  localStorage.setItem("intensityLevel", String(intensityLevel));
  paintIntensity();
});
btnPlus.addEventListener("click", addMinute);
btnPause.addEventListener("click", togglePause);
ringWrap.addEventListener("click", togglePause); // tap the ring to start / pause / resume
btnFinish.addEventListener("click", finishGage);
btnSkip.addEventListener("click", reroll);
btnSpeak.addEventListener("click", speakGage);
btnHomme.addEventListener("click", () => setPlayer("homme"));
btnFemme.addEventListener("click", () => setPlayer("femme"));
itemEl.addEventListener("click", openZoom);
itemEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openZoom(); }
});
zoomEl.addEventListener("click", closeZoom);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeZoom();
});
btnResetScore.addEventListener("click", resetScore);

setPlayer(player);
paintAlternate(alternate);
paintHidden(hiddenTime);
paintIntensity();
paintSound(!muted);
btnSound.textContent = muted ? "🔇" : "🔊";
// The read-aloud button stays available: neural TTS works via /api/tts even
// where the browser has no speechSynthesis. Warm the browser voice list
// (loads asynchronously) so the fallback voice is ready on first press.
if (canSpeak) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener("voiceschanged", () => speechSynthesis.getVoices());
}
updateScoreDisplay();
loadData();

// PWA: offline support for the app shell (the sheet data is already
// cached in localStorage by loadData).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
