import { useEffect, useState } from 'react';
import { searchImages } from '../lib/imageSearch';
import { saveFromUrl } from '../lib/imageStore';
import { invalidatePhotos } from '../lib/photos';

// Offered after a word is added, never before — the word is already saved by the
// time this appears, so dismissing it costs nothing and the picker can never
// stand between you and your vocabulary.
//
// Six candidates rather than three. Measured on the built-in photo set, roughly
// a quarter of automated image results are usable; three would often mean three
// duds. Six is two thumbnail rows on a phone and still one glance.
export default function ImagePicker({ fr, en, source, apiKey, onDone }) {
  const [state, setState] = useState({ status: 'loading' });
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    let cancelled = false;
    searchImages({ fr, en, source, key: apiKey, count: 6 }).then((res) => {
      if (cancelled) return;
      setState(res.error ? { status: 'error', error: res.error } : { status: 'ok', photos: res.photos });
    });
    return () => {
      cancelled = true;
    };
  }, [fr, en, source, apiKey]);

  const choose = async (photo) => {
    setSaving(photo.id);
    try {
      await saveFromUrl(fr, photo.full, photo.credit);
      invalidatePhotos();
      onDone(true);
    } catch (e) {
      setState({ status: 'error', error: e.message });
      setSaving(null);
    }
  };

  return (
    <div className="picker">
      <div className="picker-head">
        <span>
          Une image pour <b>{fr}</b>&nbsp;?
        </span>
        <button className="btn subtle tiny" onClick={() => onDone(false)}>
          passer
        </button>
      </div>

      {state.status === 'loading' && <p className="muted small">Recherche…</p>}

      {state.status === 'error' && (
        <>
          <p className="warn small">{state.error}</p>
          <button className="btn subtle tiny" onClick={() => onDone(false)}>
            Continuer sans image
          </button>
        </>
      )}

      {state.status === 'ok' && (
        <>
          <div className="picker-grid">
            {state.photos.map((p) => (
              <button
                key={p.id}
                className={`picker-cell${saving === p.id ? ' saving' : ''}`}
                disabled={saving !== null}
                onClick={() => choose(p)}
                aria-label={`Choisir cette image pour ${fr}`}
              >
                <img src={p.thumb} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <p className="tiny-note muted">
            Aucune ne va&nbsp;? «&nbsp;passer&nbsp;» est un choix normal — beaucoup de mots ne se
            photographient pas, et une image approximative apprend la mauvaise association.
          </p>
        </>
      )}
    </div>
  );
}
