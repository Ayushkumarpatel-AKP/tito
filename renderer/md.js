// A small, safe Markdown renderer for Tito's chat (elements are built with textContent, never innerHTML).
// Supports headings, lists, quotes, **bold**, *italic*, `code`, links, https images and fenced code blocks with a Copy button.
(function () {
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
  const RE = /(!\[[^\]]*\]\(https:\/\/[^)\s]+\)|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|https?:\/\/[^\s)<]+)/g;

  function inline(parent, text, hooks) {
    let last = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      const t = m[0];
      if (t.startsWith('![')) { const mm = t.match(/^!\[([^\]]*)\]\((https:[^)\s]+)\)$/); const im = el('img', 'mdimg'); im.src = mm[2]; im.alt = mm[1]; im.onclick = () => hooks.open && hooks.open(mm[2]); parent.append(im); }
      else if (t.startsWith('[')) { const mm = t.match(/^\[([^\]]+)\]\((https?:[^)\s]+)\)$/); const a = el('a', 'mdlink', mm[1]); a.onclick = () => hooks.open && hooks.open(mm[2]); parent.append(a); }
      else if (t.startsWith('`')) parent.append(el('code', 'mdcode', t.slice(1, -1)));
      else if (t.startsWith('**') || t.startsWith('__')) parent.append(el('strong', '', t.slice(2, -2)));
      else if (t.startsWith('*')) parent.append(el('em', '', t.slice(1, -1)));
      else { const u = t.replace(/[.,;]+$/, ''); const a = el('a', 'mdlink', u); a.onclick = () => hooks.open && hooks.open(u); parent.append(a); if (u.length < t.length) parent.append(t.slice(u.length)); }
      last = m.index + t.length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  function blocks(root, seg, hooks) {
    let list = null, ltype = '';
    for (const raw of seg.split('\n')) {
      const ln = raw.replace(/\s+$/, ''); if (!ln.trim()) { list = null; continue; }
      let m;
      if ((m = ln.match(/^(#{1,4})\s+(.*)$/))) { list = null; const h = el('div', 'mdh mdh' + m[1].length); inline(h, m[2], hooks); root.append(h); }
      else if ((m = ln.match(/^\s*[-*•]\s+(.*)$/))) { if (!list || ltype !== 'ul') { list = el('ul'); ltype = 'ul'; root.append(list); } const li = el('li'); inline(li, m[1], hooks); list.append(li); }
      else if ((m = ln.match(/^\s*(\d+)[.)]\s+(.*)$/))) { if (!list || ltype !== 'ol') { list = el('ol'); ltype = 'ol'; root.append(list); } const li = el('li'); inline(li, m[2], hooks); list.append(li); }
      else if ((m = ln.match(/^>\s?(.*)$/))) { list = null; const q = el('blockquote'); inline(q, m[1], hooks); root.append(q); }
      else if (/^(-{3,}|\*{3,})$/.test(ln.trim())) { list = null; root.append(el('hr')); }
      else { list = null; const p = el('p'); inline(p, ln, hooks); root.append(p); }
    }
  }

  /** hooks: { copy(text), open(url) }. Returns a <div class="md">. */
  function render(text, hooks = {}) {
    const root = el('div', 'md');
    String(text).split('```').forEach((seg, i) => {
      if (i % 2 === 0) return blocks(root, seg, hooks);
      const nl = seg.indexOf('\n'); let lang = '', code = seg;
      if (nl >= 0 && /^[\w+#.-]{0,20}$/.test(seg.slice(0, nl).trim())) { lang = seg.slice(0, nl).trim(); code = seg.slice(nl + 1); }
      code = code.replace(/\n$/, '');
      const box = el('div', 'codeblock'), head = el('div', 'cbhead'); head.append(el('span', '', lang || 'code'));
      const b = el('button', 'cbcopy', 'Copy'); b.onclick = async () => { if (hooks.copy) await hooks.copy(code); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); };
      head.append(b); const pre = el('pre'); pre.append(el('code', '', code)); box.append(head, pre); root.append(box);
    });
    return root;
  }
  window.TitoMd = { render };
})();
