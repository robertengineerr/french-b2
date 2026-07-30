// Shared word-form helpers. Kept in its own module because both the reading
// lookup and the flashcard exercise builder need the same notion of "the word
// without its article", and duplicating it would let the two drift apart.

// "le loyer" → "loyer", "l’école" → "école", "les murs (m. pl.)" → "murs".
// Also drops the grammatical annotations used in the seed deck so the bare word
// can be matched against running text.
export function stripArticleForm(fr) {
  return String(fr)
    .replace(/\s*\((?:m\.|f\.|m\. pl\.|f\. pl\.|e)\)\s*/g, ' ')
    .replace(/\(e\)$/, '')
    .trim()
    .replace(/^(le|la|les|un|une|des|du|de la|au|aux)\s+/i, '')
    .replace(/^l['’]/i, '')
    .trim();
}
