// Optional Claude integration: a model reads your written French and comments on
// grammar AND flow, and fills in translations the built-in lexicon doesn't have.
//
// Everything here is off unless you paste an API key into Réglages. Without one
// the app behaves exactly as it did before — self-graded writing, manual add for
// unknown words.
//
// ---------------------------------------------------------------------------
// On runaway billing, which is the thing worth being careful about
// ---------------------------------------------------------------------------
// There are five independent brakes, and they're checked BEFORE the request goes
// out, not after:
//
//   1. A monthly USD cap (default $2). Spend is metered from the real token
//      counts the API returns, not estimated. Over the cap, calls are refused.
//   2. A daily call cap (default 20). Bounds a stuck loop even inside the month.
//   3. max_tokens is hard-capped per call, so a single response can't run away.
//   4. Inputs are truncated before sending — a pasted essay can't become a
//      50k-token request.
//   5. One request in flight at a time. Double-tapping a button can't fan out.
//
// A cap in the app is not a substitute for a cap at the source: also set a spend
// limit on the key in the Anthropic console. That one can't be bypassed by
// clearing localStorage.

// Prices per million tokens, from the model pricing table. Sonnet 5 is on
// introductory pricing until the date below, after which it reverts — so the
// cost meter stays honest without a code change.
//
// Worth knowing: Sonnet 5 at intro pricing is CHEAPER than Sonnet 4.6, and
// substantially more capable. Picking an older Sonnet to save money doesn't.
export const MODELS = [
  {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    blurb: 'le moins cher — largement suffisant pour les traductions',
    in: 1,
    out: 5,
  },
  {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    blurb: 'le meilleur pour corriger un texte',
    in: 3,
    out: 15,
    intro: { in: 2, out: 10, until: '2026-08-31' },
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    blurb: 'génération précédente — plus cher que Sonnet 5 en promo',
    in: 3,
    out: 15,
  },
];

export const DEFAULT_AI = {
  key: '',
  model: 'claude-sonnet-5',
  capUSD: 2,
  dailyCalls: 20,
  spend: {}, // { '2026-07': 0.0431 }
  calls: {}, // { '2026-07-30': 3 }
  enabled: true,
};

const MAX_TOKENS = 700; // brake 3
const MAX_INPUT_CHARS = 1400; // brake 4
const PRICE_SCALE = 1e-6;

function priceFor(modelId, today) {
  const m = MODELS.find((x) => x.id === modelId) || MODELS[1];
  if (m.intro && today <= m.intro.until) return { in: m.intro.in, out: m.intro.out };
  return { in: m.in, out: m.out };
}

// Cost of one call from the usage the API actually reported. Cache reads bill at
// a tenth of input and writes at 1.25×, so a naive input_tokens-only sum would
// under-report on a cached prefix.
export function costOf(usage, modelId, today) {
  if (!usage) return 0;
  const p = priceFor(modelId, today);
  const input =
    (usage.input_tokens || 0) +
    (usage.cache_read_input_tokens || 0) * 0.1 +
    (usage.cache_creation_input_tokens || 0) * 1.25;
  return (input * p.in + (usage.output_tokens || 0) * p.out) * PRICE_SCALE;
}

export function monthKey(today) {
  return today.slice(0, 7);
}

export function aiState(state) {
  return { ...DEFAULT_AI, ...(state.ai || {}) };
}

export function spentThisMonth(state, today) {
  return aiState(state).spend[monthKey(today)] || 0;
}

export function callsToday(state, today) {
  return aiState(state).calls[today] || 0;
}

// The single gate. Every call site asks this first and shows the reason it gives,
// so a refusal is always explained rather than looking like a broken button.
export function checkBudget(state, today) {
  const ai = aiState(state);
  if (!ai.enabled) return { ok: false, why: 'L’aide IA est désactivée dans Réglages.' };
  if (!ai.key) return { ok: false, why: 'Aucune clé API — ajoute-la dans Réglages.' };
  const spent = spentThisMonth(state, today);
  if (spent >= ai.capUSD) {
    return {
      ok: false,
      why: `Plafond mensuel atteint (${fmt(spent)} sur ${fmt(ai.capUSD)}). Il se remet à zéro le 1er du mois, ou augmente-le dans Réglages.`,
    };
  }
  const n = callsToday(state, today);
  if (n >= ai.dailyCalls) {
    return {
      ok: false,
      why: `Limite du jour atteinte (${n} appels). C’est un garde-fou contre les boucles — reviens demain ou augmente-la dans Réglages.`,
    };
  }
  return { ok: true, spent, cap: ai.capUSD, calls: n };
}

export function fmt(usd) {
  return usd >= 1 ? `$${usd.toFixed(2)}` : `${(usd * 100).toFixed(1)}¢`;
}

// Records what a call actually cost. Called on success AND on a failure that
// still consumed tokens, because the meter has to match the invoice.
export function recordSpend(state, today, usd) {
  const ai = aiState(state);
  const mk = monthKey(today);
  return {
    ...state,
    ai: {
      ...ai,
      spend: { ...ai.spend, [mk]: (ai.spend[mk] || 0) + usd },
      calls: { ...ai.calls, [today]: (ai.calls[today] || 0) + 1 },
    },
  };
}

// The SDK is loaded on demand, so a phone that never turns this on never
// downloads it. `dangerouslyAllowBrowser` is required to call the API from a
// page: it means the key is visible to anything running in this browser. That's
// the deal here — your key, your phone, no server to put it behind.
let clientPromise = null;
async function getClient(key) {
  if (!clientPromise || clientPromise.key !== key) {
    clientPromise = (async () => {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    })();
    clientPromise.key = key;
  }
  return clientPromise;
}

let inFlight = false; // brake 5

const clip = (s, n = MAX_INPUT_CHARS) => String(s || '').slice(0, n);

// Runs one request under every brake. `update` is the app's state setter; the
// spend is recorded through it so it persists like everything else.
async function call(state, update, today, body) {
  const gate = checkBudget(state, today);
  if (!gate.ok) return { error: gate.why };
  if (inFlight) return { error: 'Une demande est déjà en cours.' };

  const ai = aiState(state);
  inFlight = true;
  try {
    const client = await getClient(ai.key);
    const res = await client.messages.create({
      ...body,
      model: ai.model,
      // Clamped after the spread on purpose: a call site can ask for less than
      // the ceiling but never more.
      max_tokens: Math.min(body.max_tokens || MAX_TOKENS, MAX_TOKENS),
    });
    update((s) => recordSpend(s, today, costOf(res.usage, ai.model, today)));
    if (res.stop_reason === 'refusal') {
      return { error: 'Le modèle a refusé de répondre à cette demande.' };
    }
    const text = res.content.find((b) => b.type === 'text');
    if (!text) return { error: 'Réponse vide.' };
    try {
      return { data: JSON.parse(text.text) };
    } catch {
      return { error: 'Réponse illisible.' };
    }
  } catch (e) {
    // A 401/400 costs nothing, so nothing is metered — but the call still
    // counts against the daily cap, or a wrong key would retry forever.
    update((s) => recordSpend(s, today, 0));
    return { error: friendly(e) };
  } finally {
    inFlight = false;
  }
}

function friendly(e) {
  const status = e && e.status;
  if (status === 401) return 'Clé API refusée — vérifie-la dans Réglages.';
  if (status === 400) return `Requête refusée : ${e.message}`;
  if (status === 429) return 'Trop de demandes, ou le plafond de dépenses de ta clé est atteint.';
  if (status === 402 || (e && /credit|billing/i.test(e.message || '')))
    return 'Crédit épuisé sur ton compte Anthropic.';
  if (status >= 500) return 'Service indisponible — réessaie dans un moment.';
  return (e && e.message) || 'Échec de la connexion.';
}

// ------------------------------------------------------- writing feedback

const FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['solide', 'correct', 'à retravailler'],
      description: 'Overall level of the answer.',
    },
    corrections: {
      type: 'array',
      description: 'Concrete language errors, at most five, most important first.',
      items: {
        type: 'object',
        properties: {
          wrong: { type: 'string', description: 'The learner’s words, quoted exactly.' },
          right: { type: 'string', description: 'The corrected French.' },
          why: { type: 'string', description: 'One short sentence in French explaining the rule.' },
        },
        required: ['wrong', 'right', 'why'],
        additionalProperties: false,
      },
    },
    flow: {
      type: 'string',
      description:
        'Two or three sentences in French on whether the writing reads naturally: linking words, sentence variety, whether the argument holds together. Not about grammar.',
    },
    strength: { type: 'string', description: 'One specific thing done well, in French.' },
    b2: {
      type: 'string',
      description:
        'One concrete upgrade that would push this from B1 to B2 — a structure or connector to use instead. In French.',
    },
  },
  required: ['verdict', 'corrections', 'flow', 'strength', 'b2'],
  additionalProperties: false,
};

const FEEDBACK_SYSTEM = `Tu corriges le français écrit d'un apprenant anglophone de niveau B1 qui veut atteindre le B2.

Deux choses comptent autant l'une que l'autre :
- la langue : accords, temps, prépositions, genre, anglicismes, faux amis ;
- la fluidité : est-ce que ça se lit comme du français ? Les connecteurs, la variété des phrases, l'enchaînement des idées.

Règles :
- Cite les erreurs telles qu'elles sont écrites, sans les reformuler.
- Cinq corrections maximum : les plus importantes, pas les broutilles de ponctuation.
- Une réponse maladroite mais compréhensible est « correct », pas « à retravailler ».
- Écris tout en français simple, au tutoiement.
- Ne commente pas le contenu des idées, seulement la langue et la construction.`;

// Reviews the open quiz answer. Deliberately does not see the model answer as
// something to match — the point is whether the learner's own French works, not
// whether it resembles a reference.
export async function reviewWriting(state, update, today, { question, answer }) {
  return call(state, update, today, {
    system: FEEDBACK_SYSTEM,
    // Thinking off and low effort: this is a bounded correction task, and a
    // 2000-token reasoning trace would multiply the cost of every review.
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: FEEDBACK_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: `Question posée : ${clip(question, 400)}\n\nRéponse de l'apprenant :\n${clip(answer)}`,
      },
    ],
  });
}

// ----------------------------------------------------------- word lookup

const WORD_SCHEMA = {
  type: 'object',
  properties: {
    fr: { type: 'string', description: 'The dictionary form (infinitive, or singular with article).' },
    en: { type: 'string', description: 'A short English gloss, under 60 characters.' },
    note: {
      type: 'string',
      description:
        'Empty string unless there is a genuine trap: a false friend, a fixed expression, or a register warning. In French, one sentence.',
    },
    known: {
      type: 'boolean',
      description: 'False if this is not a real French word (a typo, or a proper noun).',
    },
  },
  required: ['fr', 'en', 'note', 'known'],
  additionalProperties: false,
};

// Fallback for words the 727-entry lexicon doesn't have. Sentence context is
// passed because "car" and "or" mean entirely different things depending on it.
export async function translateWord(state, update, today, { word, sentence }) {
  return call(state, update, today, {
    system:
      'Tu es un dictionnaire français→anglais pour un apprenant B1. Donne la forme de base et une glose courte. Si le mot a plusieurs sens, choisis celui du contexte.',
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: WORD_SCHEMA } },
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `Mot : « ${clip(word, 60)} »\nDans la phrase : ${clip(sentence, 300)}`,
      },
    ],
  });
}
