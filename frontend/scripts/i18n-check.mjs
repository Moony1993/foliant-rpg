// Lists UI texts passed to t() that have no English translation in src/i18n/en.json, and entries nobody uses.
// Usage: node scripts/i18n-check.mjs [--keys]   (--keys prints every text, for building the dictionary)
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const keys = new Set();
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.tsx?$/.test(f)) continue;
    const sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    (function visit(n) {
      if (ts.isCallExpression(n) && /^(t|tr)$/.test(n.expression.getText()) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]))
        keys.add(n.arguments[0].text);
      ts.forEachChild(n, visit);
    })(sf);
  }
})(root);

if (process.argv.includes('--keys')) { console.log(JSON.stringify([...keys].sort(), null, 1)); process.exit(0); }
const en = JSON.parse(fs.readFileSync(path.join(root, 'i18n/en.json'), 'utf8'));
const missing = [...keys].filter((k) => !(k in en)).sort();
const unused = Object.keys(en).filter((k) => !keys.has(k)).sort();
for (const k of missing) console.log('missing:', k);
for (const k of unused) console.log('unused: ', k);
console.log(`${keys.size} texts, ${missing.length} missing, ${unused.length} unused`);
process.exit(missing.length ? 1 : 0);
