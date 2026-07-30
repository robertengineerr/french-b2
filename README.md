# Parcours B2

An adaptive daily French trainer, built for one specific job: getting from **B1 to B2**.
It runs as an installable web app on the iPhone home screen — no App Store, no account,
no server, no API keys. Everything works offline once loaded.

Every day it serves one challenge:

1. **2–5 new words** that are actually useful, plus up to 3 words pulled back out of your
   own deck because they're due or they fit the topic.
2. **A short read** — three paragraphs, 140–320 words. Never a whole story. **Every word is
   tappable**: a sheet slides up with the translation, the base form if you tapped an
   inflection, and a one-tap *add to deck*. Words already in your deck are underlined so you
   can see your own vocabulary turning up in real text.
3. **A 1–2 minute listen** — a dialogue or podcast extract, spoken on-device, with speed
   control from 0.7× to 1.15× and three caption modes: nothing at all (listen blind),
   **word-by-word** karaoke captions that light up each word as it's spoken, or the full
   transcript with the current word marked in place and per-line replay.
4. **A grammar point** drawn from the day's text.
5. **A 4–5 question quiz** — comprehension, a gap-fill on the day's grammar, and one open
   written answer you compare against a model and grade yourself.

Finishing it adds the new words to your spaced-repetition deck, updates your level
estimate, and extends your streak.

## What "adaptive" means here concretely

There is no LLM call at runtime — that would need a server and a key on your phone.
Adaptation is real, it just comes from selection rather than generation:

- **A level score, 0–100.** Starts at 38 (B1.2). After each quiz it moves by
  `10 × (accuracy − 0.75)`, scaled by how hard that challenge was relative to your current
  band, capped at ±8 per day. Acing something above your level moves you more than acing
  something below it.
- **The score picks tomorrow's challenge.** Content is tagged difficulty 1–5 (B1.1 → B2.2).
  The engine takes the closest unseen match, then prefers a topic you haven't seen in the
  last three days. The target is **75–85% accuracy** — consistently above that and it
  climbs, below and it drops back.
- **Vocabulary is SM-2-style.** A success multiplies the interval by the card's ease
  factor; a lapse resets it and knocks the ease down. "Encore" re-queues the card five
  minutes later, inside the same session.
- **Reviews come in seven shapes**, not one — pick the meaning, pick the French, pick from a
  pictogram, fill the gap in a sentence, hear it and pick the meaning, type it from the
  English, or the classic two-sided card you rate yourself. Which shape you get depends on
  how well you know the card: recognition while it's new, production (typing, gap-fill) only
  after you've recalled it a few times. Cards carrying a correction always show both sides —
  the point is to read the correction, not to guess between four options.
- **Recycling is targeted, not random.** The words folded back into each day are ranked by
  whether they're due, whether their tags match the day's topic, and whether they're
  leeches you keep forgetting.

Your starting deck is built from your own vocabulary lists — the CSV plus the handwritten
notes. Where a note had an error, the card shows the correction and gets scheduled first:

| Your note | Correction |
|---|---|
| prêter — to borrow | **prêter = to lend.** To borrow is *emprunter*. |
| c'est pourquoi — that's because | **that's why.** For "because of", *à cause de*. |
| franchement — actually | **frankly / honestly.** For "actually", *en fait*. |
| surtout — specially | **especially / above all.** |
| ça fait du sens | Calque from English — natives say **ça a du sens**. |

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # -> dist/
npm run check:content  # validate the content packs
npm run simulate       # 60-day simulation of the adaptive loop
npm run check:lookup   # tap-to-translate coverage over the reading content
npm run icons          # regenerate the app icons
```

`npm run simulate` is the useful one if you ever touch `engine.js`. It runs three
synthetic learners — strong, struggling, and steadily improving — through 60 days and
asserts the loop behaves: the strong one crosses into B2 and gets harder content, the
struggling one gets easier content without the score collapsing, and the improving one
stays near the 75–85% target band.

## Getting it on your iPhone

The app is static — `dist/` can be hosted anywhere with HTTPS.

**Via GitHub Pages** (already wired up): in the repo's Settings → Pages, set Source to
**GitHub Actions**. Push to `main` and `.github/workflows/deploy.yml` builds and publishes
to `https://<user>.github.io/french-b2/`.

Then, on the phone:

1. Open the URL in **Safari** — Chrome on iOS can't add to the home screen.
2. Share button → **Add to Home Screen** → Add.
3. Open it from the icon. It runs full screen and works offline.

**French voices.** iOS ships good ones but may not have one installed. If the player says
no voice was found: Settings → Accessibility → Spoken Content → Voices → French, and
download Thomas or Audrey. Pick your preferred voice in the app's Réglages tab. Local
voices work offline; two different voices are used to separate speakers in a dialogue.

## Daily reminders

iOS does not let a web app schedule a notification for a fixed time — web push needs a
push server plus something awake to fire it. So Réglages generates a **repeating calendar
event with an alarm** (`.ics`): pick a time, download, open, "Add All". It fires daily,
works offline, survives reinstalling the app, and you can change the time in Calendar
without touching the code.

## Adding more content

30 challenges ship in `public/content/` — roughly a month. After that the engine keeps
serving level-appropriate repeats, but new material is better.

Content is plain JSON, loaded at runtime, so adding a pack needs no code change:

1. Write `public/content/core-04.json` following `public/content/SCHEMA.md`.
2. Add `"core-04.json"` to `public/content/index.json`.
3. `npm run check:content`, then commit and push.

`SCHEMA.md` includes a ready-made generation prompt that produces a valid pack in one shot,
along with the rules that matter (difficulty honesty, one open question per challenge,
0-based answer indices).

## Your data

Everything lives in this device's `localStorage` under `fr-b2-state-v1`. Nothing is sent
anywhere — which also means clearing Safari's data would wipe it. Réglages has
**Export** / **Import** as JSON; use it before switching phones.

## Layout

```
public/
  content/          challenge packs + schema and generation prompt
  icons/            generated by scripts/make-icons.py
  manifest.webmanifest
  sw.js             offline cache (network-first for content, cache-first for assets)
src/
  engine.js         level model, challenge selection, SM-2, streaks, stats
  seedVocab.js      your vocabulary, with corrections flagged and emoji on concrete cards
  data/lexicon.js   high-frequency FR→EN glosses for tap-to-translate
  lib/tts.js        Web Speech API wrapper, Safari workarounds, word-boundary tracking
  lib/lookup.js     word lookup: normalise, guess base forms, search four sources
  lib/exercises.js  the seven review shapes, cloze mining, forgiving typed answers
  lib/forms.js      shared "word without its article" helper
  lib/ics.js        calendar reminder generation
  components/       Today, Reading, Player, Flashcards, Stats, Settings
scripts/
  check-content.mjs content validation
  check-lookup.mjs  tap-to-translate coverage + which words to add next
  simulate.mjs      60-day adaptive-loop simulation
  make-icons.py     PNG icon generation, no dependencies
```

## How the derived features work

Three things are generated from the content rather than authored, which is why they cost
nothing to maintain:

- **Gap-fill sentences** are mined from the reading passages you've already worked through —
  a real sentence with the word blanked, not an invented one. Matching tolerates inflection
  (the card says *dépenser*, the passage says *dépense*), so 33 of the single-word cards
  currently have a sentence. Cards without one simply get a different exercise shape.
- **Tap-to-translate** searches, in order: today's new words → the passage's own glossary →
  your deck → a 727-entry built-in lexicon of high-frequency French. That resolves **~85% of
  the words** in the shipped passages (`npm run check:lookup` measures it). It is not a
  general dictionary — a real one is several MB and needs licensing. Words it can't resolve
  offer a manual add with your own translation instead.
- **Pictogram cards** use emoji, on the 38 concrete cards where a picture actually
  disambiguates. Abstract entries (*du coup*, *quelque chose de + adjectif*) deliberately
  have none — Duolingo doesn't picture those either, and a picture for them is noise.

## Known limits

- **Speech is read, not performed.** On-device TTS has correct pronunciation and no
  regional accent variety. It's good for comprehension drilling; it won't prepare you for
  someone mumbling on a train platform. Real audio is the eventual upgrade.
- **Open answers are self-graded.** Nothing checks your French. The model answer is the
  reference, and honest self-grading is what keeps the level estimate meaningful.
- **The level score is an instrument, not an exam.** It tracks your trend on this content.
  It is not a DELF result.
- **iOS suspends speech when the app is backgrounded**, so playback stops if you switch
  away. Restart from the play button.
- **Karaoke word timing depends on the voice.** It's driven by the speech engine's real
  `boundary` events, which iOS fires for local voices but not always reliably. When they
  don't arrive the caption falls back to timing estimated from word length and says so
  under the word, so you know not to trust the sync precisely.
- **Written answers are still self-graded.** Hooks are in place for a model to review them
  (grammar, flow, whether the argument lands), but nothing is wired up — that needs an API
  key, and it's deliberately not in here yet.
