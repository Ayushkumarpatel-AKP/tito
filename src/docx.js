// Writes a real .docx (Word, LibreOffice, Google Docs) from simple blocks, with no extra package.
const { createZip } = require('./zip');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
/** "**bold**" runs inside a line */
function runs(text) {
  return String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p) => (/^\*\*[^*]+\*\*$/.test(p) ? `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${esc(p.slice(2, -2))}</w:t></w:r>` : `<w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r>`)).join('');
}
function para(b) {
  switch (b.t) {
    case 'title': return `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${runs(b.text)}</w:p>`;
    case 'h1': return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${runs(b.text)}</w:p>`;
    case 'h2': return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${runs(b.text)}</w:p>`;
    case 'bullet': return `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:ind w:left="540" w:hanging="270"/></w:pPr><w:r><w:t xml:space="preserve">•  </w:t></w:r>${runs(b.text)}</w:p>`;
    case 'quote': return `<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${runs(b.text)}</w:p>`;
    default: return `<w:p>${runs(b.text)}</w:p>`;
  }
}
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="4A3FA8"/><w:sz w:val="44"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="4A3FA8"/><w:sz w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="333333"/><w:sz w:val="26"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="666666"/></w:rPr></w:style></w:styles>';

/** blocks: [{ t: 'title'|'h1'|'h2'|'p'|'bullet'|'quote', text }] */
function buildDocx(blocks) {
  const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return createZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="${NS}"><w:body>${blocks.map(para).join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` },
  ]);
}
module.exports = { buildDocx };
