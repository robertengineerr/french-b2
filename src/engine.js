// Adaptive engine: level estimation, daily challenge selection, spaced repetition,
// streaks and stats. Everything runs locally — state lives in localStorage and can
// be exported/imported as JSON so progress survives a new phone or a cleared cache.

// Explicit extension so the engine can also be imported straight into Node by
// scripts/simulate.mjs, not just bundled by Vite.
import seedVocab from './seedVocab.js';

export const STORAGE_KEY = 'fr-b2-state-v1';
const STATE_VERSION = 1;

// ---------------------------------------------------------------- level model

// One 0-100 ability score decides which challenges get served. The bands are
// deliberately coarse: the question is "am I drifting up or down", not a precise
// CEFR verdict.
export const BANDS = [
  { min: 0, max: 24, tier: 1, label: 'B1.1', blurb: 'Solid basics, still reaching for words' },
  { min: 25, max: 44, tier: 2, label: 'B1.2', blurb: 'Comfortable on familiar topics' },
  { min: 45, max: 64, tier: 3, label: 'B1+', blurb: 'Knocking on the door of B2' },
  { min: 65, max: 84, tier: 4, label: 'B2.1', blurb: 'B2 reached — handling abstract topics' },
  { min: 85, max: 100, tier: 5, label: 'B2.2', blurb: 'Strong B2 — nuance and register' },
];

export const B2_THRESHOLD = 65;
const START_SCORE = 38; // "around B1", per your own read on it

export function bandFor(score) {
  return BANDS.find((b) => score >= b.min && score <= b.max) || BANDS[0];
}

export function tierFor(score) {
  return bandFor(score).tier;
}

// ------------------------------------------------------------------ date help

export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function daysBetween(aKey, bKey) {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
}

// Deterministic PRNG so "today's challenge" is stable however many times the app
// is reopened, without having to persist the choice before it's shown.
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------- state I/O

export function cardId(fr) {
  return `c${hashString(fr).toString(36)}`;
}

export function freshState(now = new Date()) {
  const today = dayKey(now);
  const cards = {};

  // Seed the deck from your own lists. These are words you've already met, so
  // they start as review cards rather than brand-new ones — but their due dates
  // are spread evenly over three weeks (i % 21, roughly five a day) so day one
  // isn't a hundred-card wall. Because the list is grouped by theme, each day's
  // batch also happens to hang together.
  // Cards carrying a correction jump the queue: a wrong note is worse than a
  // forgotten word.
  seedVocab.forEach((v, i) => {
    const id = cardId(v.fr);
    cards[id] = {
      id,
      fr: v.fr,
      en: v.en,
      note: v.note || null,
      fix: v.fix || null,
      emoji: v.emoji || null,
      tags: v.tags || [],
      source: 'seed',
      introducedOn: today,
      ease: 2.4,
      interval: v.fix ? 0 : 2,
      due: addDays(today, v.fix ? 0 : i % 21),
      dueTime: null,
      reps: 0,
      lapses: 0,
      streak: 0,
    };
  });

  return {
    version: STATE_VERSION,
    createdAt: new Date().toISOString(),
    settings: {
      rate: 0.9,
      voiceURI: null,
      reminderTime: '19:00',
      reviewsPerSession: 20,
    },
    score: START_SCORE,
    scoreHistory: [{ date: today, score: START_SCORE }],
    cards,
    days: {}, // dayKey -> completion record
    served: {}, // dayKey -> challengeId, locked in once shown
    streak: { current: 0, longest: 0, last: null },
    totals: { listenSeconds: 0, quizRight: 0, quizTotal: 0, sessions: 0, practiceAnswered: 0, practiceRight: 0 },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STATE_VERSION) return migrate(parsed);
    return parsed;
  } catch {
    return freshState();
  }
}

// Only one version exists so far. Anything unrecognisable restarts clean but
// keeps whatever card scheduling can be salvaged.
function migrate(old) {
  const next = freshState();
  if (old && old.cards) {
    Object.values(old.cards).forEach((c) => {
      if (c && c.fr) {
        const id = cardId(c.fr);
        if (next.cards[id]) next.cards[id] = { ...next.cards[id], ...c, id };
      }
    });
  }
  if (old && typeof old.score === 'number') next.score = old.score;
  if (old && old.days) next.days = old.days;
  if (old && old.streak) next.streak = old.streak;
  if (old && old.totals) next.totals = old.totals;
  return next;
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private browsing — the session still works in memory.
  }
}

// ------------------------------------------------------- challenge selection

// The day's challenge: as close as possible to current ability, not seen before,
// and on a different topic from the last few days.
export function selectChallenge(state, challenges, today = dayKey()) {
  if (!challenges || challenges.length === 0) return null;

  const locked = state.served && state.served[today];
  if (locked) {
    const found = challenges.find((c) => c.id === locked);
    if (found) return found;
  }

  const wantTier = tierFor(state.score);
  const rand = mulberry32(hashString(today + '|' + state.score.toFixed(1)));

  // Most recent day each challenge was completed, for the exhausted-bank case.
  const lastSeen = new Map();
  Object.keys(state.days)
    .sort()
    .forEach((k) => lastSeen.set(state.days[k].challengeId, k));

  const recentTopics = new Set();
  Object.keys(state.days)
    .sort()
    .slice(-3)
    .forEach((k) => {
      const ch = challenges.find((c) => c.id === state.days[k].challengeId);
      ((ch && ch.topics) || []).forEach((t) => recentTopics.add(t));
    });

  const unseen = challenges.filter((c) => !lastSeen.has(c.id));
  const pool = unseen.length ? unseen : challenges;

  // blockRecent: refuse anything done in the last fortnight, so a slightly-off
  // difficulty beats replaying what you just did.
  const rank = (ch, blockRecent) => {
    let s = -Math.abs((ch.difficulty || 3) - wantTier) * 10; // difficulty match dominates
    if ((ch.topics || []).some((t) => recentTopics.has(t))) s -= 4; // vary the subject

    // Once every challenge has been done, recency is what separates the
    // candidates: cycle through the whole tier rather than replaying the same
    // two. Weighted above the random jitter on purpose.
    const seen = lastSeen.get(ch.id);
    if (seen) {
      const ago = daysBetween(seen, today);
      s += Math.min(20, ago * 0.7);
      if (blockRecent && ago < 14) s -= 30;
    }
    return s + rand() * 1.5; // break ties without feeling mechanical
  };

  const best = (blockRecent) =>
    pool.slice().sort((a, b) => rank(b, blockRecent) - rank(a, blockRecent))[0];

  const pick = best(true);

  // If avoiding repeats has pushed the pick more than one tier above your level,
  // the bank has run out of content at your level — which happens at the bottom
  // of the range, where there are few easy challenges. Re-running a challenge
  // you have already seen is better for you than being force-fed something too
  // hard, so drop the repeat block in that case.
  if ((pick.difficulty || 3) - wantTier > 1) {
    const relaxed = best(false);
    if ((relaxed.difficulty || 3) < (pick.difficulty || 3)) return relaxed;
  }

  return pick;
}

// True once every challenge in the bank has been completed at least once.
export function bankExhausted(state, challenges) {
  if (!challenges || !challenges.length) return false;
  const doneIds = new Set(Object.values(state.days).map((d) => d.challengeId));
  return challenges.every((c) => doneIds.has(c.id));
}

// Words from the existing deck to fold back into today's session. Prefers cards
// that are both due and topically relevant, so the recycling connects to the
// text instead of looking random.
export function recycleWords(state, challenge, today = dayKey(), limit = 3) {
  const topics = new Set((challenge && challenge.topics) || []);
  const rand = mulberry32(hashString('recycle' + today));
  const rank = (c) => {
    let s = 0;
    if (isDue(c, today)) s += 10;
    if ((c.tags || []).some((t) => topics.has(t))) s += 6;
    if (c.lapses >= 2) s += 4; // leeches need the extra exposure
    if (c.fix) s += 3;
    s -= Math.min(c.streak, 5); // stop parading words you've nailed
    return s + rand() * 2;
  };
  return Object.values(state.cards)
    .map((c) => ({ c, s: rank(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c);
}

// -------------------------------------------------------- spaced repetition

export function isDue(card, today = dayKey()) {
  if (card.dueTime && card.dueTime > Date.now()) return false;
  return daysBetween(card.due, today) >= 0;
}

export function dueCards(state, today = dayKey()) {
  return Object.values(state.cards)
    .filter((c) => isDue(c, today))
    .sort((a, b) => {
      if (!!b.fix !== !!a.fix) return b.fix ? 1 : -1; // corrections first
      const overdue = daysBetween(b.due, today) - daysBetween(a.due, today);
      if (overdue !== 0) return overdue; // then most overdue
      return a.reps - b.reps; // then freshest material
    });
}

const RATINGS = { again: 0, hard: 1, good: 2, easy: 3 };

// SM-2 with the sharp edges filed off: four buttons, clamped ease, and "again"
// re-queues inside the same session instead of tomorrow.
export function gradeCard(state, id, ratingName, today = dayKey()) {
  const card = state.cards[id];
  if (!card) return state;
  const r = RATINGS[ratingName];
  const c = { ...card, reps: card.reps + 1 };

  if (r === 0) {
    c.lapses += 1;
    c.streak = 0;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = today;
    c.dueTime = Date.now() + 5 * 60 * 1000; // back in ~5 minutes
  } else {
    if (c.streak === 0) c.interval = r === 3 ? 2 : 1;
    else if (c.streak === 1) c.interval = r === 1 ? 3 : r === 2 ? 4 : 6;
    else {
      const mult = r === 1 ? 0.7 : r === 3 ? 1.3 : 1;
      c.interval = Math.max(1, Math.round(c.interval * c.ease * mult));
    }
    c.interval = Math.min(c.interval, 365);
    c.ease = Math.min(2.8, Math.max(1.3, c.ease + (r === 1 ? -0.05 : r === 3 ? 0.1 : 0)));
    c.streak += 1;
    c.due = addDays(today, c.interval);
    c.dueTime = null;
  }

  return { ...state, cards: { ...state.cards, [id]: c } };
}

export function addWords(state, words, today = dayKey(), source = 'challenge') {
  const cards = { ...state.cards };
  (words || []).forEach((w) => {
    const id = cardId(w.fr);
    if (cards[id]) return; // already in the deck — don't reset its schedule
    cards[id] = {
      id,
      fr: w.fr,
      en: w.en,
      note: w.note || null,
      fix: null,
      emoji: w.emoji || null,
      tags: w.tags || [],
      source,
      introducedOn: today,
      ease: 2.4,
      interval: 0,
      due: today,
      dueTime: null,
      reps: 0,
      lapses: 0,
      streak: 0,
    };
  });
  return { ...state, cards };
}

export function isMastered(card) {
  return card.interval >= 21 && card.streak >= 3;
}

// ---------------------------------------------------------- completing a day

// Accuracy above the 75% target pushes the score up, below it pushes down, and
// the size of the move scales with how hard the challenge was relative to your
// band.
//
// The scaling has to be asymmetric, which is easy to get wrong. A gain is worth
// more on harder content — acing something above your level is real evidence.
// But a loss is worth LESS on harder content: scoring badly on something above
// your band is the expected outcome, not proof you got worse. Scaling losses up
// with difficulty instead sends the score into a death spiral whenever the bank
// has nothing easier left to serve.
export function nextScore(score, accuracy, difficulty) {
  const gap = (difficulty || 3) - tierFor(score);
  const gaining = accuracy >= 0.75;
  const adj = gaining
    ? Math.min(1.8, Math.max(0.5, 1 + 0.35 * gap))
    : Math.min(1.8, Math.max(0.4, 1 - 0.35 * gap));
  const delta = Math.max(-8, Math.min(8, 10 * (accuracy - 0.75) * adj)) + 0.5;
  return Math.max(0, Math.min(100, Math.round((score + delta) * 10) / 10));
}

export function completeDay(state, result, today = dayKey()) {
  const { challengeId, quizRight, quizTotal, listenSeconds, difficulty, newWords } = result;
  const accuracy = quizTotal > 0 ? quizRight / quizTotal : 0.75;
  const alreadyLogged = !!state.days[today];

  const withWords = addWords(state, newWords, today);
  const score = nextScore(withWords.score, accuracy, difficulty);

  // Streak counts consecutive calendar days; redoing the same day is a no-op.
  const streak = { ...withWords.streak };
  if (streak.last !== today) {
    streak.current = streak.last && daysBetween(streak.last, today) === 1 ? streak.current + 1 : 1;
    streak.longest = Math.max(streak.longest, streak.current);
    streak.last = today;
  }

  return {
    ...withWords,
    score,
    scoreHistory: [...withWords.scoreHistory, { date: today, score }].slice(-400),
    days: {
      ...withWords.days,
      [today]: {
        challengeId,
        difficulty: difficulty || 3,
        quizRight,
        quizTotal,
        listenSeconds: listenSeconds || 0,
        completedAt: new Date().toISOString(),
      },
    },
    streak,
    totals: {
      listenSeconds: withWords.totals.listenSeconds + (listenSeconds || 0),
      quizRight: withWords.totals.quizRight + quizRight,
      quizTotal: withWords.totals.quizTotal + quizTotal,
      sessions: withWords.totals.sessions + (alreadyLogged ? 0 : 1),
    },
  };
}

export function lockServed(state, challengeId, today = dayKey()) {
  if (state.served && state.served[today] === challengeId) return state;
  return { ...state, served: { ...state.served, [today]: challengeId } };
}

// ------------------------------------------------------- free practice

// Practice never runs out. Once the due queue is empty, cards are drawn from the
// whole deck weakest-first, so extra drilling lands on the words you actually
// keep dropping rather than the ones you already own.
//
// `exclude` lets the caller skip what it has already served this session.
export function practiceCards(state, today = dayKey(), limit = 20, exclude = []) {
  const skip = new Set(exclude);
  const rand = mulberry32(hashString('practice' + today + exclude.length));
  const weakness = (c) => {
    let w = 0;
    w += c.lapses * 3; // forgotten often → drill it
    w -= Math.min(c.streak, 6) * 2; // already solid → leave it alone
    w -= Math.min(c.interval, 60) / 12; // long interval means it's settled
    if (c.reps === 0) w += 4; // never actually tested
    if (c.fix) w += 2; // a correction is worth re-reading
    const overdue = daysBetween(c.due, today);
    if (overdue > 0) w += Math.min(overdue, 10) * 0.5;
    return w + rand() * 2.5; // keep the order from feeling fixed
  };
  return Object.values(state.cards)
    .filter((c) => !skip.has(c.id))
    .sort((a, b) => weakness(b) - weakness(a))
    .slice(0, limit);
}

// Grading in free practice deliberately does NOT extend intervals. Getting a card
// right on your fifth extra drill of the day is not evidence you'll remember it in
// three weeks, and letting practice push intervals out would quietly wreck the
// schedule. A miss, though, is real evidence — so it pulls the card back to
// tomorrow and counts as a lapse.
export function practiceGrade(state, id, wasCorrect, today = dayKey()) {
  const card = state.cards[id];
  if (!card) return state;
  const c = { ...card, practiceReps: (card.practiceReps || 0) + 1 };
  if (!wasCorrect) {
    c.lapses += 1;
    c.streak = 0;
    c.ease = Math.max(1.3, c.ease - 0.15);
    // Only ever pull the due date closer, never push it out.
    const tomorrow = addDays(today, 1);
    if (daysBetween(tomorrow, c.due) > 0) {
      c.due = tomorrow;
      c.interval = 1;
    }
    c.dueTime = null;
  }
  return {
    ...state,
    cards: { ...state.cards, [id]: c },
    totals: {
      ...state.totals,
      practiceAnswered: (state.totals.practiceAnswered || 0) + 1,
      practiceRight: (state.totals.practiceRight || 0) + (wasCorrect ? 1 : 0),
    },
  };
}

// ------------------------------------------------------------------- stats

export function deriveStats(state, today = dayKey()) {
  const cards = Object.values(state.cards);
  const dayKeys = Object.keys(state.days).sort();
  const recent = dayKeys.slice(-10).map((k) => state.days[k]);
  const recentRight = recent.reduce((s, d) => s + d.quizRight, 0);
  const recentTotal = recent.reduce((s, d) => s + d.quizTotal, 0);

  // Pace: sessions per week, measured over however long you've been going
  // (capped at 28 days so a strong or weak month ago stops dragging on it).
  const span = dayKeys.length ? Math.min(28, Math.max(7, daysBetween(dayKeys[0], today) + 1)) : 7;
  const inWindow = dayKeys.filter((k) => daysBetween(k, today) <= 28).length;
  const perWeek = Math.round((inWindow / span) * 7 * 10) / 10;

  // Rough ETA to B2: points remaining ÷ average gain per session × pace.
  // Hidden until there's enough history for it to mean anything.
  let etaWeeks = null;
  if (state.scoreHistory.length >= 6 && state.score < B2_THRESHOLD) {
    const from = state.scoreHistory[Math.max(0, state.scoreHistory.length - 15)];
    const sessions = Math.min(15, state.scoreHistory.length) - 1;
    const perSession = (state.score - from.score) / Math.max(1, sessions);
    if (perSession > 0.15 && perWeek > 0) {
      etaWeeks = Math.ceil((B2_THRESHOLD - state.score) / perSession / perWeek);
    }
  }

  return {
    band: bandFor(state.score),
    progressToB2: Math.min(1, state.score / B2_THRESHOLD),
    deckSize: cards.length,
    mastered: cards.filter(isMastered).length,
    learning: cards.filter((c) => c.reps > 0 && !isMastered(c)).length,
    untouched: cards.filter((c) => c.reps === 0).length,
    dueToday: dueCards(state, today).length,
    leeches: cards.filter((c) => c.lapses >= 3).length,
    sessions: state.totals.sessions,
    listenMinutes: Math.round(state.totals.listenSeconds / 60),
    lifetimeAccuracy: state.totals.quizTotal ? state.totals.quizRight / state.totals.quizTotal : null,
    recentAccuracy: recentTotal ? recentRight / recentTotal : null,
    streak: state.streak,
    streakAtRisk: !!state.streak.last && daysBetween(state.streak.last, today) === 1,
    doneToday: !!state.days[today],
    perWeek,
    etaWeeks,
    dayKeys,
    practiceAnswered: state.totals.practiceAnswered || 0,
    practiceAccuracy: state.totals.practiceAnswered
      ? (state.totals.practiceRight || 0) / state.totals.practiceAnswered
      : null,
  };
}

// 7-row × `weeks`-column grid for the activity heatmap, Monday-first.
export function heatmap(state, weeks = 14, today = dayKey()) {
  const [y, m, d] = today.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const shift = (end.getDay() + 6) % 7; // Monday = 0
  const monday = new Date(y, m - 1, d - shift);
  const cols = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - w * 7 + i);
      const key = dayKey(dt);
      const rec = state.days[key];
      col.push({
        key,
        future: daysBetween(key, today) < 0,
        done: !!rec,
        accuracy: rec && rec.quizTotal ? rec.quizRight / rec.quizTotal : null,
      });
    }
    cols.push(col);
  }
  return cols;
}
