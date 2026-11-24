// Tito's local memory: the topics you asked about recently, so answers and follow-ups can stay relevant.
// Everything is kept on this PC (inside settings.json) and can be switched off or wiped in Settings.
const MAX = 24;

function remember(store, title, kind) {
  const s = store.get();
  if (!s.memory.enabled || !title) return;
  const list = s.memory.topics.filter((t) => t.t.toLowerCase() !== title.toLowerCase());
  list.unshift({ t: String(title).slice(0, 60), k: kind || 'other', ts: Date.now() });
  store.save({ memory: { topics: list.slice(0, MAX) } });
}

/** A short note for the system prompt, or '' when memory is off or empty. */
function promptNote(store) {
  const m = store.get().memory;
  if (!m.enabled || !m.topics.length) return '';
  const recent = m.topics.slice(0, 8).map((t) => t.t).join('; ');
  return `What you remember about this user (stored only on their PC): recently they asked about: ${recent}. Mention this only when it genuinely helps.`;
}

const forget = (store) => store.save({ memory: { topics: [] } });
const count = (store) => store.get().memory.topics.length;

module.exports = { remember, promptNote, forget, count };
