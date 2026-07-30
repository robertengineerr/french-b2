// Image search for the word-add picker, behind a one-function interface.
//
// The interface exists because the source choice has already been wrong once.
// The first attempt used Wikimedia Commons for the built-in pictogram photos and
// produced 3 usable images out of 14 — not a licensing problem, a *relevance*
// one. Commons is an archive: a photo lands in Category:Hills because it was
// taken on a hill, so the category returns a picture of a glove someone dropped
// there. A stock library is the opposite; every photo was taken to depict its
// subject, which is exactly what a vocabulary card needs.
//
// So sources are adapters. Each takes a French word plus its English gloss and
// returns [{ id, thumb, full, credit }]. Swapping Pexels for Unsplash or Google
// is a new adapter, not a rewrite.

// English, not French, is what stock libraries are indexed in. Searching
// "abordable" returns nothing; "affordable" returns plenty. The card already
// carries the gloss, so use it — and strip the parenthetical notes the deck uses
// ("to spend (money)" → "to spend").
export function queryFor(fr, en) {
  const first = String(en || '')
    .split(/[;/]|\bor\b|—/)[0]
    .replace(/\([^)]*\)/g, '')
    .trim();
  // Drop a leading article only if something survives it. "the (m.); him, it"
  // reduces to "the", and stripping that unconditionally left an empty query
  // that fell back to the French word — so the picker searched a stock library
  // for "le".
  const trimmed = first.replace(/^\s*(to|a|an|the)\s+/i, '').trim();
  return trimmed || first || String(fr || '').trim();
}

// French function words. A photograph cannot depict any of these, and without a
// Claude key to say so there's nothing else stopping the picker appearing every
// time you tap "de" in a passage.
const FUNCTION_WORDS = new Set(
  `le la les un une des du de au aux et ou mais donc or ni car que qui quoi dont
   ce cet cette ces cela ceci celui celle ceux je tu il elle on nous vous ils
   elles me te se lui leur y en mon ton son ma ta sa mes tes ses notre votre
   leurs pour par avec sans sous sur dans chez vers entre pendant depuis avant
   après très plus moins aussi bien mal encore déjà toujours jamais peut être
   avoir faire aller si ne pas non oui`
    .split(/\s+/)
    .filter(Boolean)
);

// Glosses that betray a function word even when the French doesn't.
const FUNCTION_GLOSS =
  /^(the|a|an|of|and|or|but|so|to|in|on|at|by|for|with|from|this|that|these|those|it|he|she|they|we|you|i|my|your|his|her|their|very|more|less|also|still|already|always|never|not|yes|no|there|here|then|than|because|if|when|while|which|who|whom|whose)\b/i;

// A conservative local check, used only when the model hasn't given an opinion.
// It errs toward *not* offering: an unnecessary picker is friction on every
// single word you add, while a missed one costs nothing you'd notice.
export function looksPhotographable(fr, en) {
  const bare = String(fr || '')
    .toLowerCase()
    .replace(/^(le|la|les|un|une|des|du|de la|l')\s*/, '')
    .trim();
  if (!bare || bare.length < 3) return false;
  if (FUNCTION_WORDS.has(bare)) return false;
  const q = queryFor(fr, en);
  if (!q || q.length < 3) return false;
  if (FUNCTION_GLOSS.test(q)) return false;
  return true;
}

const SOURCES = {
  // https://www.pexels.com/api/ — one key, free tier, curated photography.
  pexels: {
    label: 'Pexels',
    keyHint: 'Clé API Pexels (gratuite, pexels.com/api)',
    async search(query, key, count) {
      const url =
        'https://api.pexels.com/v1/search?' +
        new URLSearchParams({ query, per_page: String(count), orientation: 'square' });
      const res = await fetch(url, { headers: { Authorization: key } });
      if (!res.ok) throw new Error(httpMessage(res.status));
      const data = await res.json();
      return (data.photos || []).map((p) => ({
        id: String(p.id),
        // `medium` is ~350px — enough for a thumbnail grid without pulling a
        // full-resolution photo for something you might not pick.
        thumb: p.src.medium,
        full: p.src.large,
        credit: { author: p.photographer, source: p.url, licence: 'Pexels' },
      }));
    },
  },
};

function httpMessage(status) {
  if (status === 401) return 'Clé refusée — vérifie-la dans Réglages.';
  if (status === 429) return 'Trop de recherches d’images pour le moment. Réessaie plus tard.';
  if (status >= 500) return 'Service d’images indisponible.';
  return `Recherche impossible (${status}).`;
}

export const SOURCE_IDS = Object.keys(SOURCES);
export const sourceInfo = (id) => SOURCES[id] || SOURCES.pexels;

// Returns { photos } or { error }. Never throws — a failed image search must not
// interrupt adding the word, which is the thing that actually matters.
export async function searchImages({ fr, en, source = 'pexels', key, count = 6 }) {
  if (!key) return { error: 'Aucune clé — ajoute-la dans Réglages pour chercher des images.' };
  const src = sourceInfo(source);
  try {
    const photos = await src.search(queryFor(fr, en), key, count);
    if (!photos.length) return { error: 'Aucune image trouvée pour ce mot.' };
    return { photos };
  } catch (e) {
    return { error: e.message || 'Recherche impossible.' };
  }
}
