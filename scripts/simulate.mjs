// Simulates learners over 60 days to check the adaptive loop actually behaves:
// a strong learner should climb into B2 and get served harder content, a weak one
// should be pulled back down, and an improving one should stay in a productive
// accuracy band rather than being crushed or coasting.
//
// Run: node scripts/simulate.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  bandFor,
  completeDay,
  dayKey,
  deriveStats,
  dueCards,
  freshState,
  gradeCard,
  lockServed,
  selectChallenge,
  tierFor,
} from '../src/engine.js';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'content');
const index = JSON.parse(readFileSync(join(contentDir, 'index.json'), 'utf8'));
const challenges = index.packs.flatMap(
  (f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8')).challenges
);

// A learner's true ability on the same 1–5 scale as challenge difficulty.
// Accuracy follows a logistic curve on the gap between the two.
function accuracyFor(ability, difficulty) {
  const p = 1 / (1 + Math.exp(-1.15 * (ability - difficulty)));
  return Math.max(0.1, Math.min(0.97, 0.45 + 0.55 * p));
}

function run(label, ability, { days = 60, growth = 0, recall = 0.8 } = {}) {
  let state = freshState();
  const start = dayKey();
  const served = [];
  let trueAbility = ability;

  for (let d = 0; d < days; d++) {
    const today = addDays(start, d);
    const ch = selectChallenge(state, challenges, today);
    state = lockServed(state, ch.id, today);

    const acc = accuracyFor(trueAbility, ch.difficulty);
    const total = ch.quiz.length;
    const right = Math.round(acc * total); // whole items, like a real quiz

    state = completeDay(
      state,
      {
        challengeId: ch.id,
        quizRight: right,
        quizTotal: total,
        listenSeconds: 75,
        difficulty: ch.difficulty,
        newWords: ch.newWords,
      },
      today
    );

    // Review the day's due cards too, so the deck stats mean something.
    for (const card of dueCards(state, today).slice(0, state.settings.reviewsPerSession)) {
      const r = Math.random() < recall ? (Math.random() < 0.35 ? 'easy' : 'good') : 'again';
      state = gradeCard(state, card.id, r, today);
    }

    served.push({ diff: ch.difficulty, score: state.score, acc });
    trueAbility = Math.min(5, trueAbility + growth);
  }

  const stats = deriveStats(state, addDays(start, days - 1));
  const mean = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
  const first10 = served.slice(0, 10);
  const last10 = served.slice(-10);

  console.log(`\n── ${label} (true ability ${ability}${growth ? `, +${growth}/day` : ''})`);
  console.log(
    `   difficulty served: first10=${mean(first10, 'diff').toFixed(2)}  last10=${mean(last10, 'diff').toFixed(2)}`
  );
  console.log(
    `   accuracy achieved: first10=${mean(first10, 'acc').toFixed(2)}  last10=${mean(last10, 'acc').toFixed(2)}`
  );
  console.log(`   score: 38 → ${state.score} (${bandFor(state.score).label}, tier ${tierFor(state.score)})`);
  console.log(`   deck: ${stats.deckSize} cards, ${stats.mastered} acquired, ${stats.learning} learning`);
  console.log(`   streak ${stats.streak.current}, sessions ${stats.sessions}, ETA ${stats.etaWeeks ?? '—'} wk`);

  return { state, served, stats, first10: mean(first10, 'diff'), last10: mean(last10, 'diff') };
}

console.log(`content bank: ${challenges.length} challenges`);

const strong = run('Strong learner', 4.2);
const weak = run('Struggling learner', 1.6);
const growing = run('Improving learner', 2.2, { growth: 0.035 });

const checks = [];
const add = (ok, msg) => checks.push({ ok, msg });

add(strong.state.score > 65, `strong learner crosses the B2 threshold (${strong.state.score})`);
add(strong.last10 > strong.first10, `strong learner is served harder content over time (${strong.first10.toFixed(2)} → ${strong.last10.toFixed(2)})`);
add(weak.state.score < 38, `struggling learner's score falls below the start (${weak.state.score})`);
add(weak.last10 <= weak.first10, `struggling learner is served easier content (${weak.first10.toFixed(2)} → ${weak.last10.toFixed(2)})`);
add(weak.state.score > 0, `struggling learner does not hit the floor (${weak.state.score})`);
add(growing.state.score > 38, `improving learner climbs (${growing.state.score})`);

const growAcc = growing.served.slice(-20).reduce((s, x) => s + x.acc, 0) / 20;
add(growAcc > 0.6 && growAcc < 0.95, `improving learner stays in a productive band (${growAcc.toFixed(2)})`);
add(growing.stats.deckSize > 103, `deck grows past the seed (${growing.stats.deckSize} cards)`);
add(growing.stats.mastered > 0, `cards reach "acquired" (${growing.stats.mastered})`);
add(growing.stats.streak.current === 60, `60 consecutive days gives streak 60 (${growing.stats.streak.current})`);

const uniqueServed = new Set(Object.values(growing.state.days).map((d) => d.challengeId)).size;
add(uniqueServed === challenges.length, `all ${challenges.length} challenges get used before repeating (${uniqueServed})`);

console.log('');
checks.forEach((c) => console.log(`${c.ok ? '  ok  ' : '  FAIL'} ${c.msg}`));
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
