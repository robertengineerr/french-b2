// The handful of cards where a photograph teaches the word better than an emoji.
//
// Emoji win on most concrete cards: they read instantly at 60px, cost nothing,
// and never load. A photo is only worth its bytes where the emoji points at a
// related idea rather than the word itself — ❄️ for "le climatiseur" reads as
// cold, not as the appliance; 🍎 for "la nourriture" is *a* food, not food.
//
// Cards not in this list keep their emoji on purpose. 🟦 for "bleu foncé" is
// better than any photograph of the colour could be, and a photo of a burger is
// not an improvement on 🍔.
//
// This list is short because automated image selection turned out not to work,
// not because more cards wouldn't benefit. Two rounds of fetching produced 3
// usable images out of 14 attempts. Free-text search returns museum catalogue
// entries (an 1880 brass fan behind glass for "ventilateur", a bed frame shot on
// black for "chambre à coucher"). Category search is worse, not better, because
// a Commons category often records *where* a photo was taken rather than what it
// shows — `incategory:Hills` returned a photograph of a glove someone dropped on
// a hill.
//
// So: every entry here has been looked at. Do not add one without fetching the
// image and viewing it, and do not assume a better query will fix a bad result —
// two rounds of trying that is what produced this comment. `pin` takes an exact
// Commons filename and is the reliable way to add a card, if you have one.
//
// `fr` must match the card's `fr` field exactly, since that's how the app looks
// a photo up at runtime.

const photos = [
  {
    slug: 'climatiseur',
    fr: 'le climatiseur / la clim',
    query: 'air conditioner wall unit',
    why: '❄️ reads as cold or winter, not as the appliance.',
  },
  {
    slug: 'nourriture',
    fr: 'la nourriture',
    query: 'incategory:Meals',
    why: '🍎 is an apple, which is a food, not food.',
  },
  {
    slug: 'plat',
    fr: 'le plat',
    query: 'plated main course restaurant',
    why: '🍽️ is empty cutlery; the card is the served dish.',
  },
];

// Reviewed and rejected, each after two query attempts. Their emoji are
// imperfect but not *wrong*, which a glove on gravel is:
//   les collines, les murs, la chambre à coucher, le ventilateur, la pâtisserie
export default photos;

// fr → slug, for the runtime lookup.
export const bySlug = new Map(photos.map((p) => [p.slug, p]));
export const byFr = new Map(photos.map((p) => [p.fr, p]));
