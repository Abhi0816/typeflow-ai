# TypeFlow - AI-Powered Interactive Typing Speed Tester

A browser based typing speed tester I built for the TE Third Year practical round. It tracks WPM and accuracy while you type, then sends the session data to an AI model that explains what you're getting wrong and writes a new paragraph to practice on, built around your weak spots.

## Features

- Core mechanics: a passage loads on screen, and the timer only starts once you press your first key. Not on page load, not on click.
- Live feedback: each letter turns green if you typed it right and red if you didn't, updated as you type. The character you're currently on has a small blinking cursor next to it.
- Performance metrics: once you finish the passage it shows your WPM, accuracy percentage, total time, and number of errors.
- AI integration: after each session the WPM, accuracy, and a breakdown of exactly which characters got mistyped (and how many times) get sent to a serverless function. That function asks an LLM to explain the error pattern in plain language and write a new practice paragraph that leans on the same characters you struggled with.
- Fallback if the AI call fails: if the API request doesn't go through for some reason, the app still shows a basic tip calculated locally from the error data, so it doesn't just look broken during a demo.

## Tech stack

Frontend is plain HTML, CSS and JavaScript. No framework, no build step. Backend is a single Vercel serverless function (api/analyze.js) that calls Google's Gemini API, since it has a free tier that doesn't need a card. Switching it over to OpenAI instead is only a few lines of code, there's a commented example at the bottom of that file.

## Project structure

```
typeflow-ai/
├── index.html          page structure
├── style.css            visual design
├── script.js            state management, event listeners, metrics, AI call
├── api/
│   └── analyze.js       serverless function that talks to the AI API
├── package.json
├── .env.example
└── .gitignore
```

## How it works

1. Load - a random passage shows up along with a hint telling you to click it and start typing.
2. Focus - clicking on the passage focuses a hidden input box that captures what you type.
3. First keystroke - this is when the timer actually starts, which was one of the main requirements for this round.
4. Typing - every keystroke re-checks each character against the passage and colors it green or red. WPM and accuracy update live at the top the whole time.
5. Completion - once you've typed the full length of the passage, the timer stops and it shows your final stats.
6. AI analysis - the error data gets sent to /api/analyze, and the AI coach panel shows up with a short tip plus a new paragraph aimed at your weak keys. There's a button to jump straight into practicing that one next.
7. Restart - clicking "new passage" grabs a different one at random and resets everything.

## Local setup

```bash
git clone <your-repo-url>
cd typeflow-ai
cp .env.example .env        # then paste your real Gemini API key into .env
npm install -g vercel       # if you don't already have the Vercel CLI
vercel dev                  # serves index.html AND /api/analyze together
```

Open the local URL it prints, usually http://localhost:3000.

If you just open index.html directly in a browser with no server running, the typing test itself still works fine, but the /api/analyze call will fail and you'll see the offline fallback tip instead of a real AI response. That's expected, there's no server to run api/analyze.js in that case.

## Deploying on Vercel

1. Push this folder to a new public GitHub repository.
2. Go to vercel.com, click Add New Project, and import that repository.
3. Vercel auto-detects the static index.html/style.css/script.js files and the /api folder on its own, no build command needed.
4. Before deploying (or right after, then redeploy), go to Settings, then Environment Variables, and add GEMINI_API_KEY with your Gemini key as the value.
5. Click Deploy. The live URL will look something like https://typeflow-ai-yourname.vercel.app.

### Other hosting options

Netlify: move api/analyze.js into netlify/functions/analyze.js, change the export signature from module.exports = async (req, res) => {...} to Netlify's exports.handler = async (event) => {...}, and point the frontend fetch at /.netlify/functions/analyze instead. Set GEMINI_API_KEY under Site settings, Environment variables.

Render: wrap the logic from api/analyze.js in a small Express server with app.post('/api/analyze', ...) and serve the static files with express.static. Set GEMINI_API_KEY in Render's Environment tab.

## Getting an API key

Google Gemini is what I used, it's free and doesn't need a card. Go to aistudio.google.com/app/apikey, sign in with any Google account, click Create API key, then Create key in new project, and copy the key. Takes about two minutes.

After creating the key, open it in Google Cloud Console under Credentials and set API restrictions to just the Generative Language API. Google requires this restriction now for Gemini keys to keep working, an unrestricted key can fail with an auth error.

OpenAI works too if you'd rather use that, but it needs a card on file. Get a key at platform.openai.com/api-keys. The bottom of api/analyze.js has the exact fetch call you'd swap in for that.

## A few implementation choices

State management: there's one state object that gets fully rebuilt every time a new passage loads, instead of being mutated from a bunch of different places. That way there's a single source of truth for the timer, keystroke counts, and the error map, and it's easy to reason about what changes when.

Event listeners: keydown is only used to catch the very first real keystroke so the timer can start. Everything about live diffing and re-rendering the passage happens on the input event instead. Paste is blocked entirely so results actually reflect typing, not pasting.

Error map instead of just an error count: every mismatch gets logged against the specific character that was expected, not just added to a running total. That's what lets the AI coach say something like "you struggle with t and h" instead of just "you made 12 mistakes."

## Extra features beyond the base MVP

Wanted to push past the minimum requirements a bit, so on top of the core mechanics, live feedback, metrics, and AI integration, I added:

- A per-key accuracy heatmap. Underneath the typing box there's a small on-screen keyboard, and every key gets shaded based on how often you actually miss it, building up across every passage in the session, not just the current one.
- A live WPM graph. A small line chart next to the stats updates every fraction of a second while you type, instead of only showing a number at the very end.
- Session history. Past runs get saved in the browser's local storage, and a small bar chart plus a trend line shows whether your WPM is improving over time on that device.
- Spoken AI feedback. The AI coach's tip is read aloud automatically using the browser's built-in speech synthesis, with a replay button in case you want to hear it again.

None of these needed a new dependency or backend change, they're all built with what the browser already provides (SVG, localStorage, and the Web Speech API) plus the existing error map data.

## Challenges I ran into

Picking an AI provider took longer than expected. I started with OpenAI, but it needs a paid card just to generate a key, so I switched to Gemini since its free tier only needs a Google account.

Ran into an issue where Vercel lets you scope environment variables separately for Production, Preview, and Development. My Gemini key had to be explicitly turned on for Production or the live site couldn't see it at all, and the AI call would fail quietly and fall back to the local tip without any obvious error on the frontend.

Also learned that redeploying doesn't automatically pick up every change you'd expect. Pushing a new commit or adding an environment variable doesn't affect a deployment that already happened, each one needs its own fresh deploy. I caught this when a redeploy was still running old code because a file edit hadn't actually been committed yet.

The first real AI call in production came back with a 503, "model currently experiencing high demand", straight from Gemini. Not a bug on my end, just Google's servers being busy. I fixed it by having the serverless function try a short list of Gemini models in order, gemini-flash-latest, then gemini-2.5-flash, then gemini-2.5-flash-lite, only falling through to the next one on a 503 or 429.

Getting the model to reliably return structured data was another small hurdle. I used generationConfig.responseMimeType set to application/json, plus a regex to strip out any stray markdown fences, so the AI's reply could always be parsed into feedback and nextParagraph without breaking the UI.

Last thing worth mentioning, I added the local fallback tip specifically so a dropped network call or an API hiccup during a live demo wouldn't make the whole app look broken.
