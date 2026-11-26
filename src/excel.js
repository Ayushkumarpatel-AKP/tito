// Excel Maker: turns "make an expense sheet: date, item, amount, total" (or a copied table) into a real .xlsx with formulas.
// Pure rules, no AI and no key. parse -> sheet spec -> Buffer.
const { buildXlsx, colName } = require('./xlsx');

const MONEY = /\b(amount|price|cost|total|salary|fee|fees|rate|expense|expenses|spent|spend|budget|balance|income|paid|payment|revenue|profit|rs|inr|rupees?|kharcha|paisa|value)\b/i;
const NUMBER = /\b(qty|quantity|count|marks?|score|number|no|age|days|hours|hrs|units|points|sets|reps|weight|percent|percentage|out of|stock|pages|rating)\b/i;
const DATE = /\b(date|dob|deadline|due|day of|joined|day)\b/i;
const kindOf = (name) => (DATE.test(name) && !/\b(days|day count)\b/i.test(name) ? 'date' : MONEY.test(name) ? 'money' : NUMBER.test(name) ? 'number' : 'text');

const PRESETS = [
  [/\b(expenses?|kharcha|kharch|spending|budget)\b/i, 'Expenses', ['Date', 'Item', 'Category', 'Amount', 'Running total']],
  [/\b(marks|grades?|result|gradebook|report card|scores?)\b/i, 'Marks', ['Name', 'Subject', 'Marks', 'Out of', 'Percentage']],
  [/\b(attendance|haziri)\b/i, 'Attendance', ['Name', 'Date', 'Status', 'Remarks']],
  [/\b(time ?table|schedule|routine)\b/i, 'Timetable', ['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']],
  [/\b(workout|gym|fitness)\b/i, 'Workout', ['Date', 'Exercise', 'Sets', 'Reps', 'Weight (kg)']],
  [/\b(habits?)\b/i, 'Habits', ['Habit', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
  [/\b(sales|bills?|invoice)\b/i, 'Sales', ['Date', 'Product', 'Quantity', 'Price', 'Total']],
  [/\b(inventory|stock)\b/i, 'Inventory', ['Item', 'Quantity', 'Price', 'Total']],
  [/\b(to-?do|tasks?|assignments?)\b/i, 'Tasks', ['Task', 'Priority', 'Due date', 'Status']],
  [/\b(contacts?|phone ?book|address book)\b/i, 'Contacts', ['Name', 'Phone', 'Email', 'Notes']],
  [/\b(study|exam|syllabus|revision)\b/i, 'Study plan', ['Subject', 'Chapter', 'Status', 'Date']],
];
const COLWORDS = /\b(columns?|fields?|headings?|headers?|jisme|jismein|jis mein)\b/gi;

const cap = (s) => s.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());
const tidyCol = (s) => cap(String(s).replace(COLWORDS, ' ').replace(/^(and|aur|with|a|an|the|ke|ka|ki)\s+/i, '').replace(/[^\w\s().%/&#-]/g, ' ')).slice(0, 30);
const unique = (a) => { const seen = new Set(); return a.filter((x) => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

/** Columns the user listed: after a colon, or after "with", "columns", "jisme". */
function listedColumns(text) {
  const m = text.match(/:\s*(.+)$/s) || text.match(/\b(?:with|having|columns?|fields?|jisme|jismein|jis mein)\s+(?:the\s+|these\s+)?(?:columns?\s+|fields?\s+)?(.+)$/is);
  if (!m) return null;
  const cols = unique(m[1].split(/\s*(?:,|;|\||\/|\bn\b|&|\band\b|\baur\b|\n)\s*/i).map(tidyCol).filter((c) => c && c.length <= 30));
  return cols.length >= 2 && cols.length <= 14 ? cols : null;
}

/** "make an expense sheet: date, item, amount, total" -> { title, columns, kind } or null when the request has no columns and no known kind. */
function planSheet(text) {
  const t = String(text || '');
  let columns = listedColumns(t), title = '';
  const head = t.split(':')[0];
  for (const [re, name, cols] of PRESETS) if (re.test(head)) { title = name; if (!columns) columns = cols; break; }
  if (!columns) return null;
  if (!title) {
    const w = head.replace(/\b(please|make|create|build|generate|prepare|banao|bana|banado|do|me|a|an|the|my|new|excel|xlsx|spreadsheet|sheet|file|with|columns?|for|ke|liye|ka|ki|mere|ek|karo|kro|tito)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    title = w ? cap(w).slice(0, 30) : 'Sheet';
  }
  return { title, columns: columns.map((name) => ({ name, kind: kindOf(name) })), wantAverage: /\b(average|avg|mean)\b/i.test(t) };
}

// ---- building ------------------------------------------------------------------------------
const ROWS = 25;                                     // empty rows ready to type into
function sheetFromPlan(plan) {
  const cols = plan.columns, names = cols.map((c) => c.name.toLowerCase());
  const idx = (re, not) => names.findIndex((n, i) => re.test(n) && i !== not);
  const iQty = idx(/^(qty|quantity|units|count|sets)$/), iPrice = idx(/^(price|rate|cost|unit price)$/);
  const iTot = idx(/^(total|amount due|line total|running total|balance)$/);
  const iMarks = idx(/^marks?$/), iOut = idx(/^(out of|max marks?|total marks?)$/), iPct = idx(/^(percentage|percent|%)$/);
  const iMoney = cols.findIndex((c, i) => c.kind === 'money' && i !== iTot && i !== iPrice);
  const formula = new Array(cols.length).fill(null);
  if (iTot >= 0 && iQty >= 0 && iPrice >= 0) formula[iTot] = (r) => `IF(OR(${colName(iQty)}${r}="",${colName(iPrice)}${r}=""),"",${colName(iQty)}${r}*${colName(iPrice)}${r})`;
  else if (iTot >= 0 && iMoney >= 0) formula[iTot] = (r) => `IF(${colName(iMoney)}${r}="","",SUM(${colName(iMoney)}$2:${colName(iMoney)}${r}))`;
  if (iPct >= 0 && iMarks >= 0 && iOut >= 0) formula[iPct] = (r) => `IF(OR(${colName(iMarks)}${r}="",${colName(iOut)}${r}=""),"",${colName(iMarks)}${r}/${colName(iOut)}${r}*100)`;
  const styleOf = (c, i) => (formula[i] ? 'num' : c.kind === 'date' ? 'date' : c.kind === 'money' ? 'num' : c.kind === 'number' ? 'int' : 'text');
  const rows = [cols.map((c) => c.name)];
  for (let r = 2; r <= ROWS + 1; r++) rows.push(cols.map((_, i) => (formula[i] ? { f: formula[i](r), s: 'num' } : null)));
  const sumCols = cols.map((c, i) => (c.kind === 'money' || c.kind === 'number') && !(iTot >= 0 && formula[i] && iMoney >= 0 && i === iTot) && i !== iPct);
  const firstText = cols.findIndex((c) => c.kind === 'text' || c.kind === 'date');
  const last = ROWS + 1;
  if (sumCols.some(Boolean)) {
    const mk = (label, fn) => cols.map((c, i) => (i === (firstText >= 0 ? firstText : 0) && !sumCols[i] ? { v: label, s: 'total' } : sumCols[i] ? { f: `${fn}(${colName(i)}2:${colName(i)}${last})`, s: 'total' } : { v: '', s: 'total' }));
    rows.push(mk('Total', 'SUM'));
    if (plan.wantAverage) rows.push(mk('Average', 'AVERAGE'));
  }
  return { name: plan.title, rows, widths: cols.map((c) => Math.max(12, c.name.length + 6, c.kind === 'text' ? 22 : 14)), colStyles: cols.map(styleOf), filterRows: last };
}

// ---- tables you copy (from a website, Excel, a chat answer) ----------------------------------
function parseNumber(s) {
  const x = String(s).trim().replace(/^[₹$€£]\s*/, '').replace(/^rs\.?\s*/i, '').replace(/,(?=\d{3}\b)/g, '').replace(/%$/, '');
  return /^-?\d+(\.\d+)?$/.test(x) ? Number(x) : null;
}
function csvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch; }
  out.push(cur.trim()); return out;
}
/** Rows of cells from pasted text: markdown pipes, tabs, commas or runs of spaces. Null when it is not a table. */
function parseTable(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean); if (lines.length < 2) return null;
  let rows = null;
  if (lines.filter((l) => l.includes('|')).length >= Math.max(2, lines.length - 1)) {
    rows = lines.filter((l) => !/^\|?[\s:|-]+\|?$/.test(l) || !/-/.test(l)).filter((l) => !/^\|?\s*:?-{2,}/.test(l)).map((l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  } else if (lines.filter((l) => l.includes('\t')).length >= lines.length - 1) rows = lines.map((l) => l.split('\t').map((c) => c.trim()));
  else if (lines.every((l) => l.includes(',')) && new Set(lines.map((l) => csvLine(l).length)).size === 1) rows = lines.map(csvLine);
  else if (lines.every((l) => /\S\s{2,}\S/.test(l))) rows = lines.map((l) => l.split(/\s{2,}/).map((c) => c.trim()));
  if (!rows || rows.length < 2) return null;
  const n = Math.max(...rows.map((r) => r.length)); if (n < 2) return null;
  return rows.map((r) => Array.from({ length: n }, (_, i) => r[i] === undefined ? '' : r[i].replace(/\*\*/g, '')));
}
function sheetFromTable(rows, title = 'Table') {
  const n = rows[0].length, body = rows.slice(1);
  const numeric = Array.from({ length: n }, (_, c) => body.filter((r) => r[c] !== '').length > 0 && body.every((r) => r[c] === '' || parseNumber(r[c]) !== null));
  const out = [rows[0].map((h, i) => h || 'Column ' + (i + 1))];
  for (const r of body) out.push(r.map((c, i) => (numeric[i] ? (c === '' ? null : parseNumber(c)) : c === '' ? null : c)));
  const last = out.length;
  const total = numeric.some(Boolean) && body.length >= 2;
  if (total) { const firstText = numeric.findIndex((x) => !x); out.push(numeric.map((isNum, i) => (isNum ? { f: `SUM(${colName(i)}2:${colName(i)}${last})`, s: 'total', v: body.reduce((a, r) => a + (parseNumber(r[i]) || 0), 0) } : { v: i === Math.max(0, firstText) ? 'Total' : '', s: 'total' }))); }
  const widths = rows[0].map((h, i) => Math.min(60, Math.max(10, String(h).length + 4, ...body.map((r) => String(r[i]).length + 2))));
  return { name: title, rows: out, widths, colStyles: numeric.map((x) => (x ? 'num' : 'text')), filterRows: last };
}

const toXlsx = (sheetSpec) => buildXlsx([sheetSpec]);
module.exports = { planSheet, sheetFromPlan, parseTable, sheetFromTable, parseNumber, toXlsx, listedColumns, kindOf, ROWS };
