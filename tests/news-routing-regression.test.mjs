import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const filterPath = new URL('../lib/news-relevance.mjs', import.meta.url);
const filterSource = fs.readFileSync(filterPath, 'utf8');
const filterDataUrl = `data:text/javascript;base64,${Buffer.from(filterSource).toString('base64')}`;

const apiPath = new URL('../api/news.js', import.meta.url);
const rawApiSource = fs.readFileSync(apiPath, 'utf8');
const apiSource = rawApiSource
  .replace("'../lib/news-relevance.mjs'", `'${filterDataUrl}'`);
const api = await import(`data:text/javascript;base64,${Buffer.from(apiSource).toString('base64')}`);

test('news diurutkan berdasarkan ID Telegram terbaru', () => {
  const result = api.sortNewestFirst([{ id: '101' }, { id: '305' }, { id: '220' }]);
  assert.deepEqual(result.map(x => x.id), ['305', '220', '101']);
});

test('Vercel memuat modul filter ESM secara dinamis', () => {
  assert.doesNotMatch(rawApiSource, /^import\s+.*news-relevance\.mjs/m);
  assert.match(rawApiSource, /import\('\.\.\/lib\/news-relevance\.mjs'\)/);
  assert.match(rawApiSource, /await loadNewsRelevance\(\)/);
});

test('market intel membawa ID berita pada deep-link notifikasi', () => {
  const appSource = fs.readFileSync(new URL('../app/src/main/assets/apps/market-intel/app.js', import.meta.url), 'utf8');
  assert.match(appSource, /#news=\$\{encodeURIComponent\(id\)\}/);
  assert.match(appSource, /data-news-id/);
  assert.match(appSource, /focusNewsItem\(pendingNewsId\)/);
});