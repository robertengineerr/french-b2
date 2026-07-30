import { useEffect, useMemo, useRef, useState } from 'react';
import { dueCards, gradeCard, isMastered } from '../engine';
import { ttsSupported, useFrenchVoices, useLineSpeaker } from '../lib/tts';

const RATINGS = [
  { id: 'again', label: 'Encore', hint: 'dans 5 min', cls: 'bad' },
  { id: 'hard', label: 'Difficile', hint: '', cls: 'warn' },
  { id: 'good', label: 'Correct', hint: '', cls: 'ok' },
  { id: 'easy', label: 'Facile', hint: '', cls: 'good' },
];

export default function Flashcards({ state, update, today }) {
  const [queue, setQueue] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);

  const voices = useFrenchVoices();
  const { playLine } = useLineSpeaker({ voices, voiceURI: state.settings.voiceURI, rate: 0.85 });

  const allDue = useMemo(() => dueCards(state, today), [state, today]);

  // Build the session queue once, so grading a card doesn't reshuffle what's left.
  const limit = state.settings.reviewsPerSession || 20;
  const builtFor = useRef(null);
  useEffect(() => {
    if (builtFor.current === today && queue !== null) return;
    builtFor.current = today;
    setQueue(allDue.slice(0, limit).map((c) => c.id));
    setDone(0);
    setAgain(0);
    setRevealed(false);
    // Intentionally built from the due list at mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const cards = state.cards;
  const currentId = queue && queue.length ? queue[0] : null;
  const card = currentId ? cards[currentId] : null;

  const grade = (rating) => {
    update((s) => gradeCard(s, currentId, rating, today));
    setRevealed(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      if (rating === 'again') {
        setAgain((n) => n + 1);
        // Slot it back a few cards later so it isn't the very next thing you see.
        const at = Math.min(3, rest.length);
        return [...rest.slice(0, at), head, ...rest.slice(at)];
      }
      setDone((n) => n + 1);
      return rest;
    });
  };

  const startMore = () => {
    const remaining = allDue.filter((c) => !queue || !queue.includes(c.id));
    setQueue(remaining.slice(0, limit).map((c) => c.id));
    setRevealed(false);
  };

  const deck = Object.values(cards);
  const mastered = deck.filter(isMastered).length;

  if (queue === null) return <div className="card muted">Préparation…</div>;

  if (!card) {
    const stillDue = allDue.length;
    return (
      <div className="card">
        <h2>{done > 0 ? 'Session terminée.' : 'Rien à réviser.'}</h2>
        {done > 0 && (
          <p>
            <b>{done}</b> carte{done > 1 ? 's' : ''} validée{done > 1 ? 's' : ''}
            {again > 0 && (
              <>
                , dont <b>{again}</b> remise{again > 1 ? 's' : ''} en jeu
              </>
            )}
            .
          </p>
        )}
        <ul className="recap-list">
          <li>
            Paquet <b>{deck.length}</b> cartes
          </li>
          <li>
            Acquises <b>{mastered}</b> <span className="muted">(intervalle ≥ 21 jours)</span>
          </li>
          <li>
            À revoir aujourd’hui <b>{stillDue}</b>
          </li>
        </ul>
        {stillDue > 0 ? (
          <button className="btn primary" onClick={startMore}>
            Continuer ({Math.min(stillDue, limit)} de plus)
          </button>
        ) : (
          <p className="muted small">
            Reviens demain — les cartes réapparaissent à intervalles croissants. Faire le défi du
            jour en ajoute de nouvelles.
          </p>
        )}
      </div>
    );
  }

  const front = reverse ? card.en : card.fr;
  const back = reverse ? card.fr : card.en;

  return (
    <>
      <div className="review-head">
        <span>
          {queue.length} restante{queue.length > 1 ? 's' : ''}
        </span>
        <button className="btn subtle tiny" onClick={() => setReverse((r) => !r)}>
          {reverse ? 'EN → FR' : 'FR → EN'}
        </button>
      </div>

      <div className="card flashcard" onClick={() => !revealed && setRevealed(true)}>
        {card.fix && <span className="fix-flag">correction</span>}

        <div className="fc-front">{front}</div>

        {!revealed ? (
          <p className="muted small tap-hint">Toucher pour retourner</p>
        ) : (
          <>
            <hr />
            <div className="fc-back">{back}</div>
            {card.fix && (
              <div className="fc-fix">
                <b>À corriger&nbsp;:</b> {card.fix}
              </div>
            )}
            {card.note && <div className="fc-note">{card.note}</div>}
            <div className="fc-meta">
              {card.reps === 0 ? 'nouvelle carte' : `vue ${card.reps} fois`}
              {card.lapses > 0 && ` · ${card.lapses} oubli${card.lapses > 1 ? 's' : ''}`}
              {card.interval > 0 && ` · intervalle ${card.interval} j`}
            </div>
            {ttsSupported() && voices.length > 0 && (
              <button
                className="btn subtle tiny"
                onClick={(e) => {
                  e.stopPropagation();
                  playLine([{ text: card.fr }], 0);
                }}
              >
                🔈 Prononcer
              </button>
            )}
          </>
        )}
      </div>

      {revealed && (
        <div className="ratings">
          {RATINGS.map((r) => (
            <button key={r.id} className={`btn ${r.cls}`} onClick={() => grade(r.id)}>
              {r.label}
              {r.hint && <span className="rate-hint">{r.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
