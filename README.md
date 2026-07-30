# Parcours B2

An adaptive daily French trainer, built for one specific job: getting from **B1 to B2**.
It runs as an installable web app on the iPhone home screen — no App Store, no account, no
server. Everything works offline once loaded. There is one optional exception, described
below: paste an Anthropic API key and a model will mark your written French.

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
   written answer. You compare it against a model answer and grade yourself; with a key set,
   a model also marks it for grammar *and* flow.

Finishing it adds the new words to your spaced-repetition deck, updates your level
estimate, and extends your streak.

## What "adaptive" means here concretely

The daily loop involves no LLM call — content is authored ahead of time, and adaptation
comes from selection rather than generation:

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

## Practice runs as long as you want it to

The **Pratique** tab has two phases, and the difference is deliberate.

**Review** is the cards spaced repetition says are due today. These grade on four buttons
and they move the schedule.

**Free practice** is everything else, and it doesn't run out. When the due queue empties, the
tab offers *Pratique libre — sans limite*: cards drawn weakest-first from the whole deck,
refilling before the queue empties so there's never a "come back tomorrow" wall.
Weakest-first means ranked by lapses, current streak, interval, whether the card has ever
actually been tested, and how overdue it is — so extra drilling lands on the words you keep
dropping rather than the ones you already own.

Free practice grades on two buttons — *je savais* / *je ne savais pas* — because **a correct
answer there deliberately does not extend the interval.** Getting a card right on your fifth
drill of the same afternoon is not evidence you'll remember it in three weeks, and letting
practice push intervals out would quietly wreck the schedule that makes the whole thing
work. A miss, though, is real evidence: it counts as a lapse, knocks the ease down, and pulls
the card back to tomorrow. So you can drill as long as you like, and the only thing that can
happen to your schedule is that it gets more honest.

## Where the unlimited practice content comes from

Gap-fill sentences come from two places. First the reading passages you've already worked
through — a real sentence you've read is the better test. Those only cover about a third of
the deck, though, because a word has to actually appear in one of the 30 texts.

The rest comes from the **[Tatoeba corpus](https://tatoeba.org/en/downloads)** — a community
collection of sentences with human translations, released CC-BY 2.0 FR (some older sentences
are CC0). It's the one large FR→EN sentence set that is both freely licensed and written by
people rather than machine-translated. `scripts/import-sentences.mjs` downloads the FR-EN
pairs (via the [Anki-format export](https://www.manythings.org/anki/), which is the same data
already joined into pairs), then filters hard:

- **only sentences containing a word this app can teach** — the seed deck, the built-in
  lexicon, and every content pack's new words. That's what keeps the file a few hundred KB
  instead of a few hundred MB, and it means every sentence in the bank is useful rather than
  merely French.
- 25–130 characters, properly capitalised and punctuated, no digits, no truncated quotes.
- at most four target words per sentence — five makes the gap guessable from the rest.
- up to three per word, de-duplicated, scored to prefer phone-sized sentences with real
  clause structure over Tatoeba's placeholder cast of Toms and Marys.

The output is `public/content/sentences.json`: one shared sentence array plus a per-word
index into it, so a sentence serving three words is stored once. It's optional — if the file
isn't there, practice just falls back to the passages.

The corpus hosts aren't reachable from every network, and the bank is a shared build input
rather than something each person should generate differently, so the real run happens on a
runner: **Actions → Rebuild sentence bank → Run workflow**. It commits the result and
dispatches a deploy. It also runs quarterly, so a new content pack's vocabulary picks up
sentences without anyone having to remember.

Sentences from the bank are labelled as such in the app, with the attribution the licence
asks for.

## The optional model correction, and why the spend controls are the interesting part

Self-grading has one real hole: you cannot mark grammar you don't know is wrong. So Réglages
takes an Anthropic API key, and with one set, two things become available — a correction on
the open written answer (errors quoted from your own text, plus a note on **flow**: linking
words, sentence variety, whether the argument holds together), and a translation for words the
built-in lexicon can't resolve.

Everything else works identically without a key. The feature is additive, never load-bearing.

**Model choice.** Sonnet 5 is the default. Worth knowing if you were thinking of picking an
older model to save money: **Sonnet 5 is currently on introductory pricing at $2/$10 per
million tokens through 2026-08-31, which makes it cheaper than Sonnet 4.6 at $3/$15** — and
more capable. Haiku 4.5 ($1/$5) is in the list too and is plenty for word lookups. Picking
Sonnet 4.6 "to be safe" would cost more for worse corrections, so there is no version of
"use an older model" that helps here.

**What actually prevents runaway billing** is not the model choice, it's the brakes — five of
them, all checked *before* the request goes out:

| Brake | Default | What it stops |
|---|---|---|
| Monthly USD cap | $2 | The bill, absolutely. Over it, calls are refused. |
| Daily call cap | 20 | A stuck loop, within the month. |
| `max_tokens` per call | 700, clamped | One response running long. |
| Input truncation | 1400 chars | A pasted essay becoming a huge request. |
| One request in flight | — | A double-tap fanning out. |

The spend meter uses the **token counts the API actually returns**, not an estimate, and it
prices cache reads at 0.1× and writes at 1.25× so a cached prefix isn't under-reported. A
typical correction costs well under a cent, which means the $2 default is roughly 200 of them.

The caps live in `localStorage`, so they are only as durable as this browser's data. **Also set
a spend limit on the key in the [Anthropic console](https://platform.claude.com/).** That one
cannot be cleared by clearing Safari's data, and it's the one that actually binds. Use a key
created for this app, not your main one — with no server to hide it behind, the key is
readable by anything running in this browser.

The correction is deliberately **advisory**: it does not touch your level score. A model
marking your writing and then moving your level estimate on the strength of its own marking is
a loop with no ground truth in it, so you still grade yourself. Reading the correction first
just means you are grading with better information.


## Your starting deck

Built from your own vocabulary lists — the CSV plus the handwritten notes. Where a note had
an error, the card shows the correction and gets scheduled first:

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
npm run import:sentences  # rebuild the gap-fill sentence bank (needs network)
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
  lib/claude.js     optional model calls, with the spend brakes
  components/       Today, Reading, Player, Practice, Stats, Settings
scripts/
  check-content.mjs    content validation
  check-lookup.mjs     tap-to-translate coverage + which words to add next
  import-sentences.mjs builds the Tatoeba gap-fill sentence bank
  simulate.mjs         60-day adaptive-loop simulation
  make-icons.py        PNG icon generation, no dependencies
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
- **Open answers are self-graded by default.** Without a key, nothing checks your French —
  the model answer is the reference, and honest self-grading is what keeps the level estimate
  meaningful. With a key, the correction is advisory: it does not feed the level score, because
  a model marking your work and then moving your level on the strength of its own marking is a
  loop with no ground truth in it.
- **The level score is an instrument, not an exam.** It tracks your trend on this content.
  It is not a DELF result.
- **iOS suspends speech when the app is backgrounded**, so playback stops if you switch
  away. Restart from the play button.
- **Karaoke word timing depends on the voice.** It's driven by the speech engine's real
  `boundary` events, which iOS fires for local voices but not always reliably. When they
  don't arrive the caption falls back to timing estimated from word length and says so
  under the word, so you know not to trust the sync precisely.
- **The API key is visible to this browser.** There is no server to hide it behind — that's
  the whole point of the architecture, and it's the cost of it. Use a key created for this app
  with its own spend limit, not your main one.
