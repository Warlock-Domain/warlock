// Uploads the assets/sons-rpg pack to the sound-lab R2 bucket (issue #366): each .wav becomes a mono 96 kb/s mp3 at
// pack/<path>.mp3, plus pack/index.json ([{ path, s }], s = seconds) that the forum page lists. Needs ffmpeg/ffprobe on PATH and
// a wrangler login with access to the bucket. Run once per bucket:
//   node scripts/assets/sound-pack.mjs warlock-sons <scratch-dir>
//   node scripts/assets/sound-pack.mjs warlock-sons-pr <scratch-dir>
// --local fills the bucket of `wrangler dev` instead (run it from the worktree that serves the page)
import { execFile } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [bucket, scratch] = process.argv.slice(2).filter((a) => a !== '--local');
const where = process.argv.includes('--local') ? '--local' : '--remote';
if (!bucket || !scratch) throw new Error('usage: node scripts/assets/sound-pack.mjs <bucket> <scratch-dir>');
const SRC = 'assets/sons-rpg';
// wrangler uploads one object per call: a few at a time keeps the 533 calls to minutes without hitting the API rate limit.
// The local bucket is one SQLite file that concurrent writers break ("Network connection lost"), so --local goes one by one
const PARALLEL = where === '--local' ? 1 : 6;

const wavs = readdirSync(SRC, { recursive: true }).filter((f) => f.endsWith('.wav')).map((f) => f.replaceAll('\\', '/'));
// a lost connection on one of the 533 uploads should not throw away the run: three tries each
async function put(key, file, type) {
  for (let tries = 1; ; tries++) {
    try {
      return await run('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', file, '--content-type', type, where], { shell: true });
    } catch (e) {
      if (tries === 3) throw e;
    }
  }
}

const index = [];
let next = 0;
async function worker() {
  while (next < wavs.length) {
    const wav = wavs[next++];
    const path = wav.slice(0, -4);
    const mp3 = join(scratch, `${path}.mp3`);
    mkdirSync(dirname(mp3), { recursive: true });
    await run('ffmpeg', ['-v', 'error', '-y', '-i', join(SRC, wav), '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', mp3]);
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]);
    index.push({ path, s: Math.round(Number(stdout) * 100) / 100 });
    await put(`pack/${path}.mp3`, mp3, 'audio/mpeg');
    console.log(`${index.length}/${wavs.length} ${relative('.', mp3)}`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
index.sort((a, b) => a.path.localeCompare(b.path));
const indexFile = join(scratch, 'index.json');
writeFileSync(indexFile, JSON.stringify(index));
await put('pack/index.json', indexFile, 'application/json');
console.log(`done: ${index.length} files in ${bucket}`);
