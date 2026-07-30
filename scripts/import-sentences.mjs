// Builds public/content/sentences.json — the gap-fill sentence bank that makes
// free practice effectively unlimited.
//
// Why a bank at all: the reading passages only produce a usable gap-fill for
// about a third of the deck, because a word has to actually appear in one of the
// 30 texts. The bank covers most of the rest, with several sentences per word so
// a card coming back around isn't the identical question.
//
// Source is the Tatoeba corpus — a community sentence collection with human
// translations, released CC-BY 2.0 FR (a few older sentences are CC0). It is the
// only large FR→EN sentence set that is both freely licensed and actually written
// by people rather than machine-translated.
//
// The bank is NOT built from every French sentence in existence: it is filtered
// down to sentences containing a word this app can already teach, which is what
// keeps it a few hundred KB instead of a few hundred MB, and what makes every
// sentence in it useful rather than merely French.
//
// Run:
//   node scripts/import-sentences.mjs                      # downloads the pairs
//   node scripts/import-sentences.mjs --file fra.txt       # use a local copy
//   node scripts/import-sentences.mjs --per-word 4
//
// This needs network access. If your environment proxies or blocks it, run the
// "Rebuild sentence bank" GitHub Action instead — it runs this script on a
// runner and commits the result.

import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import seedVocab from '../src/seedVocab.js';
import lexicon from '../src/data/lexicon.js';
import { stripArticleForm } from '../src/lib/forms.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(root, 'public', 'content');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const PER_WORD = Number(arg('--per-word', 3));
// A real corpus run should cover most of the target vocabulary; anything far
// below that means the source file didn't parse. Lowered for fixture runs.
const MIN_COVERAGE = Number(arg('--min-coverage', 0.4));
const OUT = arg('--out', join(contentDir, 'sentences.json'));
const LOCAL = arg('--file', null);

// The Anki-format export of the Tatoeba FR-EN pairs: one zip, tab-delimited
// "english<TAB>french<TAB>attribution". Pairing sentences from Tatoeba's own
// per-language exports would mean downloading the whole links table (>100 MB) and
// joining it; this is the same data, already joined.
const PAIRS_URL = 'https://www.manythings.org/anki/fra-eng.zip';

// ---------------------------------------------------------------- vocabulary

// Every word the app can teach: the seed deck, the built-in lexicon (which is
// also the set of words tap-to-translate can add to your deck), and the new words
// from each content pack.
function candidateWords() {
  const words = new Set();
  const add = (raw) => {
    const w = stripArticleForm(String(raw || '')).toLowerCase();
    // Single words only — multi-word and grammar-pattern cards don't blank
    // cleanly into a gap.
    if (!w || /[\s+/]/.test(w)) return;
    if (w.length < 4) return; // "eau" in a gap is a guess, not a test
    if (STOP.has(w)) return; // a gap-fill on "dans" teaches nothing
    words.add(w);
  };

  seedVocab.forEach((v) => add(v.fr));
  Object.keys(lexicon).forEach(add);

  const read = (f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8'));
  read('index.json').packs.forEach((f) => {
    (read(f).challenges || []).forEach((c) => {
      (c.newWords || []).forEach((w) => add(w.fr));
      ((c.reading && c.reading.glossary) || []).forEach((g) => add(g.fr));
    });
  });

  return [...words];
}

// Function words. Frequent enough to appear in every sentence and useless as a
// gap — four options that are all grammatically possible is not a test.
const STOP = new Set(
  `avec dans pour sans sous mais donc alors quand comme très plus moins aussi
   bien encore toujours jamais quelque quelques cette celui celle ceux elles
   nous vous ils lui leur mon ton son notre votre leurs quel quelle chaque
   tout tous toute toutes autre autres même mêmes puis ainsi cela ceci
   parce depuis pendant avant après entre chez vers selon malgré
   être avoir faire aller venir pouvoir vouloir devoir dire voir savoir
   suis sommes sont était étaient serai seront
   quoi dont laquelle lequel
   monsieur madame`
    .split(/\s+/)
    .filter(Boolean)
);

// The surface forms a lemma plausibly takes in running text. Enumerating them
// lets the scan be a set lookup per token instead of ~600 regexes per sentence —
// the difference between seconds and an afternoon.
//
// Returns { safe, risky }. The split matters: for an -er verb, the bare -e and
// -es endings are exactly where homographs live. "porter" generates "porte",
// which is overwhelmingly the door; "prêter" generates "prête", which is almost
// always the adjective "ready". Those forms are still worth having when nothing
// else turns up, but they must never outrank an unambiguous "-é" or "-ez".
function expandForms(lemma) {
  const safe = new Set([lemma]);
  const risky = new Set([lemma + 's']);
  if (lemma.length > 3) {
    if (lemma.endsWith('er')) {
      const s = lemma.slice(0, -2);
      ['er', 'ez', 'ons', 'ent', 'ées', 'ée', 'és', 'é', 'aient', 'ait', 'ais'].forEach((suf) =>
        safe.add(s + suf)
      );
      risky.add(s + 'e');
      risky.add(s + 'es');
    } else if (lemma.endsWith('ir')) {
      const s = lemma.slice(0, -2);
      ['ir', 'issent', 'issait', 'it', 'is', 'i'].forEach((suf) => safe.add(s + suf));
      ['ent', 's', 'e'].forEach((suf) => risky.add(s + suf));
    } else if (lemma.endsWith('re')) {
      const s = lemma.slice(0, -2);
      ['re', 'ent', 'ait', 'aient', 'u', 'us'].forEach((suf) => safe.add(s + suf));
      risky.add(s + 'e');
      risky.add(s + 'es');
    } else if (lemma.endsWith('eux')) {
      safe.add(lemma.slice(0, -3) + 'euse');
      safe.add(lemma.slice(0, -3) + 'euses');
    } else if (lemma.endsWith('f')) {
      safe.add(lemma.slice(0, -1) + 've');
      safe.add(lemma.slice(0, -1) + 'ves');
    } else if (!lemma.endsWith('e')) {
      risky.add(lemma + 'e');
      risky.add(lemma + 'es');
    }
  }
  return { safe: [...safe], risky: [...risky] };
}

// ------------------------------------------------------------------- fetching

async function downloadPairs() {
  const dir = join(tmpdir(), 'fr-b2-sentences');
  mkdirSync(dir, { recursive: true });
  const zip = join(dir, 'fra-eng.zip');

  if (!existsSync(zip)) {
    process.stderr.write(`downloading ${PAIRS_URL}\n`);
    const res = await fetch(PAIRS_URL, {
      headers: {
        // Served from a plain Apache host that 403s an empty user agent.
        'User-Agent': 'Mozilla/5.0 (parcours-b2 sentence importer)',
        Accept: '*/*',
      },
    });
    if (!res.ok) throw new Error(`${PAIRS_URL} → HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
  }

  // unzip is present on every GitHub runner and every mac; shelling out beats
  // pulling in a zip library for one file.
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir], { stdio: 'inherit' });
  const tsv = join(dir, 'fra.txt');
  if (!existsSync(tsv)) throw new Error(`expected fra.txt inside ${zip}`);
  return tsv;
}

// ------------------------------------------------------------------- filtering

// A sentence has to be worth reading on a phone and worth answering. Long enough
// that the gap has context, short enough not to be a paragraph, and free of the
// things that read as corpus noise rather than French.
function usable(fr, en) {
  if (fr.length < 25 || fr.length > 130) return false;
  if (en.length < 10 || en.length > 160) return false;
  if (!/[.!?…»]$/.test(fr)) return false;
  if (/\d/.test(fr)) return false; // "Il a 3 ans" — numerals read as data entry
  if (/[<>@#_*\\|{}[\]]/.test(fr)) return false;
  if ((fr.match(/"/g) || []).length === 1) return false; // truncated quote
  if (!/^[\p{Lu}«"]/u.test(fr)) return false; // fragments mid-sentence
  return true;
}

// Two sentences for the same word should differ from each other, not just from
// the passage. Prefer natural length, a proper name-free subject, and a
// translation that isn't obviously a paraphrase.
function score(fr, en) {
  let s = 0;
  const len = fr.length;
  s += len >= 40 && len <= 95 ? 3 : 0; // the sweet spot on a phone screen
  if (/\b(Tom|Mary|Marie|Bob|John)\b/.test(fr)) s -= 2; // Tatoeba's placeholder cast
  if (/[,;:]/.test(fr)) s += 1; // a clause boundary means real syntax
  const ratio = en.length / len;
  if (ratio > 0.6 && ratio < 1.5) s += 1;
  if (/[«»"]/.test(fr)) s -= 1;
  return s;
}

// Unambiguous matches always outrank risky ones — that's what makes the bare
// "-e" forms a genuine last resort rather than just a lower-priority claim.
// "prêter" matching "prête" (the adjective, "ready") is the case this catches:
// the sentence stays available, but any real "prêté" sentence wins first.
function bySafeThenScore(a, b) {
  if (a.safe !== b.safe) return a.safe ? -1 : 1;
  return b.sc - a.sc;
}

// ----------------------------------------------------------------------- main

async function main() {
  const words = candidateWords();
  const isHeadword = new Set(words);
  const formToLemma = new Map();
  const risk = new Set();

  const claim = (form, lemma, risky) => {
    // A generated form that is itself one of our target words is a homograph,
    // not an inflection: "porter" generates "porte", and "porte" is its own
    // entry meaning door. Mapping it to the verb would blank the wrong word in
    // a real sentence, which reads as a bug rather than an exercise.
    if (isHeadword.has(form) && form !== lemma) return;
    const prev = formToLemma.get(form);
    // Prefer an unambiguous claim over a risky one; otherwise the shorter lemma,
    // which is the likelier root and the less likely accident of the rules.
    if (prev && !(risk.has(form) && !risky) && !(lemma.length < prev.length)) return;
    formToLemma.set(form, lemma);
    if (risky) risk.add(form);
    else risk.delete(form);
  };

  // Two passes so every unambiguous form is claimed before any risky one gets
  // a look in — within a single pass the iteration order would decide it.
  const expanded = words.map((w) => [w, expandForms(w)]);
  expanded.forEach(([lemma, f]) => f.safe.forEach((x) => claim(x, lemma, false)));
  expanded.forEach(([lemma, f]) => f.risky.forEach((x) => claim(x, lemma, true)));

  process.stderr.write(
    `${words.length} target words, ${formToLemma.size} surface forms ` +
      `(${risk.size} ambiguous, kept as last resort)\n`
  );

  const tsv = LOCAL || (await downloadPairs());
  const lines = readFileSync(tsv, 'utf8').split('\n');
  process.stderr.write(`${lines.length} pairs in ${tsv}\n`);

  // Best few sentences per word, kept as a small sorted list rather than sorting
  // the whole corpus per word at the end.
  const best = new Map();
  const KEEP = PER_WORD * 3; // shortlist, trimmed after de-duplication
  let scanned = 0;

  for (const line of lines) {
    const [en, fr] = line.split('\t');
    if (!fr || !en) continue;
    if (!usable(fr, en)) continue;
    scanned++;

    const sc = score(fr, en);
    // lemma → was this match via an unambiguous form? A sentence that only
    // matched through a risky form is kept, but ranked below every safe one.
    const hit = new Map();
    const re = /[\p{L}][\p{L}’'-]*/gu;
    let m;
    while ((m = re.exec(fr)) !== null) {
      const form = m[0].toLowerCase();
      const lemma = formToLemma.get(form);
      if (!lemma) continue;
      const safe = !risk.has(form);
      if (safe || !hit.has(lemma)) hit.set(lemma, safe || hit.get(lemma) === true);
    }
    // A sentence carrying five target words is a vocabulary quiz, not a gap-fill;
    // it also means the gap is guessable from the rest. Keep it focused.
    if (hit.size === 0 || hit.size > 4) continue;

    for (const [lemma, safe] of hit) {
      const arr = best.get(lemma) || [];
      arr.push({ fr, en, sc, safe });
      if (arr.length > KEEP * 2) {
        arr.sort(bySafeThenScore);
        arr.length = KEEP;
      }
      best.set(lemma, arr);
    }
  }

  // Flatten: one shared sentence array, per-word index into it, so a sentence
  // that serves three words is stored once.
  const sentences = [];
  const seen = new Map();
  const byWord = {};
  let covered = 0;

  [...best.keys()].sort().forEach((lemma) => {
    const arr = best.get(lemma).sort(bySafeThenScore);
    const picked = [];
    for (const s of arr) {
      // Two dedup keys, because Tatoeba's duplicates come in two shapes.
      // Punctuation variants ("Il a dépensé tout." / "…tout !") differ only in
      // symbols. Politeness variants ("Grâce à toi, …" / "Grâce à vous, …") are
      // different French but the *same exercise* — and they give themselves away
      // by sharing an identical English translation.
      const key = s.fr.toLowerCase().replace(/[^\p{L} ]/gu, '');
      const enKey = s.en.toLowerCase().replace(/[^\p{L} ]/gu, '');
      if (picked.some((p) => p.key === key || p.enKey === enKey)) continue;
      picked.push({ ...s, key, enKey });
      if (picked.length === PER_WORD) break;
    }
    if (!picked.length) return;
    covered++;
    byWord[lemma] = picked.map((s) => {
      let i = seen.get(s.fr);
      if (i === undefined) {
        i = sentences.length;
        sentences.push([s.fr, s.en]);
        seen.set(s.fr, i);
      }
      return i;
    });
  });

  const out = {
    source: 'Tatoeba (tatoeba.org), FR-EN pairs via manythings.org/anki',
    license: 'CC-BY 2.0 FR — some sentences CC0. See tatoeba.org/downloads',
    generated: new Date().toISOString().slice(0, 10),
    words: covered,
    sentenceCount: sentences.length,
    sentences,
    byWord,
  };

  writeFileSync(OUT, JSON.stringify(out));
  const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
  process.stderr.write(
    `\n${scanned} usable pairs scanned\n` +
      `${covered} of ${words.length} target words covered ` +
      `(${Math.round((covered / words.length) * 100)}%)\n` +
      `${sentences.length} sentences, ${kb} KB → ${OUT}\n`
  );
  if (covered / words.length < MIN_COVERAGE) {
    process.stderr.write(
      `\nCoverage below ${Math.round(MIN_COVERAGE * 100)}% — check the source file parsed correctly.\n`
    );
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`\n${e.message}\n`);
  process.exit(1);
});
