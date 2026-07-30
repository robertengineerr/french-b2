// Builds the different question shapes a flashcard review can take.
//
// The classic two-sided card is still here (it's the best test of free recall),
// but on its own it gets monotonous and it only ever tests recognition in one
// direction. These variants come from the same card data plus two derived
// sources: emoji on concrete cards, and real sentences mined from the reading
// passages you've already worked through.

import { stripArticleForm } from './forms.js';

export const TYPES = {
  reveal: 'reveal', // two-sided card, you rate yourself
  meaning: 'meaning', // FR → pick the English
  reverse: 'reverse', // EN → pick the French
  picture: 'picture', // pictogram → pick the French
  cloze: 'cloze', // sentence with a gap → pick the word that fits
  listen: 'listen', // hear it → pick the English
  type: 'type', // EN → type the French
};

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Indexes one usable sentence per card from the reading passages. A gap filled
// from text you've actually read is a far better test than an invented sentence,
// and it costs no extra content.
export function buildClozeIndex(challenges, cards) {
  const sentences = [];
  (challenges || []).forEach((c) => {
    (c.reading?.paragraphs || []).forEach((p) => {
      p.split(/(?<=[.!?…])\s+/).forEach((s) => {
        const t = s.trim();
        // Long enough to give context, short enough to read on a phone.
        if (t.length >= 40 && t.length <= 190) sentences.push(t);
      });
    });
  });

  const index = new Map();
  cards.forEach((card) => {
    const target = stripArticleForm(card.fr);
    // Multi-word and grammar-pattern cards don't blank cleanly.
    if (!target || target.includes(' ') || target.includes('+')) return;
    const re = inflectedPattern(target);
    for (const s of sentences) {
      const m = re.exec(s);
      if (m) {
        index.set(card.id, { sentence: s, start: m.index, end: m.index + m[0].length, form: m[0] });
        break;
      }
    }
  });
  return index;
}

// Passages use inflected forms, cards store lemmas — "dépenser" on the card,
// "dépense" in the text. Matching the lemma literally found barely half the
// candidates, so allow the endings that actually occur. Over-matching is
// harmless here: a near-miss still produces a usable gap in a real sentence.
function inflectedPattern(target) {
  const t = escapeRe(target);
  let body = `${t}s?`;
  if (target.length > 3) {
    if (target.endsWith('er')) {
      const stem = escapeRe(target.slice(0, -2));
      body = `${stem}(?:er|ez|ons|ent|es|e|ées|ée|és|é|aient|ait|ais)`;
    } else if (target.endsWith('ir')) {
      const stem = escapeRe(target.slice(0, -2));
      body = `${stem}(?:ir|issent|issait|it|is|i|ent|s|e)`;
    } else if (target.endsWith('re')) {
      const stem = escapeRe(target.slice(0, -2));
      body = `${stem}(?:re|ent|es|e|ait|aient|u|us)`;
    }
  }
  return new RegExp(`(?<![\\p{L}])${body}(?![\\p{L}])`, 'iu');
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Distractors are drawn from the same topic tag where possible. A wrong option
// from an unrelated topic is a free point; one from the same topic is a real test.
function distractors(card, pool, key, n = 3) {
  const seen = new Set([String(card[key])]);
  const sameTag = [];
  const rest = [];
  pool.forEach((c) => {
    if (c.id === card.id || !c[key]) return;
    const v = String(c[key]);
    if (seen.has(v)) return;
    ((c.tags || []).some((t) => (card.tags || []).includes(t)) ? sameTag : rest).push(c);
  });

  const rand = mulberry(hash(card.id + key + card.reps));
  const shuffle = (arr) => arr.slice().sort(() => rand() - 0.5);
  const picked = [];
  for (const c of [...shuffle(sameTag), ...shuffle(rest)]) {
    const v = String(c[key]);
    if (seen.has(v)) continue;
    seen.add(v);
    picked.push(c);
    if (picked.length === n) break;
  }
  return picked;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which shapes this card can support right now, ordered easiest-recognition to
// hardest-production. A card only becomes eligible for `type` once you've
// actually recalled it a few times — asking for production on a brand-new word
// is just a guaranteed miss.
function eligible(card, { pool, cloze, canSpeak }) {
  const out = [];
  const enoughPool = pool.length >= 4;

  if (enoughPool) out.push(TYPES.meaning);
  if (enoughPool && card.emoji) out.push(TYPES.picture);
  if (enoughPool && canSpeak) out.push(TYPES.listen);
  if (enoughPool) out.push(TYPES.reverse);
  if (cloze.has(card.id) && enoughPool) out.push(TYPES.cloze);
  out.push(TYPES.reveal);
  if (card.streak >= 2 && !card.fr.includes('+')) out.push(TYPES.type);

  return out;
}

// Picks the shape for this particular showing. Deterministic in the card's rep
// count, so re-rendering doesn't reshuffle the question under you, but it rotates
// as the card comes back around.
export function chooseExercise(card, ctx) {
  // A card carrying a correction always shows both sides — the whole point is to
  // read the correction, not to guess between four options.
  if (card.fix) return TYPES.reveal;

  const options = eligible(card, ctx);
  if (!options.length) return TYPES.reveal;

  // A brand-new card should be recognised before it's produced — but "recognition
  // only" doesn't have to mean "the same question every time". Rotate among the
  // recognition shapes on the first showing and keep production (typing, cloze)
  // behind a couple of successful recalls.
  const RECOGNITION = [TYPES.meaning, TYPES.picture, TYPES.listen, TYPES.reveal];
  if (card.reps === 0) {
    const easy = options.filter((o) => RECOGNITION.includes(o));
    const from = easy.length ? easy : options;
    return from[hash(card.id) % from.length];
  }
  const i = (card.reps + hash(card.id)) % options.length;
  return options[i];
}

// Assembles the concrete question for a card: prompt, options, correct index.
export function buildQuestion(card, ctx) {
  const type = ctx.forceType || chooseExercise(card, ctx);
  const { pool, cloze } = ctx;
  const rand = mulberry(hash(card.id + type + card.reps));
  const place = (correct, others) => {
    const all = [...others, correct].sort(() => rand() - 0.5);
    return { options: all, answer: all.indexOf(correct) };
  };

  if (type === TYPES.meaning || type === TYPES.listen) {
    const others = distractors(card, pool, 'en').map((c) => c.en);
    const { options, answer } = place(card.en, others);
    return { type, prompt: card.fr, options, answer };
  }

  if (type === TYPES.reverse) {
    const others = distractors(card, pool, 'fr').map((c) => c.fr);
    const { options, answer } = place(card.fr, others);
    return { type, prompt: card.en, options, answer };
  }

  if (type === TYPES.picture) {
    const others = distractors(card, pool, 'fr').map((c) => c.fr);
    const { options, answer } = place(card.fr, others);
    return { type, prompt: card.emoji, options, answer };
  }

  if (type === TYPES.cloze) {
    const c = cloze.get(card.id);
    if (!c) return buildQuestion(card, { ...ctx, forceType: TYPES.reveal });
    // Only single-word distractors here — "cher / chère" or "au moindre prix"
    // dropped into a gap reads as a formatting bug rather than a wrong answer.
    const singleWord = pool.filter((x) => {
      const f = stripArticleForm(x.fr);
      return f && !f.includes(' ') && !f.includes('/') && !f.includes('+');
    });
    const others = distractors(card, singleWord, 'fr').map((x) => stripArticleForm(x.fr));
    if (others.length < 2) return buildQuestion(card, { ...ctx, forceType: TYPES.reveal });
    const { options, answer } = place(c.form, others);
    return {
      type,
      prompt: c.sentence.slice(0, c.start) + ' _____ ' + c.sentence.slice(c.end),
      options,
      answer,
      hint: card.en,
    };
  }

  if (type === TYPES.type) {
    return { type, prompt: card.en, expected: card.fr };
  }

  return { type: TYPES.reveal, prompt: card.fr };
}

// Typed answers are checked forgivingly: accents, case, punctuation and a leading
// article are all ignored. Getting «economiser» instead of «économiser» is a
// keyboard problem, not a vocabulary problem — the card back shows the correct
// spelling either way.
export function checkTyped(input, expected) {
  const strip = (s) =>
    stripArticleForm(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .toLowerCase();
  const a = strip(input);
  if (!a) return false;
  // Accept any side of a "cher / chère" style pair.
  return expected
    .split('/')
    .map(strip)
    .some((e) => e === a);
}
