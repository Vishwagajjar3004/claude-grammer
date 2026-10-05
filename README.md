# Grammar Assistant (Web)

A Grammarly-inspired grammar and spelling checker built with React + TypeScript.
It runs a real-time, rule-based grammar engine plus a genuine offline Hunspell
dictionary directly in the browser, and can optionally use the Gemini API for
a more advanced "Dynamic AI Mode".

---

## Features

| Feature | Status |
|---|---|
| Live grammar checking as you type (debounced) | ✅ |
| Subject-verb agreement (`"they goes"` → `"they go"`) | ✅ |
| Modal verb agreement (`"would has"` → `"would have"`, `"would of"` → `"would have"`) | ✅ |
| `don't` / `doesn't` agreement | ✅ |
| Article correction (`"a apple"` → `"an apple"`) | ✅ |
| Capitalization (sentence start, pronoun "I") | ✅ |
| Duplicate space / basic punctuation cleanup | ✅ |
| Offline spelling check via a real Hunspell dictionary | ✅ |
| Multiple spelling suggestions (top 5, not just one) | ✅ |
| Custom dictionary & ignored words | ✅ |
| Local rule enable/disable, writing statistics | ✅ |
| Optional "Dynamic AI Mode" via Gemini API | ✅ (requires API key, online) |

## How spelling checking works

Spelling is checked in two layers:

1. **Curated fast-path table** — a short list of common casual/phonetic typos
   (`"wat"` → `"what"`, `"teh"` → `"the"`, `"adress"` → `"address"`) where a
   generic nearest-match search would otherwise pick a technically-closer but
   wrong word.
2. **Full dictionary fallback** — [`nspell`](https://github.com/wooorm/nspell)
   running the real, open-source Hunspell English dictionary
   ([`dictionary-en`](https://github.com/wooorm/dictionary-en)). This is the
   same class of dictionary used by Firefox/LibreOffice's built-in spell
   checkers, covering the full range of English words and their inflected
   forms (`running`, `boxes`, `finished`, etc.) — not a short hardcoded list.

The dictionary's raw `.aff`/`.dic` files are bundled as static assets in
`public/dictionaries/` and fetched once at runtime (`fetch('/dictionaries/en.aff')`).
This keeps everything client-side and offline after the page loads — no text is
ever sent anywhere for spelling checks, and no network request happens beyond
loading the app itself and its own dictionary files.

> **Note on "Dynamic AI Mode":** this project also includes an optional mode
> (`server.ts`) that calls the Google Gemini API for more advanced grammar
> feedback. That mode requires a `GEMINI_API_KEY` and an internet connection,
> unlike the offline rule/dictionary engine described above. If you want a
> fully offline experience, keep Engine Mode set to "Offline" in Settings.

## Requirements

- Node.js 18+

## Setup

```bash
npm install
```

If you want to use **Dynamic AI Mode** (optional), copy `.env.example` to
`.env.local` and set your own Gemini API key:

```bash
cp .env.example .env.local
# then edit .env.local and set GEMINI_API_KEY
```

This step is **not required** to use the offline grammar/spelling engine.

## Running

```bash
npm run dev
```

This starts the dev server (`tsx server.ts`), which serves the app and the
`/api/check` endpoint used by Dynamic AI Mode. Open the printed local URL in
your browser.

## Building for production

```bash
npm run build   # builds the client (Vite) and bundles server.ts
npm run start   # runs the built server
```

## Project structure

```
src/
  grammarEngine.ts        # Rule engine + offline spelling (nspell/Hunspell)
  types.ts                # Shared TypeScript types (Suggestion, AppSettings, ...)
  components/
    WritingCanvas.tsx      # Main editor + suggestions panel
    Sidebar.tsx            # Navigation
    RulesManager.tsx       # Enable/disable individual grammar rules
    DictionaryManager.tsx  # Custom dictionary + ignored words
    SettingsPanel.tsx      # Theme, hotkeys, engine mode, popup settings
    StatsDashboard.tsx      # Writing statistics
    DatabaseConsole.tsx     # Local logs/state viewer
public/
  dictionaries/
    en.aff, en.dic          # Raw Hunspell dictionary data, fetched at runtime
server.ts                  # Dev/prod server + Gemini API proxy for Dynamic AI Mode
```

## Known limitations

- **Grammar coverage is intentionally scoped.** The rule engine covers a
  specific, well-tested set of patterns (subject-verb agreement, modal verbs,
  articles, capitalization, punctuation, spacing) rather than full NLP-based
  grammar checking.
- **Spelling suggestions are edit-distance based**, not context-aware. A
  handful of very short casual typos (`"wat"`, `"gud"`, `"lik"`) needed to be
  added to the curated fast-path table rather than relying on the dictionary
  alone, since generic edit-distance can pick a technically-closer-but-wrong
  word for very short inputs.
- **Dynamic AI Mode requires the internet and a Gemini API key.** It is a
  separate, optional code path from the offline engine — if fully offline
  operation matters for your use case, keep Engine Mode set to "Offline".

## Roadmap / not yet implemented

- Additional grammar rules: passive voice, sentence fragment detection,
  comma rules, tense checking
- BK-tree or similar structure for faster suggestion lookup on very long
  documents (not currently a bottleneck with `nspell`)
- Desktop packaging / offline installer
