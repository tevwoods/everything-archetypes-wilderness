import fs from 'fs';
import path from 'path';

const packsDir = path.join(process.cwd(), 'packs', 'Everything-Archetypes-Wilderness');
if (!fs.existsSync(packsDir)) {
  console.error('packs/Everything-Archetypes-Wilderness not found.');
  process.exit(1);
}

const files = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));
for (const file of files) {
  const filePath = path.join(packsDir, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  let docs;
  try {
    docs = JSON.parse(raw);
  } catch (e) {
    console.warn(`Skipping ${file} - invalid JSON: ${e.message}`);
    continue;
  }
  const outPath = path.join(packsDir, path.basename(file, '.json') + '.db');
  const lines = docs.map(d => JSON.stringify(d)).join('\n') + '\n';
  fs.writeFileSync(outPath, lines, 'utf8');
  console.log(`Wrote ${outPath} (${docs.length} documents)`);
}
console.log('Conversion complete.');
