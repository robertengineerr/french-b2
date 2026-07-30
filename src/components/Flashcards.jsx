import { useEffect, useMemo, useRef, useState } from 'react';
import { dueCards, gradeCard, isMastered } from '../engine';
import { buildClozeIndex, buildQuestion, checkTyped, TYPES } from '../lib/exercises';
import { ttsSupported, useFrenchVoices, useLineSpeaker } from '../lib/tts';

const RATINGS = [
  { id: 'again', label: 'Encore', hint: 'dans 5 min', cls: 'bad' },
  { id: 'hard', label: 'Difficile', hint: '', cls: 'warn' },
  { id: 'good', label: 'Correct', hint: '', cls: 'ok' },
  { id: 'easy', label: 'Facile', hint: '', cls: 'good' },
];

const LABELS = {
  [TYPES.meaning]: 'Quel est le sens ?',
  [TYPES.reverse]: 'Comment dit-on ?',
  [TYPES.picture]: 'Quel mot correspond ?',
  [TYPES.cloze]: 'Quel mot complète la phrase ?',
  [TYPES.listen]: 'Écoute et choisis le sens',
  [TYPES.type]: 'Écris le mot en français',
  [TYPES.reveal]: '',
};

export default function Flashcards({ state, update, today, challenges }) {
  const [queue, setQueue] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);

  const voices = useFrenchVoices();
  const { playLine } = useLineSpeaker({ voices, voiceURI: state.settings.voiceURI, rate: 0.85 });
  const canSpeak = ttsSupported() && voices.length > 0;

  const cards = state.cards;
  const allDue = useMemo(() => dueCards(state, today), [state, today]);
  const pool = useMemo(() => Object.values(cards), [cards]);
  const cloze = useMemo(() => buildClozeIndex(challenges, pool), [challenges, pool]);

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
    setPicked(null);
    // Intentionally built from the due list at mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const currentId = queue && queue.length ? queue[0] : null;
  const card = currentId ? cards[currentId] : null;

  const question = useMemo(
    () => (card ? buildQuestion(card, { pool, cloze, canSpeak }) : null),
    // Re-derived per card and per rep — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card && card.id, card && card.reps, pool.length, canSpeak]
  );

  // Auto-play the audio when a listening card comes up.
  useEffect(() => {
    if (question && question.type === TYPES.listen && card && canSpeak) {
      playLine([{ text: card.fr }], 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question && question.type, card && card.id]);

  const grade = (rating) => {
    update((s) => gradeCard(s, currentId, rating, today));
    setRevealed(false);
    setPicked(null);
    setTyped('');
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
    setPicked(null);
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

  const isChoice = question.options && question.options.length > 0;
  const answered = picked !== null;
  const correct = answered && picked === question.answer;

  return (
    <>
      <div className="review-head">
        <span>
          {queue.length} restante{queue.length > 1 ? 's' : ''}
        </span>
        {LABELS[question.type] && <span className="ex-label">{LABELS[question.type]}</span>}
      </div>

      {/* ---------------------------------------------- multiple choice */}
      {isChoice && (
        <div className="card exercise">
          {card.fix && <span className="fix-flag">correction</span>}

          {question.type === TYPES.picture ? (
            <div className="pictogram" role="img" aria-label="indice visuel">
              {question.prompt}
            </div>
          ) : question.type === TYPES.listen ? (
            <button
              className="listen-again"
              onClick={() => playLine([{ text: card.fr }], 0)}
              aria-label="Réécouter"
            >
              🔈
            </button>
          ) : question.type === TYPES.cloze ? (
            <p className="cloze-sentence">{question.prompt}</p>
          ) : (
            <div className="fc-front">{question.prompt}</div>
          )}

          {question.type === TYPES.cloze && question.hint && !answered && (
            <p className="muted small">indice&nbsp;: {question.hint}</p>
          )}

          <div className="options">
            {question.options.map((opt, k) => {
              let cls = 'option';
              if (answered) {
                if (k === question.answer) cls += ' correct';
                else if (k === picked) cls += ' wrong';
                else cls += ' dim';
              }
              return (
                <button key={k} className={cls} disabled={answered} onClick={() => setPicked(k)}>
                  {opt}
                </button>
              );
            })}
          </div>

          {answered && (
            <>
              <div className={`feedback ${correct ? 'ok' : 'no'}`}>
                <strong>{correct ? 'Correct.' : 'Non — '}</strong>
                {!correct && <span>{card.fr} = {card.en}</span>}
                {correct && question.type !== TYPES.meaning && <span> {card.en}</span>}
              </div>
              {card.fix && (
                <div className="fc-fix">
                  <b>À corriger&nbsp;:</b> {card.fix}
                </div>
              )}
              {card.note && <div className="fc-note">{card.note}</div>}
              <button className="btn primary" onClick={() => grade(correct ? 'good' : 'again')}>
                Continuer
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------- typed production */}
      {question.type === TYPES.type && (
        <div className="card exercise">
          <div className="fc-front">{question.prompt}</div>
          <input
            className="type-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="en français…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={answered}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && typed.trim() && !answered) {
                setPicked(checkTyped(typed, question.expected) ? 1 : 0);
              }
            }}
          />
          {!answered ? (
            <button
              className="btn primary"
              disabled={!typed.trim()}
              onClick={() => setPicked(checkTyped(typed, question.expected) ? 1 : 0)}
            >
              Vérifier
            </button>
          ) : (
            <>
              <div className={`feedback ${picked === 1 ? 'ok' : 'no'}`}>
                <strong>{picked === 1 ? 'Correct.' : 'Pas tout à fait — '}</strong>
                <span>{card.fr}</span>
              </div>
              <p className="muted small">
                Les accents et la casse ne comptent pas ici — seule l’orthographe du mot compte.
              </p>
              {card.note && <div className="fc-note">{card.note}</div>}
              <button className="btn primary" onClick={() => grade(picked === 1 ? 'good' : 'again')}>
                Continuer
              </button>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------- classic two-sided card */}
      {question.type === TYPES.reveal && (
        <>
          <div className="card flashcard" onClick={() => !revealed && setRevealed(true)}>
            {card.fix && <span className="fix-flag">correction</span>}
            {card.emoji && <span className="fc-emoji" aria-hidden="true">{card.emoji}</span>}
            <div className="fc-front">{card.fr}</div>

            {!revealed ? (
              <p className="muted small tap-hint">Toucher pour retourner</p>
            ) : (
              <>
                <hr />
                <div className="fc-back">{card.en}</div>
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
                {canSpeak && (
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
      )}
    </>
  );
}
