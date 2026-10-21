// Gera assets/kaykit/INDICE.md: cada pack com nº de modelos, arquivos e tamanho, e o nome de cada modelo por pasta.
// node scripts/assets/kaykit-index.mjs  (rode de novo sempre que um pack entrar, sair ou mudar)
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = 'assets/kaykit';
const isModel = (f) => /\.(gltf|glb)$/i.test(f);
// alguns packs KayKit nomeiam o glb como "nome.gltf.glb"; o nome do modelo é o que vem antes
const modelName = (f) => f.replace(/(\.gltf)?\.(gltf|glb)$/i, '');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const mb = (b) => (b / 1048576).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const packs = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const rows = [];
const sections = [];
let totFiles = 0, totBytes = 0, totModels = 0;
for (const pack of packs) {
  const files = walk(path.join(root, pack));
  const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
  const byDir = new Map();
  for (const f of files.filter((f) => isModel(f))) {
    const dir = path.relative(path.join(root, pack), path.dirname(f)).replaceAll('\\', '/');
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(modelName(path.basename(f)));
  }
  const models = [...byDir.values()].reduce((s, l) => s + l.length, 0);
  totFiles += files.length; totBytes += bytes; totModels += models;
  rows.push(`| [\`${pack}\`](#${pack}) | ${models} | ${files.length} | ${mb(bytes)} MB |`);
  sections.push(`## ${pack}\n`);
  for (const [dir, names] of [...byDir].sort()) sections.push(`- \`${dir}/\` (${names.length}): ${names.sort().join(', ')}`);
  sections.push('');
}

writeFileSync(path.join(root, 'INDICE.md'), [
  '# Índice dos modelos KayKit',
  '',
  'Gerado por `node scripts/assets/kaykit-index.mjs`; não edite à mão. O que é cada pack, de onde veio e como usar: [README.md](README.md). Visão geral de todos os assets do jogo: [docs/ASSETS.md](../../docs/ASSETS.md).',
  '',
  '| Pack | Modelos | Arquivos | Tamanho |',
  '|---|---:|---:|---:|',
  ...rows,
  `| **Total** | **${totModels}** | **${totFiles}** | **${mb(totBytes)} MB** |`,
  '',
  ...sections,
].join('\n'));
console.log(`${packs.length} packs, ${totModels} modelos, ${totFiles} arquivos, ${mb(totBytes)} MB`);
