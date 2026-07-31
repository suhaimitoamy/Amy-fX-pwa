import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'assets/apps');
const textExtensions = new Set(['.html', '.js', '.mjs', '.css', '.json', '.md', '.txt']);
let changed = 0;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
    const original = fs.readFileSync(file, 'utf8');
    const normalized = `${original
      .split(/\r?\n/)
      .map(line => line.replace(/[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n+$/g, '')}\n`;
    if (normalized === original) continue;
    fs.writeFileSync(file, normalized);
    changed += 1;
  }
}

walk(root);
console.log(`Normalized whitespace in ${changed} synchronized text files.`);
