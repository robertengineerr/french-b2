import { useEffect, useState } from 'react';
import table from '../data/photos.js';
import { imageUrl, listKeys } from './imageStore.js';

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

    (async () => {
      const map = new Map();

      // The eight-or-so images that ship with the app, served as files.
      try {
        const data = await fetch('./photos/credits.json').then((r) => (r.ok ? r.json() : null));
        table.forEach((entry) => {
          const credit = data && data.photos && data.photos[entry.slug];
          if (credit) map.set(entry.fr, { slug: entry.slug, credit });
        });
      } catch {
        // No shipped photo set — every card falls back to its emoji.
      }

      // Images you picked yourself, from IndexedDB. Listed second so they win a
      // collision: your own choice for a word beats the bundled default.
      try {
        const keys = await listKeys();
        await Promise.all(
          keys.map(async (fr) => {
            const url = await imageUrl(fr);
            if (url) map.set(fr, { url, picked: true });
          })
        );
      } catch {
        // IndexedDB blocked (private browsing, say) — bundled photos still work.
      }

      if (cancelled) return;
      cache = map;
      setPhotos(map);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return photos;
}

// Called after picking an image so the next question shows it without a reload.
export function invalidatePhotos() {
  cache = null;
}
