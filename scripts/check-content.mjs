// Validates every content pack listed in public/content/index.json.
// Run with: npm run check:content
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'content');
const errors = [];
const warnings = [];
const seenIds = new Map();
const byDifficulty = {};
let total = 0;

const read = (file) => JSON.parse(readFileSync(join(contentDir, file), 'utf8'));

function checkQuiz(quiz, where) {
  if (!Array.isArray(quiz) || quiz.length < 3) {
    errors.push(`${where}: quiz must have at least 3 items`);
    return;
  }
  if (quiz.length > 6) warnings.push(`${where}: ${quiz.length} quiz items is a lot; 4–5 reads better`);

  const opens = quiz.filter((q) => q.type === 'open').length;
  if (opens !== 1) warnings.push(`${where}: expected exactly 1 open question, found ${opens}`);

  quiz.forEach((q, i) => {
    const at = `${where}: quiz[${i}]`;
    if (!q.q) errors.push(`${at}: missing "q"`);
    if (q.type === 'mcq' || q.type === 'gap') {
      if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${at}: needs an options array`);
      else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
        errors.push(`${at}: answer ${q.answer} is not a valid index into ${q.options.length} options`);
      }
      if (!q.why) warnings.push(`${at}: no "why" explanation`);
    } else if (q.type === 'tf') {
      if (typeof q.answer !== 'boolean') errors.push(`${at}: tf answer must be true or false`);
      if (!q.why) warnings.push(`${at}: no "why" explanation`);
    } else if (q.type === 'open') {
      if (!q.model) errors.push(`${at}: open question needs a "model" answer`);
    } else {
      errors.push(`${at}: unknown type "${q.type}"`);
    }
  });
}

function checkChallenge(c, pack) {
  const where = `${pack}/${c.id || '(no id)'}`;
  if (!c.id) errors.push(`${pack}: a challenge has no id`);
  else if (seenIds.has(c.id)) errors.push(`${where}: duplicate id, also in ${seenIds.get(c.id)}`);
  else seenIds.set(c.id, pack);

  if (!c.title) errors.push(`${where}: missing title`);
  if (!Number.isInteger(c.difficulty) || c.difficulty < 1 || c.difficulty > 5) {
    errors.push(`${where}: difficulty must be an integer 1–5`);
  } else {
    byDifficulty[c.difficulty] = (byDifficulty[c.difficulty] || 0) + 1;
  }
  if (!Array.isArray(c.topics) || c.topics.length === 0) warnings.push(`${where}: no topics`);

  if (!Array.isArray(c.newWords) || c.newWords.length === 0) errors.push(`${where}: no newWords`);
  else {
    if (c.newWords.length > 6) warnings.push(`${where}: ${c.newWords.length} new words may be too many`);
    c.newWords.forEach((w, i) => {
      if (!w.fr || !w.en) errors.push(`${where}: newWords[${i}] needs both fr and en`);
    });
  }

  const paras = c.reading && c.reading.paragraphs;
  if (!Array.isArray(paras) || paras.length < 2) errors.push(`${where}: reading needs at least 2 paragraphs`);
  else {
    const words = paras.join(' ').split(/\s+/).length;
    if (words > 320) warnings.push(`${where}: reading is ${words} words — long enough to discourage`);
    if (words < 90) warnings.push(`${where}: reading is only ${words} words`);
  }

  const lines = c.listening && c.listening.lines;
  if (!Array.isArray(lines) || lines.length < 4) errors.push(`${where}: listening needs at least 4 lines`);
  else lines.forEach((l, i) => {
    if (!l.text) errors.push(`${where}: listening.lines[${i}] has no text`);
  });

  if (!c.grammar || !c.grammar.point || !c.grammar.explain) warnings.push(`${where}: no grammar point`);

  checkQuiz(c.quiz, where);
}

const index = read('index.json');
if (!Array.isArray(index.packs) || index.packs.length === 0) {
  console.error('index.json has no packs listed');
  process.exit(1);
}

for (const file of index.packs) {
  let pack;
  try {
    pack = read(file);
  } catch (e) {
    errors.push(`${file}: cannot parse — ${e.message}`);
    continue;
  }
  if (!Array.isArray(pack.challenges)) {
    errors.push(`${file}: no challenges array`);
    continue;
  }
  pack.challenges.forEach((c) => checkChallenge(c, file));
  total += pack.challenges.length;
}

warnings.forEach((w) => console.log(`  warn  ${w}`));
errors.forEach((e) => console.log(`  ERROR ${e}`));

console.log(`\n${total} challenges across ${index.packs.length} pack(s)`);
console.log(
  'by difficulty: ' +
    [1, 2, 3, 4, 5].map((d) => `${d}→${byDifficulty[d] || 0}`).join('  ')
);
console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
