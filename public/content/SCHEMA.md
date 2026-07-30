# Content packs

The app loads `index.json`, then fetches every file listed in `packs` and concatenates
their `challenges` arrays. To add content, drop a new `.json` file in this folder and add
its filename to `index.json`. No rebuild of the app code is needed — but you do need to
redeploy so the new file is served.

Run `npm run check:content` to validate every pack before committing. It checks the
schema, flags duplicate ids, and reports how many challenges you have at each difficulty.

## Challenge schema

```jsonc
{
  "id": "kebab-case-unique",         // must be unique across ALL packs; used as the progress key
  "title": "Le titre en français",
  "subtitle": "One line of English framing.",
  "difficulty": 3,                    // 1 = B1.1 … 5 = B2.2. Drives adaptive selection.
  "topics": ["travail", "argent"],    // free tags; also used to pick relevant recycled vocab
  "newWords": [
    { "fr": "un jalon", "en": "a milestone", "note": "optional usage note" }
  ],
  "reading": {
    "kind": "article",                // article | conversation | récit
    "paragraphs": ["…", "…", "…"],     // 2–3 paragraphs, 45–75 words each
    "glossary": [                      // inline help only — NOT added to the flashcard deck
      { "fr": "un écart", "en": "a gap" }
    ]
  },
  "listening": {
    "kind": "dialogue",               // dialogue | podcast
    "lines": [
      { "speaker": "Claire", "text": "Une phrase par ligne." }
    ]
  },
  "grammar": {
    "point": "bien que + subjonctif",
    "explain": "Two or three sentences, in English, on what it is and why it matters.",
    "examples": ["Bien qu’il SOIT tard, …"]
  },
  "quiz": [
    { "type": "mcq", "q": "…", "options": ["…","…","…","…"], "answer": 1, "why": "…" },
    { "type": "tf",  "q": "…", "answer": true, "why": "…" },
    { "type": "gap", "q": "… ___ …", "options": ["…","…","…","…"], "answer": 0, "why": "…" },
    { "type": "open","q": "…", "model": "A model answer you compare yours against." }
  ]
}
```

### Rules that matter

- `answer` on `mcq` and `gap` is a **0-based index** into `options`.
- `open` questions are self-graded. They still count toward the score, so keep exactly one
  per challenge or the accuracy maths gets noisy.
- Keep `difficulty` honest. It is the single input the engine uses to match content to
  ability — inflating it makes the level estimate drift upwards for no reason.
- 4–5 quiz items per challenge. Fewer makes each answer swing the score too hard.
- `speaker` names are used to alternate two TTS voices. Keep 2–3 distinct speakers.
- Listening lines are read one at a time, so one sentence per line reads best. 10–16 lines
  lands at roughly 60–110 seconds.

## Prompt for generating another pack

Paste this into Claude (or any capable model) when you want 10 more days of content.

> You are writing content for an adaptive French learning app for an American engineer
> at CEFR B1 working toward B2. He works in electrical/embedded engineering on power grid
> monitoring. Content must be practical and adult — everyday life, work, money, housing,
> health, admin, society, technology — never tourist-brochure filler.
>
> Produce a JSON file matching exactly the schema below, with 10 challenges at difficulty
> DIFFICULTY_HERE. Requirements:
> - All French must be natural, idiomatic, and correct, with proper accents and typographic
>   apostrophes (’).
> - Reading: 3 paragraphs, 45–75 words each. Real register, not textbook French.
> - Listening: a 10–16 line dialogue or podcast extract on the same topic, one sentence
>   per line, 2–3 named speakers.
> - `newWords`: 3–5 genuinely useful words per challenge. No obscure vocabulary.
> - `grammar`: one point per challenge, explained in English, with 3–4 examples.
> - `quiz`: 4–5 items — at least two comprehension (mcq/tf) drawn from the text or audio,
>   one `gap` drilling the day's grammar point or new vocabulary, and exactly one `open`.
> - `why` fields should quote or paraphrase the sentence that proves the answer.
> - Vary topics across the ten; no two challenges should share their whole topic list.
>
> [paste the schema block from this file]

Then save the output as e.g. `core-04.json`, add `"core-04.json"` to `index.json`,
and run `npm run check:content`.
