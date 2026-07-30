import { useEffect, useMemo, useRef, useState } from 'react';
import { dueCards, gradeCard, isMastered, practiceCards, practiceGrade } from '../engine';
import { buildClozeIndex, buildQuestion, checkTyped, TYPES } from '../lib/exercises';
import { usePhotos } from '../lib/photos';
import { ttsSupported, useFrenchVoices, useLineSpeaker } from '../lib/tts';

// Practice has two phases, and the difference matters:
//
//   review — the cards spaced repetition says are due today. These grade normally
//            and move the schedule.
//   free   — everything else, forever. Drawn weakest-first from the whole deck,
//            refilling automatically. Correct answers here deliberately don't
//            extend intervals (see practiceGrade), so drilling can't quietly
//            wreck the schedule; misses still count.
//
// The point of the split is that "I want to keep going" and "the algorithm says
// this is due" are different things, and pretending otherwise makes the level
// estimate lie.

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

export default function Practice({ state, update, today, challenges, sentenceBank }) {
  const [queue, setQueue] = useState(null);
  const [phase, setPhase] = useState('review'); // 'review' | 'free'
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(0);
  const [again, setAgain] = useState(0);
  const [freeDone, setFreeDone] = useState(0);
  const [freeRight, setFreeRight] = useState(0);

  const photos = usePhotos();
  const voices = useFrenchVoices();
  const { playLine } = useLineSpeaker({ voices, voiceURI: state.settings.voiceURI, rate: 0.85 });
  const canSpeak = ttsSupported() && voices.length > 0;

  const cards = state.cards;
  const allDue = useMemo(() => dueCards(state, today), [state, today]);
  const pool = useMemo(() => Object.values(cards), [cards]);
  const cloze = useMemo(
    () => buildClozeIndex(challenges, pool, sentenceBank),
    [challenges, pool, sentenceBank]
  );

  // Everything free practice has already served today, so a refill doesn't hand
  // back the same five cards on a loop.
  const servedRef = useRef([]);

  // Build the session queue once, so grading a card doesn't reshuffle what's left.
  const limit = state.settings.reviewsPerSession || 20;
  const builtFor = useRef(null);
  useEffect(() => {
    if (builtFor.current === today && queue !== null) return;
    builtFor.current = today;
    servedRef.current = [];
    setPhase('review');
    setQueue(allDue.slice(0, limit).map((c) => c.id));
    setDone(0);
    setAgain(0);
    setFreeDone(0);
    setFreeRight(0);
    setRevealed(false);
    setPicked(null);
    // Intentionally built from the due list at mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const currentId = queue && queue.length ? queue[0] : null;
  const card = currentId ? cards[currentId] : null;

  const question = useMemo(
    () => (card ? buildQuestion(card, { pool, cloze, canSpeak, photos }) : null),
    // Re-derived per card and per rep — not on every keystroke. `freeDone` is in
    // here so a card drawn twice in free practice doesn't get the identical
    // question shape both times.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card && card.id, card && card.reps, phase === 'free' && freeDone, pool.length, canSpeak, photos]
  );

  // Auto-play the audio when a listening card comes up.
  useEffect(() => {
    if (question && question.type === TYPES.listen && card && canSpeak) {
      playLine([{ text: card.fr }], 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question && question.type, card && card.id]);

  const clear = () => {
    setRevealed(false);
    setPicked(null);
    setTyped('');
  };

  // Pulls the next batch of weakest cards. Returns the ids so the caller can tell
  // an empty deck (nothing to draw at all) from a merely exhausted batch.
  const drawFree = (n = limit) => {
    const next = practiceCards(state, today, n, servedRef.current).map((c) => c.id);
    // A deck smaller than what's been served can't produce anything new — start
    // the rotation over rather than dead-ending.
    if (!next.length && servedRef.current.length) {
      servedRef.current = [];
      return practiceCards(state, today, n, []).map((c) => c.id);
    }
    return next;
  };

  const startFree = () => {
    const next = drawFree();
    servedRef.current = [...servedRef.current, ...next];
    setPhase('free');
    setQueue(next);
    clear();
  };

  // One place where an answer moves the session on, because the two phases grade
  // differently but everything else about advancing is identical.
  const advance = (rating, wasCorrect) => {
    if (phase === 'review') {
      update((s) => gradeCard(s, currentId, rating, today));
    } else {
      update((s) => practiceGrade(s, currentId, wasCorrect, today));
      setFreeDone((n) => n + 1);
      if (wasCorrect) setFreeRight((n) => n + 1);
    }
    clear();

    setQueue((q) => {
      const [head, ...rest] = q;
      if (phase === 'review' && rating === 'again') {
        setAgain((n) => n + 1);
        // Slot it back a few cards later so it isn't the very next thing you see.
        const at = Math.min(3, rest.length);
        return [...rest.slice(0, at), head, ...rest.slice(at)];
      }
      if (phase === 'review') setDone((n) => n + 1);
      // Free practice keeps a miss in circulation too — that's the whole point of
      // drilling — but pushes it far enough back to be a real recall.
      if (phase === 'free' && !wasCorrect) {
        const at = Math.min(4, rest.length);
        return [...rest.slice(0, at), head, ...rest.slice(at)];
      }
      // Refill before hitting empty so free practice never shows a "finished" screen.
      if (phase === 'free' && rest.length <= 2) {
        const more = drawFree();
        if (more.length) {
          servedRef.current = [...servedRef.current, ...more];
          return [...rest, ...more];
        }
      }
      return rest;
    });
  };

  const startMore = () => {
    const remaining = allDue.filter((c) => !queue || !queue.includes(c.id));
    setQueue(remaining.slice(0, limit).map((c) => c.id));
    clear();
  };

  const deck = Object.values(cards);
  const mastered = deck.filter(isMastered).length;

  if (queue === null) return <div className="card muted">Préparation…</div>;

  // Free practice refilling: the queue emptied between renders (deck smaller than
  // the batch size, say). Draw again instead of dead-ending.
  if (!card && phase === 'free') {
    if (!deck.length) {
      return (
        <div className="card">
          <h2>Paquet vide.</h2>
          <p className="muted small">Fais le défi du jour — il ajoute les premiers mots.</p>
        </div>
      );
    }
    return (
      <div className="card">
        <h2>Pratique libre</h2>
        <p>
          <b>{freeDone}</b> réponse{freeDone > 1 ? 's' : ''}
          {freeDone > 0 && (
            <>
              {' '}
              · <b>{Math.round((freeRight / freeDone) * 100)}%</b> juste
            </>
          )}
        </p>
        <button className="btn primary" onClick={startFree}>
          Continuer
        </button>
      </div>
    );
  }

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
        {stillDue > 0 && (
          <button className="btn primary" onClick={startMore}>
            Continuer ({Math.min(stillDue, limit)} de plus)
          </button>
        )}
        {deck.length > 0 ? (
          <>
            <button className={stillDue > 0 ? 'btn subtle' : 'btn primary'} onClick={startFree}>
              Pratique libre — sans limite
            </button>
            <p className="tiny-note muted">
              Les cartes les plus fragiles d’abord, en boucle. Une bonne réponse ici n’allonge pas
              l’intervalle de révision&nbsp;: seul le programme du jour fait avancer le calendrier.
            </p>
          </>
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
        {phase === 'free' ? (
          <span className="phase-chip">
            Pratique libre · {freeDone} réponse{freeDone > 1 ? 's' : ''}
          </span>
        ) : (
          <span>
            {queue.length} restante{queue.length > 1 ? 's' : ''}
          </span>
        )}
        {LABELS[question.type] && <span className="ex-label">{LABELS[question.type]}</span>}
      </div>

      {/* ---------------------------------------------- multiple choice */}
      {isChoice && (
        <div className="card exercise">
          {card.fix && <span className="fix-flag">correction</span>}

          {question.type === TYPES.picture ? (
            question.image ? (
              <figure className="photo">
                <img
                  src={question.image.url || `./photos/${question.image.slug}.webp`}
                  alt="indice visuel"
                  width="512"
                  height="512"
                  loading="eager"
                />
                {/* The licence asks for attribution, so it ships with the photo
                    rather than being buried on a credits page. Shown after you
                    answer — before that it's a distraction from the question. */}
                {answered && question.image.credit && !question.image.picked && (
                  <figcaption className="tiny-note muted">
                    {question.image.credit.author} · {question.image.credit.licence} · Wikimedia
                    Commons
                  </figcaption>
                )}
              </figure>
            ) : (
              <div className="pictogram" role="img" aria-label="indice visuel">
                {question.prompt}
              </div>
            )
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
              {question.translation && <p className="sheet-en">{question.translation}</p>}
              {question.source === 'bank' && (
                <p className="tiny-note muted">phrase du corpus Tatoeba (CC-BY 2.0 FR)</p>
              )}
              {card.fix && (
                <div className="fc-fix">
                  <b>À corriger&nbsp;:</b> {card.fix}
                </div>
              )}
              {card.note && <div className="fc-note">{card.note}</div>}
              <button
                className="btn primary"
                onClick={() => advance(correct ? 'good' : 'again', correct)}
              >
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
              <button
                className="btn primary"
                onClick={() => advance(picked === 1 ? 'good' : 'again', picked === 1)}
              >
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

          {revealed && phase === 'review' && (
            <div className="ratings">
              {RATINGS.map((r) => (
                <button key={r.id} className={`btn ${r.cls}`} onClick={() => advance(r.id, r.id !== 'again')}>
                  {r.label}
                  {r.hint && <span className="rate-hint">{r.hint}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Free practice doesn't need four grades: nothing here schedules, so the
              only thing worth recording is whether you actually knew it. */}
          {revealed && phase === 'free' && (
            <div className="ratings two">
              <button className="btn bad" onClick={() => advance('again', false)}>
                Je ne savais pas
              </button>
              <button className="btn good" onClick={() => advance('good', true)}>
                Je savais
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
