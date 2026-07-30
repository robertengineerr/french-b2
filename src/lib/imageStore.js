// Picked images live in IndexedDB, not in the app's normal state.
//
// Everything else — deck, streak, schedule, settings — is one JSON blob in
// localStorage, which is capped around 5 MB in Safari. A dozen photos would blow
// that, and the failure mode isn't "no photo": it's a quota error on the next
// save, taking the deck and the streak with it. So images get their own store,
// with its own quota, that can fail on its own.
//
// The consequence worth knowing: Réglages' Export writes that JSON blob, so it
// carries your vocabulary and progress but not these images. A phone switch
// keeps every card and loses their pictures. That's the deliberate trade — a
// card's content is what matters, the picture is decoration, and turning a
// one-tap JSON export into a zip is real complexity for a rare event.

const DB = 'fr-b2-images';
const STORE = 'images';
const VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB refusé'));
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// Keyed by the card's `fr`, the same key the built-in photo table uses, so the
// two lookups stay interchangeable.
export function putImage(fr, blob, credit) {
  return tx('readwrite', (s) => s.put({ blob, credit, at: Date.now() }, fr));
}

export function getImage(fr) {
  return tx('readonly', (s) => s.get(fr));
}

export function deleteImage(fr) {
  return tx('readwrite', (s) => s.delete(fr));
}

export function listKeys() {
  return tx('readonly', (s) => s.getAllKeys());
}

// Downloads the chosen photo and stores the bytes, so the card keeps working on
// a train. Fetching cross-origin gives an opaque response unless the host sends
// CORS headers — stock APIs do, but if one doesn't this rejects rather than
// storing an unreadable blob.
export async function saveFromUrl(fr, url, credit) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}).`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Le fichier reçu n’est pas une image.');
  await putImage(fr, blob, credit);
  return blob;
}

// Object URLs have to be revoked or the blobs leak for the life of the page, so
// hand out cached ones and let the caller release the lot on unmount.
const urls = new Map();

export async function imageUrl(fr) {
  if (urls.has(fr)) return urls.get(fr);
  const rec = await getImage(fr).catch(() => null);
  if (!rec || !rec.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  urls.set(fr, url);
  return url;
}

export function forget(fr) {
  const url = urls.get(fr);
  if (url) URL.revokeObjectURL(url);
  urls.delete(fr);
}
