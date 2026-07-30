import { useEffect, useState } from 'react';
import table from '../data/photos.js';

// Maps a card's `fr` to its photo, but only for photos that actually shipped.
//
// The curated table in data/photos.js says which cards *want* a photo; the
// credits file written by the importer says which ones *have* one. A card whose
// image failed to fetch has to fall back to its emoji rather than render a
// broken <img>, so availability is decided by the credits file, not the table.
//
// Photos are optional in the same way the sentence bank is: if the fetch never
// ran, nothing here resolves and every card keeps its emoji.
let cache = null;

export function usePhotos() {
  const [photos, setPhotos] = useState(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetch('./photos/credits.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !data.photos) return;
        const map = new Map();
        table.forEach((entry) => {
          const credit = data.photos[entry.slug];
          if (credit) map.set(entry.fr, { slug: entry.slug, credit });
        });
        cache = map;
        setPhotos(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return photos;
}
