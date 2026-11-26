// Writes a real .xlsx workbook (Excel, LibreOffice, Google Sheets and Numbers all open it): a styled header row, number and date
// formats, live formulas (SUM, AVERAGE, running totals), column widths, a frozen header and filter buttons.
const { createZip } = require('./zip');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i) => { let s = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// style ids (see STYLES below)
const S = { text: 0, head: 1, num: 2, date: 3, total: 4, int: 5, wrap: 6 };
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="dd\\-mmm\\-yyyy"/></numFmts>' +
  '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6C63C9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEBFA"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0CDEB"/></left><right style="thin"><color rgb="FFD0CDEB"/></right><top style="thin"><color rgb="FFD0CDEB"/></top><bottom style="thin"><color rgb="FFD0CDEB"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="7">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left"/></xf>' +
  '<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const serial = (d) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);

/** cell: string | number | Date | null | { v, f, s: 'head'|'num'|'date'|'total'|'int'|'text'|'wrap' } */
function cellXml(c, ref, sheetStyle) {
  const base = sheetStyle !== undefined ? ` s="${sheetStyle}"` : '';
  if (c === null || c === undefined || c === '') return base ? `<c r="${ref}"${base}/>` : '';
  const o = typeof c === 'object' && !(c instanceof Date) ? c : { v: c };
  const sAttr = o.s !== undefined ? ` s="${S[o.s]}"` : base;
  if (o.f) return `<c r="${ref}"${sAttr}><f>${esc(o.f)}</f>${Number.isFinite(o.v) ? `<v>${o.v}</v>` : ''}</c>`;
  if (o.v instanceof Date) return `<c r="${ref}"${sAttr || ` s="${S.date}"`}><v>${serial(o.v)}</v></c>`;
  if (typeof o.v === 'number' && Number.isFinite(o.v)) return `<c r="${ref}"${sAttr}><v>${o.v}</v></c>`;
  if (o.v === null || o.v === undefined || o.v === '') return `<c r="${ref}"${sAttr}/>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(o.v)}</t></is></c>`;
}

/** sheet: { name, rows: cell[][], widths?: number[], colStyles?: ('text'|'num'|'date'|'int')[], freeze?, filter?, filterRows? } */
function sheetXml(sh) {
  const rows = sh.rows || [], ncol = Math.max(1, ...rows.map((r) => r.length));
  const cs = (sh.colStyles || []).map((k) => (k ? S[k] : undefined));
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  x += `<dimension ref="A1:${colName(ncol - 1)}${Math.max(1, rows.length)}"/>`;
  x += `<sheetViews><sheetView workbookViewId="0"${sh.first ? ' tabSelected="1"' : ''}>${sh.freeze !== false && rows.length > 1 ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>' : ''}</sheetView></sheetViews>`;
  x += '<sheetFormatPr defaultRowHeight="15"/>';
  const w = sh.widths || []; x += '<cols>' + Array.from({ length: ncol }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(80, Math.max(8, w[i] || 14))}" customWidth="1"/>`).join('') + '</cols>';
  x += '<sheetData>';
  rows.forEach((r, ri) => {
    const head = ri === 0 && sh.header !== false;
    x += `<row r="${ri + 1}"${head ? ' ht="22" customHeight="1"' : ''}>`;
    for (let ci = 0; ci < ncol; ci++) {
      const c = r[ci];
      x += cellXml(head && c !== undefined && c !== null && typeof c !== 'object' ? { v: c, s: 'head' } : c, colName(ci) + (ri + 1), head ? undefined : cs[ci]);
    }
    x += '</row>';
  });
  x += '</sheetData>';
  if (sh.filter !== false && rows.length > 1 && sh.header !== false) x += `<autoFilter ref="A1:${colName(ncol - 1)}${sh.filterRows || rows.length}"/>`;
  return x + '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
}

function buildXlsx(sheets) {
  sheets = sheets.map((s, i) => ({ ...s, first: i === 0, name: String(s.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet' + (i + 1) }));
  const T = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>' },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${T}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${T}"><bookViews><workbookView/></bookViews><sheets>` + sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${T}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="${T}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return createZip(files);
}
module.exports = { buildXlsx, colName };
