// Word lookup for the reading pane: tap a word, get a gloss, optionally add it
// to the flashcard deck.
//
// There is no morphological analyser here and there shouldn't be — a real French
// lemmatiser is a dependency and a download. Instead: normalise the token, try a
// short list of plausible base forms, and search four sources in order of how
// specific they are to what you're reading. Misses are expected and handled in
// the UI (you can still add the word with your own note).

// Explicit extension so this module can also be imported straight into Node by
// scripts/check-lookup.mjs, not just bundled by Vite.
import lexicon from '../data/lexicon.js';

// Typographic and straight apostrophes are interchangeable for lookup.
export function normalize(word) {
  return String(word).toLowerCase().replace(/[’‘]/g, "'").trim();
}

const ELISIONS = ["l'", "d'", "j'", "n'", "c'", "s'", "t'", "m'", "qu'", "jusqu'", "lorsqu'", "puisqu'"];

// Candidate base forms, most likely first. Deliberately over-generates — a wrong
// candidate simply fails to match anything.
function candidates(word) {
  const out = [word];
  // Single letters count: "a" (avoir) and "y" are real words, and they're what's
  // left after stripping the elision from "m'a" or "il y a".
  const push = (w) => {
    if (w && !out.includes(w)) out.push(w);
  };

  // "l'école" → also try "école"; "n'est" → also try "est"
  for (const p of ELISIONS) {
    if (word.startsWith(p)) push(word.slice(p.length));
  }

  // Hyphenated compounds: "vingt-cinq", "eux-mêmes", "dix-huit". Try the whole
  // form first (it may be a lexicon entry in its own right), then each half.
  if (word.includes('-')) word.split('-').forEach(push);

  const bare = out[out.length - 1];
  const stems = [word, bare];

  for (const s of stems) {
    // plural / feminine
    if (s.endsWith('s') || s.endsWith('x')) push(s.slice(0, -1));
    if (s.endsWith('es')) push(s.slice(0, -2));
    if (s.endsWith('ée')) push(s.slice(0, -1));
    if (s.endsWith('euse')) push(s.slice(0, -4) + 'eux');
    if (s.endsWith('ère')) push(s.slice(0, -3) + 'er');
    if (s.endsWith('ive')) push(s.slice(0, -3) + 'if');
    if (s.endsWith('elle')) push(s.slice(0, -4) + 'el');
    if (s.endsWith('e')) push(s.slice(0, -1));

    // verb endings → guess the infinitive
    const er = (stem) => push(stem + 'er');
    const ir = (stem) => push(stem + 'ir');
    const re = (stem) => push(stem + 're');
    for (const [end, fn] of [
      ['aient', er],
      ['erait', er],
      ['eront', er],
      ['ions', er],
      ['iez', er],
      ['ait', er],
      ['ais', er],
      ['ent', er],
      ['ons', er],
      ['ez', er],
      // Bare -e / -es: "existe" → exister, "prépares" → préparer. Last because
      // it is the loosest rule and would otherwise shadow better matches.
      ['es', er],
      ['e', er],
      ['ées', er],
      ['ée', er],
      ['és', er],
      ['é', er],
      ['issent', ir],
      ['issait', ir],
      ['it', ir],
      ['is', ir],
      ['i', ir],
      ['us', re],
      ['u', re],
    ]) {
      if (s.endsWith(end) && s.length > end.length + 1) fn(s.slice(0, -end.length));
    }
  }

  return out;
}

// Strips a leading article so "le loyer" is findable by tapping "loyer".
function stripArticle(fr) {
  return normalize(fr).replace(/^(le |la |les |l'|un |une |des |du |de la |au |aux )/, '');
}

// Builds a single searchable index for one reading session. Sources are ranked:
// today's new words and glossary are the most contextually correct, then your own
// deck (which carries your notes and corrections), then the generic lexicon.
export function buildIndex({ newWords = [], glossary = [], cards = [] }) {
  const index = new Map();

  const add = (key, entry) => {
    const k = normalize(key);
    if (!k) return;
    if (!index.has(k)) index.set(k, entry);
  };

  newWords.forEach((w) => {
    const entry = { fr: w.fr, en: w.en, note: w.note || null, source: 'today' };
    add(w.fr, entry);
    add(stripArticle(w.fr), entry);
  });

  glossary.forEach((g) => {
    const entry = { fr: g.fr, en: g.en, note: null, source: 'glossary' };
    add(g.fr, entry);
    add(stripArticle(g.fr), entry);
  });

  cards.forEach((c) => {
    const entry = { fr: c.fr, en: c.en, note: c.fix || c.note || null, source: 'deck', cardId: c.id };
    add(c.fr, entry);
    add(stripArticle(c.fr), entry);
    // "cher / chère" and "peuplé / bondé" are stored as pairs — index each side.
    if (c.fr.includes('/')) {
      c.fr.split('/').forEach((part) => {
        add(part, entry);
        add(stripArticle(part), entry);
      });
    }
  });

  // Multi-word entries ("grâce à", "faire la grasse matinée") should also be
  // reachable by tapping their first distinctive word. Registered after the exact
  // forms so a single-word entry always wins, and before the lexicon so your own
  // note beats the generic gloss.
  //
  // These are flagged `head: true` and keep their real source. Both matter: a
  // head match is approximate (tapping "soit" is not the same as knowing
  // "soit … soit"), so the reading pane must not present it as a word you own.
  const heads = [
    ...newWords.map((w) => [w, 'today']),
    ...glossary.map((g) => [g, 'glossary']),
    ...cards.map((c) => [c, 'deck']),
  ];
  heads.forEach(([e, source]) => {
    const full = stripArticle(e.fr);
    const head = full.split(/[\s/…]+/)[0];
    if (head && head.length > 2 && head !== full) {
      add(head, {
        fr: e.fr,
        en: e.en,
        note: e.fix || e.note || null,
        source,
        cardId: e.id,
        head: true,
      });
    }
  });

  Object.keys(lexicon).forEach((k) => add(k, { fr: k, en: lexicon[k], note: null, source: 'lexicon' }));

  return index;
}

// Returns the best entry for a tapped token, plus which candidate form matched
// (so the UI can say "shown for: économiser" when you tapped "économisé").
export function lookup(token, index) {
  const word = normalize(token);
  if (!word) return null;
  for (const c of candidates(word)) {
    const hit = index.get(c);
    if (hit) return { ...hit, matched: c, exact: c === word };
  }
  return null;
}
