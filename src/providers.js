// Registry of AI providers Tito can use. Anything OpenAI-compatible works, so a new service is one entry here
// (or the "Other" provider with a custom base URL in Settings).
//   kind 'openai'  -> POST {base}/chat/completions, list models at {base}/models
//   kind 'gemini'  -> Google's generateContent API
// `fallback` is only a last resort for when live model discovery is impossible (e.g. offline at first run);
// normally Tito asks the provider which models exist today and tests them with a tiny image.
const PROVIDERS = {
  gemini: {
    name: 'Google Gemini', kind: 'gemini', free: true, keyUrl: 'https://aistudio.google.com/apikey',
    detect: /^(AIza[\w-]{30,}|AQ\.[\w.-]{20,})$/, env: 'GEMINI_API_KEY',
    hint: 'Free key from Google AI Studio. On the free tier Google may use your prompts to improve its products, so avoid selecting private content.',
    fallback: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash'],
  },
  groq: {
    name: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', free: true, keyUrl: 'https://console.groq.com/keys',
    detect: /^gsk_[\w]{20,}$/, env: 'GROQ_API_KEY',
    hint: 'Free key from console.groq.com. Very fast. Free tier has a per-minute token limit.',
    fallback: ['qwen/qwen3.8-27b'],
  },
  openai: {
    name: 'OpenAI (ChatGPT)', kind: 'openai', base: 'https://api.openai.com/v1', free: false, keyUrl: 'https://platform.openai.com/api-keys',
    detect: /^sk-(?!or-|ant-)[\w-]{20,}$/, env: 'OPENAI_API_KEY',
    hint: 'Paid API from platform.openai.com. Tito picks a small, cheap image-capable GPT model automatically.',
    fallback: ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
  },
  openrouter: {
    name: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', free: true, keyUrl: 'https://openrouter.ai/keys',
    detect: /^sk-or-[\w-]{20,}$/, env: 'OPENROUTER_API_KEY',
    hint: 'One key for many models. Tito uses the newest free image-capable model it can find. Free models have small daily limits.',
    fallback: [],
  },
  xai: {
    name: 'xAI (Grok)', kind: 'openai', base: 'https://api.x.ai/v1', free: false, keyUrl: 'https://console.x.ai',
    detect: /^xai-[\w-]{20,}$/, env: 'XAI_API_KEY',
    hint: 'API from x.ai. Tito picks a current Grok model that accepts images.',
    fallback: [],
  },
  custom: {
    name: 'Other (OpenAI-compatible)', kind: 'openai', base: null, free: false, keyUrl: '', custom: true, env: 'TITO_CUSTOM_API_KEY',
    detect: null,
    hint: 'Any service with an OpenAI-compatible API (Together, Mistral, DeepSeek, Cerebras, NVIDIA, a self-hosted server...). Enter its base URL and a model name that accepts images.',
    fallback: [],
  },
};

/** Guess the provider from the shape of an API key. */
function detectKey(key) {
  const k = String(key || '').trim();
  for (const [id, p] of Object.entries(PROVIDERS)) if (p.detect && p.detect.test(k)) return id;
  return null;
}

/** What the settings window needs (regexes stay in the main process). */
function publicList() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, kind: p.kind, free: p.free, keyUrl: p.keyUrl, hint: p.hint, custom: !!p.custom }));
}

module.exports = { PROVIDERS, detectKey, publicList };
