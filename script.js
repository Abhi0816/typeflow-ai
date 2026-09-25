// ============================================================
// TypeFlow — AI Typing Speed Tester
// Core mechanics, live feedback, metrics, and AI integration.
// ============================================================

const PARAGRAPHS = [
  "The quick brown fox jumps over the lazy dog while the sun sets behind the distant hills, painting the sky in brilliant shades of orange and purple that seem to stretch endlessly across the horizon.",
  "Programming is as much about clear thinking as it is about writing code, and the best developers spend more time understanding a problem before they ever open an editor to start typing.",
  "A gentle breeze drifted through the open window, carrying the scent of fresh rain and blooming jasmine, while somewhere in the distance a dog barked twice and then fell silent again.",
  "Learning to type quickly and accurately takes patience and consistent practice, but the reward is a skill that will save you countless hours over your academic and professional life.",
  "The old library smelled of dust and aged paper, its tall wooden shelves packed tightly with stories waiting patiently for someone curious enough to pull them down and start reading.",
  "Success rarely arrives overnight; it is usually the quiet result of many small decisions made consistently over time, each one seemingly small on its own but powerful when added together.",
];

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

// ---------------- State ----------------
// One mutable state object, fully rebuilt on every new passage.
// This is the single source of truth the event listeners read/write.
let state = createInitialState();

function createInitialState() {
  return {
    paragraph: "",
    charSpans: [],
    startTime: null,
    timerId: null,
    finished: false,
    lastTypedLength: 0,
    totalKeystrokes: 0, // forward keystrokes only (backspace excluded)
    mistakes: 0, // forward keystrokes that were wrong at the time typed
    errorMap: {}, // expectedChar -> times it was mistyped
  };
}

// ---------------- Setup ----------------
function init() {
  loadParagraph(pickParagraph());
  attachEventListeners();
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
}

function attachEventListeners() {
  paragraphDisplay.addEventListener("click", () => hiddenInput.focus());
  hiddenInput.addEventListener("keydown", handleKeyDown);
  hiddenInput.addEventListener("input", handleInput);
  hiddenInput.addEventListener("paste", (e) => e.preventDefault());
  restartBtn.addEventListener("click", () => loadParagraph(pickParagraph(state.paragraph)));
}

// ---------------- Core mechanics ----------------
function handleKeyDown(e) {
  if (state.finished) return;
  // Start the timer on the very first real keystroke, not on focus.
  if (state.startTime === null && e.key.length === 1) {
    startTimer();
  }
}

function startTimer() {
  state.startTime = Date.now();
  hintText.textContent = "Timer running — finish the passage below.";
  state.timerId = setInterval(() => {
    const elapsed = (Date.now() - state.startTime) / 1000;
    timeStat.textContent = elapsed.toFixed(1) + "s";
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

  // Record the newest keystroke only (ignore backspace-driven shrinkage)
  // so the error map reflects genuine mistakes, not corrections.
  if (typed.length > state.lastTypedLength) {
    const i = typed.length - 1;
    state.totalKeystrokes++;
    const expected = state.paragraph[i];
    if (typed[i] !== expected) {
      state.mistakes++;
      state.errorMap[expected] = (state.errorMap[expected] || 0) + 1;
    }
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

  const elapsedMinutes = Math.max((Date.now() - state.startTime) / 60000, 1 / 6000); // guard div-by-0
  const wpm = Math.round(typedLength / 5 / elapsedMinutes);
  const accuracy = Math.round((correctCount / typedLength) * 100);

  finalWpm.textContent = wpm;
  finalAccuracy.textContent = accuracy + "%";
  finalTime.textContent = (elapsedMinutes * 60).toFixed(1) + "s";
  finalErrors.textContent = state.mistakes;

  resultsPanel.classList.remove("hidden");
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  requestAIFeedback({
    wpm,
    accuracy,
    errors: state.mistakes,
    errorMap: state.errorMap,
    paragraph: state.paragraph,
  });
}

// ---------------- AI integration ----------------
async function requestAIFeedback(sessionData) {
  aiFeedback.innerHTML = '<div class="ai-loading">Analyzing your session…</div>';
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
}

// Used if the AI endpoint isn't reachable (e.g. no API key set yet) so the
// app still demonstrates useful, data-driven feedback offline.
function renderFallbackFeedback(sessionData) {
  const sorted = Object.entries(sessionData.errorMap).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    aiFeedback.innerHTML = `<p class="ai-tip">AI service unavailable right now — but no repeated mistakes were detected this round. Nice and clean!</p>`;
    return;
  }
  const worstKeys = sorted
    .slice(0, 3)
    .map(([ch]) => (ch === " " ? "spacebar" : `"${ch}"`))
    .join(", ");
  aiFeedback.innerHTML = `<p class="ai-tip">AI service unavailable right now, so here's a local tip: your most-missed key${
    sorted.length > 1 ? "s were" : " was"
  } ${worstKeys}. Slow down slightly around ${worstKeys} on your next run.</p>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
