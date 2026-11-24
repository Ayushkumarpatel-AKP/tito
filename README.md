# Tito

A small desktop buddy. Press **Ctrl + Shift + Space**, draw around (or drag a box over) anything on your screen, and Tito explains it in a little clay card. It starts with Windows and lives in the tray.

## Run
```
npm install
npm start            # runs in the tray and registers itself to start with Windows
npm run selftest     # drives every window and saves screenshots (see Testing)
npm run dist         # builds a Windows installer into dist/
```

## AI providers (bring any key)
Open **Settings > AI provider**, paste a key. Tito recognises the provider from the key, asks the provider which models exist today, **tests each candidate with a tiny image**, and uses the best one automatically.

| Provider | Free? | Key |
|---|---|---|
| Google Gemini | yes | https://aistudio.google.com/apikey |
| Groq | yes | https://console.groq.com/keys |
| OpenRouter | free models | https://openrouter.ai/keys |
| OpenAI (ChatGPT) | paid | https://platform.openai.com/api-keys |
| xAI (Grok) | paid | https://console.x.ai |
| Other (OpenAI-compatible) | any | your own base URL + model |

- Models are rechecked every 24 hours. If a model is retired or a better free one appears, Tito switches by itself (`src/models.js`).
- With several keys saved, Tito falls back to another provider when one is busy, out of free quota or rejects the key.
- Keys are encrypted with Windows DPAPI and never reach the UI.

## Translation
Select text and press **Translate**. English text goes into your language (Settings > Translation, Hindi by default), anything else goes into English. Engines (Settings > Translation > Translate with):

- **AI model** (default, most accurate), then **MyMemory** (free online API, all major Indian languages, no key) and the **offline Hindi pack** as automatic fallbacks.
- MyMemory allows 500 characters per request, so Tito splits long text. Its quality varies, which is why the AI goes first.

## Offline (no internet)
- **Always available:** Windows' built-in OCR reads the selected text. Nothing to install.
- **Optional packs** (Settings > Offline packs). They are downloaded once into `%APPDATA%\tito\packs`, so the installer stays small:
  - **Offline AI**: Qwen3 0.6B (4-bit, 397 MB) run by `node-llama-cpp` on the CPU. Explains, summarizes and fixes selected text. About 2 to 7 seconds per answer.
  - **Hindi translation**: OPUS-MT English to Hindi and Hindi to English (int8, about 220 MB) run by `transformers.js`.
- With no internet Tito uses these automatically (Auto mode).

## Using it
- **Draw**: loop around anything. **Box**: drag a rectangle, then resize with the handles. **Whole screen**: ask about everything.
- **Explain / Translate / Summarize / Solve / Fix**, a style switch (Simple, Student, Expert, Fun) and follow-up questions.
- **Grab text** copies text from the selection (offline), **Listen** reads the answer aloud, **Share** makes a picture, **PDF** saves the answer with the picture you selected as a clean A4 page.
- **Notebook** keeps everything you asked (search, Markdown or PDF export). **Memory** (Settings) lets Tito remember your recent topics, only on this PC, and you can wipe it any time.

## Testing
The self-test never captures the real desktop: set `TITO_TEST_IMAGE` to a picture (see `tools/make-test-backdrop.py`), `TITO_SHOTS` to an output folder and your keys in the environment, then `npm run selftest`.
Other checks: `node tools/try-models.js`, `node tools/test-translate.js`, `node tools/test-llm.js`, `node tools/test-offline-tr.js`, `electron tools/test-pdf.js out.pdf`. `node tools/get-pack.js llm|hi` downloads a pack from the command line.

## Layout
- `main.js`, `preload.js`, `src/`: tray, hotkey, screen capture, providers (`providers.js`), model discovery (`models.js`), requests (`ai.js`), routing and fallbacks (`engine.js`), translation (`translate.js`, `offline-tr.js`), built-in AI (`llm.js`), packs (`packs.js`), OCR, PDF (`pdf.js`), memory, storage
- `renderer/`: overlay (selection + answer card), settings / notebook, greeting toast, sprite engine, clay CSS, colourful icons (Phosphor duotone, MIT)
- `assets/tito/`: sprite strips + `manifest.json` built by `tools/build_sprites.py` from the animation pack
