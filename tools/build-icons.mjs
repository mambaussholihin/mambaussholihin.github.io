#!/usr/bin/env node
/*
 * Membuat file ikon SVG untuk setiap emoji {…} yang dipakai di bagian DATA (peta pikiran)
 * dan FLOWS (alur proses) pada index.html.
 *
 * Pemakaian (butuh Node.js 18+ dan koneksi internet):
 *   node tools/build-icons.mjs
 *
 * Atau dari salinan lokal paket @iconify-json (folder berisi <set>/icons.json & <set>/chars.json):
 *   node tools/build-icons.mjs --from /path/ke/folder
 *
 * Hasil: assets/icons/fluent/<kode>.svg dan assets/icons/openmoji/<kode>.svg
 * <kode> = kode Unicode emoji tanpa FE0F, dipisah "-" (contoh 🧑‍🏫 → 1f9d1-200d-1f3eb).
 */
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETS = { fluent: 'fluent-emoji-flat', openmoji: 'openmoji' };
const fromIdx = process.argv.indexOf('--from');
const fromDir = fromIdx > -1 ? process.argv[fromIdx + 1] : null;

const emojiKey = e => [...e].map(c => c.codePointAt(0).toString(16)).filter(cp => cp !== 'fe0f').join('-');

async function loadJSON(set, file) {
  if (fromDir) return JSON.parse(await readFile(join(fromDir, set, file), 'utf8'));
  const res = await fetch(`https://cdn.jsdelivr.net/npm/@iconify-json/${set}@1/${file}`);
  if (!res.ok) throw new Error(`Gagal mengunduh ${set}/${file}: ${res.status}`);
  return res.json();
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/const (DATA|FLOWS) = `([\s\S]*?)`;/g)];
if (!blocks.some(b => b[1] === 'DATA')) throw new Error('Bagian DATA tidak ditemukan di index.html — ikon lama tidak diubah.');
const emojis = [...new Set(blocks.flatMap(b => [...b[2].matchAll(/\s\{([^}\s]+)\}/g)].map(m => m[1])))];
if (!emojis.length) throw new Error('Tidak ada emoji {…} di DATA/FLOWS — ikon lama tidak dihapus.');
console.log(`${emojis.length} emoji dipakai di ${blocks.map(b => b[1]).join(' & ')}.`);

let missingTotal = 0;
for (const [dir, set] of Object.entries(SETS)) {
  const [icons, chars] = await Promise.all([loadJSON(set, 'icons.json'), loadJSON(set, 'chars.json')]);
  const byKey = {};
  for (const [cp, name] of Object.entries(chars)) {
    // chars.json menulis kode dengan minimal 4 digit (mis. 0023 untuk #) → samakan dengan emojiKey.
    const k = cp.split('-').filter(x => x !== 'fe0f').map(x => parseInt(x, 16).toString(16)).join('-');
    if (!(k in byKey)) byKey[k] = name;
  }
  const outDir = join(ROOT, 'assets', 'icons', dir);
  await mkdir(outDir, { recursive: true });
  const wanted = new Set();
  const missing = [];
  for (const e of emojis) {
    const key = emojiKey(e);
    let name = byKey[key];
    while (name && !icons.icons[name] && icons.aliases && icons.aliases[name]) name = icons.aliases[name].parent;
    const icon = name && icons.icons[name];
    if (!icon) { missing.push(`${e} (${key})`); continue; }
    const w = icon.width || icons.width || 16, h = icon.height || icons.height || 16;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${icon.left || 0} ${icon.top || 0} ${w} ${h}">${icon.body}</svg>\n`;
    await writeFile(join(outDir, `${key}.svg`), svg);
    wanted.add(`${key}.svg`);
  }
  // Hapus ikon lama yang sudah tidak dipakai.
  for (const f of await readdir(outDir)) if (f.endsWith('.svg') && !wanted.has(f)) await unlink(join(outDir, f));
  console.log(`${dir}: ${wanted.size} ikon ditulis${missing.length ? `, tidak ditemukan: ${missing.join(' ')}` : ''}`);
  missingTotal += missing.length;
}
if (missingTotal) console.log('Emoji yang tidak ditemukan akan tampil sebagai emoji bawaan perangkat.');
