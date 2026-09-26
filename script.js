// ============================================================
// TypeFlow — AI Typing Speed Tester
// Core mechanics, live feedback, metrics, AI integration, and
// the four bonus features: key heatmap, live WPM graph, session
// history, and spoken AI feedback.
// ============================================================

const PARAGRAPHS = [
  "The quick brown fox jumps over the lazy dog while the sun sets behind the distant hills, painting the sky in brilliant shades of orange and purple that seem to stretch endlessly across the horizon.",
  "Programming is as much about clear thinking as it is about writing code, and the best developers spend more time understanding a problem before they ever open an editor to start typing.",
  "A gentle breeze drifted through the open window, carrying the scent of fresh rain and blooming jasmine, while somewhere in the distance a dog barked twice and then fell silent again.",
  "Learning to type quickly and accurately takes patience and consistent practice, but the reward is a skill that will save you countless hours over your academic and professional life.",
  "The old library smelled of dust and aged paper, its tall wooden shelves packed tightly with stories waiting patiently for someone curious enough to pull them down and start reading.",
  "Success rarely arrives overnight; it is usually the quiet result of many small decisions made consistently over time, each one seemingly small on its own but powerful when added together.",
];

const KEYBOARD_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "'"],
];

const HISTORY_KEY = "typeflow_history";

// ---------------- DOM references ----------------
const paragraphDisplay = document.getElementById("paragraphDisplay");
const hiddenInput = document.getElementById("hiddenInput");
const hintText = document.getElementById("hintText");
const timeStat = document.getElementById("timeStat");
const wpmStat = document.getElementById("wpmStat");
const accuracyStat = document.getElementById("accuracyStat");
const restartBtn = document.getElementById("restartBtn");
const resultsPanel = document.getElementById("resultsPanel");
const finalWpm = document.getElementById("finalWpm");
const finalAccuracy = document.getElementById("finalAccuracy");
const finalTime = document.getElementById("finalTime");
const finalErrors = document.getElementById("finalErrors");
const aiFeedback = document.getElementById("aiFeedback");
const wpmLineEl = document.getElementById("wpmLine");
const keyboardHeatmapEl = document.getElementById("keyboardHeatmap");
const historyContentEl = document.getElementById("historyContent");
const speakBtn = document.getElementById("speakBtn");

// ---------------- Session-level data (persists across passages) ----------------
// Key accuracy accumulates for the whole browser session, not just one passage,
// so the heatmap reflects an overall pattern rather than resetting every time.
const sessionKeyStats = {}; // char -> { attempts, misses }
const keyElements = {}; // char -> DOM element
let lastSpokenText = "";

// ---------------- Per-passage state ----------------
// Rebuilt from scratch on every new passage. Single source of truth for the
// timer, keystroke counts, error map, and the live WPM graph's samples.
let state = createInitialState();

function createInitialState() {
  return {
    paragraph: "",
    charSpans: [],
    startTime: null,
    timerId: null,
    finished: false,
    lastTypedLength: 0,
    totalKeystrokes: 0,
    mistakes: 0,
    errorMap: {},
    wpmSamples: [],
  };
}

// ---------------- Setup ----------------
function init() {
  buildKeyboard();
  loadParagraph(pickParagraph());
  attachEventListeners();
  renderHistory(loadHistory());
}

function pickParagraph(exclude) {
  const pool = exclude ? PARAGRAPHS.filter((p) => p !== exclude) : PARAGRAPHS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function loadParagraph(text) {
  if (state.timerId) clearInterval(state.timerId);
  state = createInitialState();
  state.paragraph = text;

  paragraphDisplay.innerHTML = "";
  state.charSpans = [...text].map((ch) => {
    const span = document.createElement("span");
    span.textContent = ch;
    paragraphDisplay.appendChild(span);
    return span;
  });
  if (state.charSpans[0]) state.charSpans[0].classList.add("current");

  hiddenInput.value = "";
  hintText.textContent = "Click the passage above, then start typing.";
  timeStat.textContent = "0.0s";
  wpmStat.textContent = "0";
  accuracyStat.textContent = "100%";
  resultsPanel.classList.add("hidden");
  speakBtn.classList.add("hidden");
  renderWpmGraph();
}

function attachEventListeners() {
  paragraphDisplay.addEventListener("click", () => hiddenInput.focus());
  hiddenInput.addEventListener("keydown", handleKeyDown);
  hiddenInput.addEventListener("input", handleInput);
  hiddenInput.addEventListener("paste", (e) => e.preventDefault());
  restartBtn.addEventListener("click", () => loadParagraph(pickParagraph(state.paragraph)));
  speakBtn.addEventListener("click", () => speakText(lastSpokenText));
}

// ---------------- Core mechanics ----------------
function handleKeyDown(e) {
  if (state.finished) return;
  if (state.startTime === null && e.key.length === 1) {
    startTimer();
  }
}

function startTimer() {
  state.startTime = Date.now();
  hintText.textContent = "Timer running — finish the passage below.";
  let tickCount = 0;
  state.timerId = setInterval(() => {
    const elapsed = (Date.now() - state.startTime) / 1000;
    timeStat.textContent = elapsed.toFixed(1) + "s";
    tickCount++;
    if (tickCount % 4 === 0) sampleWpmPoint(); // sample the graph roughly every 400ms
  }, 100);
}

// ---------------- Live feedback ----------------
function handleInput() {
  if (state.finished) return;

  let typed = hiddenInput.value;
  if (typed.length > state.paragraph.length) {
    typed = typed.slice(0, state.paragraph.length);
    hiddenInput.value = typed;
  }

  let correctCount = 0;
  for (let i = 0; i < state.charSpans.length; i++) {
    const span = state.charSpans[i];
    span.classList.remove("current");
    if (i < typed.length) {
      const isCorrect = typed[i] === state.paragraph[i];
      span.classList.toggle("correct", isCorrect);
      span.classList.toggle("incorrect", !isCorrect);
      if (isCorrect) correctCount++;
    } else {
      span.classList.remove("correct", "incorrect");
    }
  }
  if (typed.length < state.charSpans.length) {
    state.charSpans[typed.length].classList.add("current");
  }

  if (typed.length > state.lastTypedLength) {
    const i = typed.length - 1;
    state.totalKeystrokes++;
    const expected = state.paragraph[i];
    const isMatch = typed[i] === expected;
    if (!isMatch) {
      state.mistakes++;
      state.errorMap[expected] = (state.errorMap[expected] || 0) + 1;
    }
    updateKeyStat(expected, isMatch);
  }
  state.lastTypedLength = typed.length;

  updateLiveStats(correctCount, typed.length);

  if (typed.length === state.paragraph.length) {
    finishTest(correctCount, typed.length);
  }
}

function updateLiveStats(correctCount, typedLength) {
  accuracyStat.textContent = (typedLength === 0 ? 100 : Math.round((correctCount / typedLength) * 100)) + "%";
  if (state.startTime) {
    const minutes = (Date.now() - state.startTime) / 60000;
    wpmStat.textContent = minutes > 0 ? Math.round(typedLength / 5 / minutes) : "0";
  }
}

// ---------------- Performance metrics ----------------
function finishTest(correctCount, typedLength) {
  state.finished = true;
  clearInterval(state.timerId);
  hiddenInput.blur();

  const elapsedMinutes = Math.max((Date.now() - state.startTime) / 60000, 1 / 6000);
  const wpm = Math.round(typedLength / 5 / elapsedMinutes);
  const accuracy = Math.round((correctCount / typedLength) * 100);

  finalWpm.textContent = wpm;
  finalAccuracy.textContent = accuracy + "%";
  finalTime.textContent = (elapsedMinutes * 60).toFixed(1) + "s";
  finalErrors.textContent = state.mistakes;

  resultsPanel.classList.remove("hidden");
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const history = saveHistoryEntry({ wpm, accuracy, ts: Date.now() });
  renderHistory(history);

  requestAIFeedback({
    wpm,
    accuracy,
    errors: state.mistakes,
    errorMap: state.errorMap,
    paragraph: state.paragraph,
  });
}

// ---------------- Bonus feature: per-key accuracy heatmap ----------------
function buildKeyboard() {
  KEYBOARD_ROWS.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "keyboard-row";
    row.forEach((ch) => {
      const keyEl = document.createElement("span");
      keyEl.className = "key";
      keyEl.textContent = ch;
      keyElements[ch] = keyEl;
      rowEl.appendChild(keyEl);
    });
    keyboardHeatmapEl.appendChild(rowEl);
  });

  const spaceRow = document.createElement("div");
  spaceRow.className = "keyboard-row";
  const spaceKey = document.createElement("span");
  spaceKey.className = "key wide";
  spaceKey.textContent = "space";
  keyElements[" "] = spaceKey;
  spaceRow.appendChild(spaceKey);
  keyboardHeatmapEl.appendChild(spaceRow);
}

function updateKeyStat(expectedCharRaw, wasCorrect) {
  const key = expectedCharRaw === " " ? " " : expectedCharRaw.toLowerCase();
  const el = keyElements[key];
  if (!el) return; // character isn't on our simplified keyboard (e.g. punctuation we don't render)

  const stat = sessionKeyStats[key] || (sessionKeyStats[key] = { attempts: 0, misses: 0 });
  stat.attempts++;
  if (!wasCorrect) stat.misses++;

  const rate = stat.misses / stat.attempts;
  el.style.background = heatColor(rate);
}

function heatColor(rate) {
  const from = [28, 31, 40]; // matches --surface
  const to = [230, 88, 76]; // matches --error
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * rate));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// ---------------- Bonus feature: live WPM graph ----------------
function sampleWpmPoint() {
  if (!state.startTime || state.finished) return;
  const minutes = (Date.now() - state.startTime) / 60000;
  const typedLen = hiddenInput.value.length;
  const wpm = minutes > 0 ? Math.round(typedLen / 5 / minutes) : 0;
  state.wpmSamples.push(wpm);
  if (state.wpmSamples.length > 30) state.wpmSamples.shift();
  renderWpmGraph();
}

function renderWpmGraph() {
  const samples = state.wpmSamples;
  if (!samples.length) {
    wpmLineEl.setAttribute("points", "");
    return;
  }
  const maxV = Math.max(60, ...samples);
  const w = 300;
  const h = 80;
  const stepX = samples.length > 1 ? w / (samples.length - 1) : w;
  const points = samples
    .map((v, i) => `${(i * stepX).toFixed(1)},${(h - (v / maxV) * h).toFixed(1)}`)
    .join(" ");
  wpmLineEl.setAttribute("points", points);
}

// ---------------- Bonus feature: session history ----------------
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistoryEntry(entry) {
  const history = loadHistory();
  history.push(entry);
  while (history.length > 20) history.shift();
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable (private browsing, storage full, etc) - skip silently
  }
  return history;
}

function renderHistory(history) {
  historyContentEl.innerHTML = "";
  if (!history.length) {
    historyContentEl.innerHTML = '<p class="history-empty">No previous runs recorded on this device yet.</p>';
    return;
  }

  const maxWpm = Math.max(...history.map((h) => h.wpm), 1);
  const bars = document.createElement("div");
  bars.className = "history-bars";
  history.forEach((h) => {
    const bar = document.createElement("div");
    bar.className = "history-bar";
    bar.style.height = Math.max(6, Math.round((h.wpm / maxWpm) * 60)) + "px";
    bar.title = `${h.wpm} wpm, ${h.accuracy}% accuracy`;
    bars.appendChild(bar);
  });
  historyContentEl.appendChild(bars);

  if (history.length >= 2) {
    const diff = history[history.length - 1].wpm - history[0].wpm;
    const trend = document.createElement("p");
    trend.className = "history-trend";
    trend.textContent =
      diff >= 0
        ? `Up ${diff} wpm since your first recorded run on this device.`
        : `Down ${Math.abs(diff)} wpm since your first recorded run on this device.`;
    historyContentEl.appendChild(trend);
  }
}

// ---------------- Bonus feature: spoken AI feedback ----------------
function speakText(text) {
  if (!text || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utter);
}

// ---------------- AI integration ----------------
async function requestAIFeedback(sessionData) {
  aiFeedback.innerHTML = '<div class="ai-loading">Analyzing your session…</div>';
  speakBtn.classList.add("hidden");
  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionData),
    });
    if (!res.ok) throw new Error("AI service returned an error");
    const data = await res.json();
    renderAIFeedback(data);
  } catch (err) {
    renderFallbackFeedback(sessionData);
  }
}

function renderAIFeedback(data) {
  const nextBlock = data.nextParagraph
    ? `<div class="ai-next">
         <strong>Next passage (targets your weak spots):</strong>
         <p>${escapeHtml(data.nextParagraph)}</p>
         <button class="btn btn-small" id="useAiParagraphBtn">practice this next</button>
       </div>`
    : "";

  aiFeedback.innerHTML = `<p class="ai-tip">${escapeHtml(data.feedback)}</p>${nextBlock}`;

  const btn = document.getElementById("useAiParagraphBtn");
  if (btn) btn.addEventListener("click", () => loadParagraph(data.nextParagraph));

  lastSpokenText = data.feedback || "";
  speakBtn.classList.remove("hidden");
  speakText(lastSpokenText);
}

function renderFallbackFeedback(sessionData) {
  const sorted = Object.entries(sessionData.errorMap).sort((a, b) => b[1] - a[1]);
  let tip;
  if (!sorted.length) {
    tip = "AI service unavailable right now — but no repeated mistakes were detected this round. Nice and clean!";
  } else {
    const worstKeys = sorted
      .slice(0, 3)
      .map(([ch]) => (ch === " " ? "spacebar" : `"${ch}"`))
      .join(", ");
    tip = `AI service unavailable right now, so here's a local tip: your most-missed key${
      sorted.length > 1 ? "s were" : " was"
    } ${worstKeys}. Slow down slightly around ${worstKeys} on your next run.`;
  }
  aiFeedback.innerHTML = `<p class="ai-tip">${escapeHtml(tip)}</p>`;
  lastSpokenText = tip;
  speakBtn.classList.remove("hidden");
  speakText(tip);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
