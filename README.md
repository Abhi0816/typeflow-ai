# TypeFlow — AI-Powered Interactive Typing Speed Tester

A browser-based typing speed tester built for the TE (Third Year) practical round. It measures WPM and accuracy in real time, and calls an AI model after each session to explain *why* you're making mistakes and generate a follow-up passage targeted at your weak keys.

## Features

- **Core mechanics** — a passage is shown on load; the timer starts on the very first keystroke, not on page load or focus.
- **Live feedback** — every character is colored green (correct) or red (incorrect) as you type, with the current character marked by a blinking cursor.
- **Performance metrics** — on completion: WPM, accuracy %, time taken, and total error count.
- **AI integration** — session data (WPM, accuracy, and a map of exactly which characters were mistyped most) is sent to a serverless API route, which asks an LLM to (a) explain the user's specific error pattern in plain language and (b) generate a new practice passage that deliberately reuses the user's weak characters.
- **Offline-safe fallback** — if the AI call fails (e.g. no API key configured yet), the app still shows a locally computed tip based on the error map, so the demo never looks broken.

## Tech stack

- Plain HTML / CSS / JavaScript on the frontend — no build step, no framework.
- One Vercel Serverless Function (`/api/analyze.js`) on the backend, using OpenAI's Chat Completions API (`gpt-4o-mini`). Swapping in Gemini instead takes about 5 lines — see the comment block at the bottom of `api/analyze.js`.

## Project structure

```
typeflow-ai/
├── index.html          # page structure
├── style.css            # visual design
├── script.js            # state management, event listeners, metrics, AI call
├── api/
│   └── analyze.js       # serverless function that talks to the AI API
├── package.json
├── .env.example
└── .gitignore
```

## How it works (user workflow)

1. **Load** — a random passage appears, along with a hint to click it and start typing.
2. **Focus** — clicking the passage focuses an invisible input that captures keystrokes.
3. **First keystroke** — the timer starts here, exactly as the MVP spec requires (not on click, not on load).
4. **Typing** — on every keystroke, each character in the passage is re-colored: green if it matches what you typed at that position, red if it doesn't. WPM and accuracy update live in the stats bar.
5. **Completion** — once the typed text reaches the length of the passage, the timer stops and final WPM / accuracy / time / errors are shown.
6. **AI analysis** — the session's error map (which specific characters were missed, and how often) is sent to `/api/analyze`. The AI coach panel then shows a short, specific tip and a new passage built around your weak spots, with a one-click button to practice it next.
7. **Restart** — "new passage" picks another passage at random and resets all state.

## Local setup

```bash
git clone <your-repo-url>
cd typeflow-ai
cp .env.example .env        # then paste your real OpenAI API key into .env
npm install -g vercel       # if you don't already have the Vercel CLI
vercel dev                  # serves index.html AND /api/analyze together
```

Open the printed local URL (typically `http://localhost:3000`).

> If you just open `index.html` directly in a browser (no server), the typing test itself works fine, but the `/api/analyze` call will fail and you'll see the offline fallback tip instead of the AI response — that's expected, since there's no server running `api/analyze.js` in that mode.

## Deploying (Vercel — recommended, zero config)

1. Push this folder to a new **public** GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import that repository.
3. Vercel auto-detects the static `index.html`/`style.css`/`script.js` and the `/api` folder — no build command is needed.
4. Before the first deploy (or right after, then redeploy), go to **Settings → Environment Variables** and add:
   - `OPENAI_API_KEY` = your OpenAI key
5. Click **Deploy**. Your live URL will look like `https://typeflow-ai-yourname.vercel.app`.

### Alternative hosts

- **Netlify**: move `api/analyze.js` into `netlify/functions/analyze.js`, change `module.exports = async (req, res) => {...}` to Netlify's `exports.handler = async (event) => {...}` signature, and point the frontend fetch at `/.netlify/functions/analyze`. Set `OPENAI_API_KEY` in Site settings → Environment variables.
- **Render**: wrap `api/analyze.js`'s logic in a small Express server (`app.post('/api/analyze', ...)`) and serve the static files with `express.static`. Set `OPENAI_API_KEY` in the Render dashboard's Environment tab.

## Getting an API key

- OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (paid, but `gpt-4o-mini` is very cheap per call).
- Free alternative — Google Gemini: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) has a free tier. See the comment block at the bottom of `api/analyze.js` for the exact fetch call to swap in.

## Notes on implementation choices

- **State management**: a single `state` object is fully recreated on every new passage (`createInitialState()`), rather than mutated piecemeal from multiple places, so there's one source of truth for the timer, keystroke counts, and error map.
- **Event listeners**: `keydown` is used only to detect the very first real keystroke (to start the timer); `input` handles all live-diffing and re-rendering; `paste` is blocked so results reflect actual typing.
- **Error map, not just an error count**: every mismatch is recorded against the *expected* character, not just tallied as a number. That per-character breakdown is what lets the AI coach say something specific ("you struggle with 't' and 'h'") instead of generic advice.
