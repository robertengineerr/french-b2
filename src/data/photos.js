// The handful of cards where a photograph teaches the word better than an emoji.
//
// This list is deliberately short. Emoji win on most concrete cards: they read
// instantly at 60px, cost nothing, and never load. A photo is only worth its
// bytes where the emoji is actively *wrong* — where it points at a related idea
// rather than the word itself. 🌀 for "le ventilateur" is a spiral, not a fan;
// ⛰️ for "les collines" is a mountain, not hills. Those are the ones here.
//
// Cards not in this list keep their emoji on purpose. 🟦 for "bleu foncé" is
// better than any photograph of the colour could be, and a photo of a burger is
// not an improvement on 🍔.
//
// `query` is what the importer searches Wikimedia Commons for. `pin` overrides
// it with an exact filename when a search result turned out to be wrong — that's
// the escape hatch after reviewing what came back.
//
// `fr` must match the card's `fr` field exactly, since that's how the app looks
// a photo up at runtime.

const photos = [
  {
    slug: 'ventilateur',
    fr: 'le ventilateur',
    query: 'electric fan appliance',
    why: '🌀 is a spiral — no relation to a fan at all.',
  },
  {
    slug: 'climatiseur',
    fr: 'le climatiseur / la clim',
    query: 'air conditioner wall unit',
    why: '❄️ reads as cold or winter, not as the appliance.',
  },
  {
    slug: 'collines',
    fr: 'les collines (f. pl.)',
    query: 'rolling green hills landscape',
    why: '⛰️ is a mountain, which is the word this card is trying not to be.',
  },
  {
    slug: 'murs',
    fr: 'les murs (m. pl.)',
    query: 'empty room interior wall',
    why: '🧱 is bricks — a material, not the wall of a room.',
  },
  {
    slug: 'chambre-a-coucher',
    fr: 'la chambre à coucher',
    query: 'bedroom interior bed furniture',
    why: '🛏️ is a bed; the card is the room.',
  },
  {
    slug: 'patisserie',
    fr: 'la pâtisserie',
    query: 'pastry shop display window',
    why: '🥐 is one croissant; the card is the shop and the craft.',
  },
  {
    slug: 'nourriture',
    fr: 'la nourriture',
    query: 'assorted food spread table',
    why: '🍎 is an apple, which is a food, not food.',
  },
  {
    slug: 'plat',
    fr: 'le plat',
    query: 'plated main course restaurant',
    why: '🍽️ is empty cutlery; the card is the served dish.',
  },
];

export default photos;

// fr → slug, for the runtime lookup.
export const bySlug = new Map(photos.map((p) => [p.slug, p]));
export const byFr = new Map(photos.map((p) => [p.fr, p]));
