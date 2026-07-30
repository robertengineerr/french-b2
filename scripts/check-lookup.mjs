// Measures how much of the reading content tap-to-translate can actually resolve,
// and prints the most common failures so the lexicon can be extended where it
// matters. Run after adding a content pack.
//
// Run: npm run check:lookup
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, lookup } from '../src/lib/lookup.js';
import seedVocab from '../src/seedVocab.js';
import lexicon from '../src/data/lexicon.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'public', 'content');
const read = (f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8'));

const challenges = read('index.json').packs.flatMap((f) => read(f).challenges);
const cards = seedVocab.map((v, i) => ({ ...v, id: `seed${i}` }));

let tokens = 0;
let hits = 0;
const bySource = {};
const misses = new Map();

for (const c of challenges) {
  const index = buildIndex({
    newWords: c.newWords,
    glossary: (c.reading && c.reading.glossary) || [],
    cards,
  });
  const re = /[\p{L}][\p{L}’'-]*/gu;
  let m;
  while ((m = re.exec(c.reading.paragraphs.join(' '))) !== null) {
    tokens++;
    const hit = lookup(m[0], index);
    if (hit) {
      hits++;
      bySource[hit.source] = (bySource[hit.source] || 0) + 1;
    } else {
      const k = m[0].toLowerCase();
      misses.set(k, (misses.get(k) || 0) + 1);
    }
  }
}

const pct = (n) => `${((100 * n) / tokens).toFixed(1)}%`;
console.log(`lexicon: ${Object.keys(lexicon).length} entries, deck seed: ${cards.length} cards`);
console.log(`\ncoverage: ${pct(hits)} of ${tokens} tokens across ${challenges.length} passages`);
console.log('  by source:');
Object.entries(bySource)
  .sort((a, b) => b[1] - a[1])
  .forEach(([s, n]) => console.log(`    ${s.padEnd(9)} ${pct(n).padStart(6)}  (${n})`));

const ranked = [...misses.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n${ranked.length} distinct words unresolved. Top 30 worth adding:`);
console.log('  ' + ranked.slice(0, 30).map(([w, n]) => `${w}(${n})`).join(' '));

// A floor, not a target — untranslated words are handled in the UI, but a big
// regression here means the lexicon and the content have drifted apart.
const FLOOR = 0.7;
if (hits / tokens < FLOOR) {
  console.error(`\nFAIL: coverage below ${FLOOR * 100}%`);
  process.exit(1);
}
console.log(`\nok — above the ${FLOOR * 100}% floor`);
