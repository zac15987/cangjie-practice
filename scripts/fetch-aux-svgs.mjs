// Fetch auxiliary-shape example SVGs from Wikimedia Commons and build the
// manifest used by the practice screen. Run with: node scripts/fetch-aux-svgs.mjs
//
// Source page (CC0 SVGs by user "Cangjie6"):
//   https://zh.wikibooks.org/wiki/倉頡輸入法/輔助字形
//
// Output:
//   public/auxiliary/Cjem-*.svg
//   src/data/auxiliary.json
// Note: the directory is named "auxiliary", not "aux", because AUX is a reserved
// Windows device name and Git's open() syscall refuses to index files inside it.

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const OUT_DIR = resolve(ROOT, 'public/auxiliary');
const MANIFEST = resolve(ROOT, 'src/data/auxiliary.json');
const CACHE_HTML = resolve(ROOT, 'scripts/.cache/aux-page.html');

const PAGE_URL = 'https://zh.wikibooks.org/wiki/%E5%80%89%E9%A0%A1%E8%BC%B8%E5%85%A5%E6%B3%95/%E8%BC%94%E5%8A%A9%E5%AD%97%E5%BD%A2';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'cangjie-practice/fetch-aux-svgs (https://github.com/zac15987/cangjie-practice; puzi@leyu.com.tw)';

const API_BATCH = 50;          // MediaWiki API allows up to 50 titles per query
const CONCURRENCY = 1;          // sequential downloads — Wikimedia rate-limits aggressively
const MAX_RETRIES = 5;
const REQUEST_DELAY_MS = 600;   // gap between successful downloads
const RATE_LIMIT_COOLDOWN_MS = 60_000; // wait this long when a 429 is seen

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function getPageHtml() {
  if (await exists(CACHE_HTML)) {
    return readFile(CACHE_HTML, 'utf8');
  }
  console.log(`fetching ${PAGE_URL}`);
  const res = await fetch(PAGE_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`page fetch failed: ${res.status}`);
  const html = await res.text();
  await mkdir(dirname(CACHE_HTML), { recursive: true });
  await writeFile(CACHE_HTML, html, 'utf8');
  return html;
}

function extractFilenames(html) {
  const seen = new Set();
  const re = /Cjem-([a-z])(\d+)-(\d+)\.svg/g;
  for (const m of html.matchAll(re)) seen.add(m[0]);
  return [...seen].sort((a, b) => {
    const pa = parseName(a), pb = parseName(b);
    return pa.letter.localeCompare(pb.letter) || pa.aux - pb.aux || pa.ex - pb.ex;
  });
}

function parseName(filename) {
  const m = filename.match(/^Cjem-([a-z])(\d+)-(\d+)\.svg$/);
  if (!m) throw new Error(`bad filename: ${filename}`);
  return { letter: m[1], aux: Number(m[2]), ex: Number(m[3]) };
}

async function resolveCdnUrls(filenames) {
  // Use the MediaWiki API to batch-resolve filenames to upload.wikimedia.org CDN URLs.
  // Up to 50 titles per request — only ~11 API calls for 505 files.
  const urlByName = new Map();
  for (let i = 0; i < filenames.length; i += API_BATCH) {
    const batch = filenames.slice(i, i + API_BATCH);
    const titles = batch.map(n => 'File:' + n).join('|');
    const params = new URLSearchParams({
      action: 'query',
      titles,
      prop: 'imageinfo',
      iiprop: 'url',
      format: 'json',
      formatversion: '2',
    });
    const url = `${COMMONS_API}?${params}`;
    let lastErr;
    let resolved = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const pages = json?.query?.pages ?? [];
        for (const page of pages) {
          const title = page.title?.replace(/^File:/, '');
          const cdn = page.imageinfo?.[0]?.url;
          if (title && cdn) urlByName.set(title, cdn);
        }
        resolved = true;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
    if (!resolved) throw new Error(`API batch ${i} failed: ${lastErr}`);
    console.log(`  resolved ${urlByName.size}/${filenames.length}`);
  }
  return urlByName;
}

async function downloadOne(filename, cdnUrl) {
  const dest = resolve(OUT_DIR, filename);
  if (await exists(dest)) {
    const s = await stat(dest);
    if (s.size > 0) return { filename, skipped: true };
  }
  if (!cdnUrl) return { filename, error: 'no CDN url' };
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(cdnUrl, { headers: { 'User-Agent': UA } });
      if (res.status === 429) {
        console.log(`    429 on ${filename}, sleeping ${RATE_LIMIT_COOLDOWN_MS / 1000}s`);
        await new Promise(r => setTimeout(r, RATE_LIMIT_COOLDOWN_MS));
        throw new Error('HTTP 429');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('empty body');
      await writeFile(dest, buf);
      if (REQUEST_DELAY_MS > 0) {
        await new Promise(r => setTimeout(r, REQUEST_DELAY_MS));
      }
      return { filename, bytes: buf.length };
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  return { filename, error: String(lastErr) };
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let i = 0;
  let done = 0;
  const total = items.length;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < total) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
      done++;
      if (done % 50 === 0 || done === total) {
        console.log(`  downloaded ${done}/${total}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function buildManifest(filenames) {
  const byLetter = {};
  for (const name of filenames) {
    const { letter, aux, ex } = parseName(name);
    const upper = letter.toUpperCase();
    byLetter[upper] ??= new Map();
    const group = byLetter[upper];
    if (!group.has(aux)) group.set(aux, []);
    group.get(aux).push({ name, ex });
  }
  const out = {};
  for (const upper of Object.keys(byLetter).sort()) {
    const group = byLetter[upper];
    const auxIds = [...group.keys()].sort((a, b) => a - b);
    out[upper] = auxIds.map(aux => ({
      aux,
      examples: group.get(aux).sort((a, b) => a.ex - b.ex).map(e => e.name),
    }));
  }
  return out;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(dirname(MANIFEST), { recursive: true });

  const html = await getPageHtml();
  const filenames = extractFilenames(html);
  console.log(`found ${filenames.length} unique SVG filenames`);

  // Resolve all CDN URLs up front via the API (skips files already on disk).
  const needsUrl = [];
  for (const name of filenames) {
    const dest = resolve(OUT_DIR, name);
    if (await exists(dest)) {
      const s = await stat(dest);
      if (s.size > 0) continue;
    }
    needsUrl.push(name);
  }
  console.log(`need CDN urls for ${needsUrl.length} files (${filenames.length - needsUrl.length} already on disk)`);

  let urlByName = new Map();
  if (needsUrl.length > 0) {
    urlByName = await resolveCdnUrls(needsUrl);
  }

  const results = await runPool(
    filenames,
    (name) => downloadOne(name, urlByName.get(name)),
    CONCURRENCY,
  );
  const skipped = results.filter(r => r.skipped).length;
  const downloaded = results.filter(r => r.bytes != null).length;
  const failed = results.filter(r => r.error);
  console.log(`downloaded ${downloaded}, skipped ${skipped}, failed ${failed.length}`);
  if (failed.length) {
    console.log('failed files:');
    for (const f of failed) console.log(`  ${f.filename}: ${f.error}`);
  }

  const manifest = buildManifest(filenames.filter(n => {
    const r = results.find(x => x.filename === n);
    return r && !r.error;
  }));
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`wrote manifest: ${MANIFEST}`);

  const letters = Object.keys(manifest);
  const totalShapes = letters.reduce((n, l) => n + manifest[l].length, 0);
  const totalExamples = letters.reduce((n, l) => n + manifest[l].reduce((m, g) => m + g.examples.length, 0), 0);
  console.log(`manifest summary: ${letters.length} letters, ${totalShapes} aux shapes, ${totalExamples} examples`);
}

main().catch(err => { console.error(err); process.exit(1); });
