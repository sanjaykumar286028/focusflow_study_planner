import { mkdir, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, 'dist');
const files = [
  'index.html', 'styles.css', 'app.js', 'backup.js', 'domain.js',
  'storage.js', 'sync.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', '.nojekyll',
];

await mkdir(output, { recursive: true });
for (const file of files) await copyFile(join(root, file), join(output, file));
console.log(`Staged ${files.length} static app files in dist/`);
