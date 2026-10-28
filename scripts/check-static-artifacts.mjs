import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'dist');
const allowed = new Set([
  'index.html', 'styles.css', 'app.js', 'backup.js', 'domain.js', 'storage.js',
  'sync.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', '.nojekyll',
]);
const entries = await readdir(output, { recursive: true });
const files = entries.filter(entry => !entry.endsWith(sep) && !entry.endsWith('/'));
const unexpected = files.filter(file => !allowed.has(file));
const missing = [...allowed].filter(file => !files.includes(file));
if (unexpected.length || missing.length) {
  throw Error(`Unexpected static artifact inventory. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`);
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{30,}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
for (const file of files) {
  const contents = await readFile(resolve(output, file), 'utf8');
  if (secretPatterns.some(pattern => pattern.test(contents))) {
    throw Error(`A private credential pattern was found in the static artifact: ${file}`);
  }
}
console.log(`Checked ${files.length} allowlisted static artifacts; no private credential patterns found.`);
