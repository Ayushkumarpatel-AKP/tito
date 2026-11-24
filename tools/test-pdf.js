// electron tools/test-pdf.js <out.pdf> : renders a sample answer to PDF without any dialog
const { app } = require('electron');
const fs = require('fs');
const pdf = require('../src/pdf');
app.whenReady().then(async () => {
  const entries = [{
    title: 'TypeError: map of undefined', ts: Date.now(), provider: 'Google Gemini',
    answer: 'This error happens when you call `.map` on a variable that is **undefined** instead of an array.\n- Check that the variable is set before using it\n- Use optional chaining like `items?.map(...)`\n- Give it a default: `const items = []`\n1. Open the file\n2. Fix the line\n3. Run it again',
  }];
  const buf = await pdf.renderToBuffer(entries, 'Tito answer');
  fs.writeFileSync(process.argv[2], buf); console.log('PDF bytes', buf.length, 'header', buf.slice(0, 5).toString()); app.exit(0);
});
