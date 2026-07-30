import { useEffect, useMemo, useRef, useState } from 'react';
import { completeDay, nextScore, recycleWords } from '../engine';
import Player from './Player';

const STEPS = ['Mots', 'Lecture', 'Écoute', 'Grammaire', 'Quiz'];

// Splits a paragraph into sentences for the read-aloud queue. Keeps the
// punctuation so the voice gets its intonation right.
function toSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlights glossary terms inside the reading text so a tap reveals the meaning
// without leaving the paragraph. Matching is loose on apostrophe style, since
// content uses ’ and a regex source may not.
function GlossedText({ text, glossary }) {
  const [open, setOpen] = useState(null);

  const parts = useMemo(() => {
    if (!glossary || !glossary.length) return [{ t: text }];
    const terms = glossary
      .map((g) => ({ ...g, key: g.fr.replace(/^(le |la |les |l’|un |une |des )/i, '') }))
      .sort((a, b) => b.key.length - a.key.length)
      .filter((g) => g.key.length > 3);
    if (!terms.length) return [{ t: text }];

    const pattern = terms.map((g) => escapeRegExp(g.key).replace(/['’]/g, "['’]")).join('|');
    const re = new RegExp(`(${pattern})`, 'gi');
    const out = [];
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      const hit = terms.find((g) => g.key.toLowerCase().replace(/[’']/g, "'") === m[0].toLowerCase().replace(/[’']/g, "'"));
      out.push({ t: m[0], g: hit });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last) });
    return out;
  }, [text, glossary]);

  return (
    <p className="reading-para">
      {parts.map((p, i) =>
        p.g ? (
          <button
            key={i}
            className={`gloss${open === i ? ' open' : ''}`}
            onClick={() => setOpen(open === i ? null : i)}
          >
            {p.t}
            {open === i && <span className="gloss-pop">{p.g.en}</span>}
          </button>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </p>
  );
}

function WordCard({ word, revealed, onToggle }) {
  return (
    <button className={`word-card${revealed ? ' revealed' : ''}`} onClick={onToggle}>
      <span className="word-fr">{word.fr}</span>
      {revealed ? (
        <>
          <span className="word-en">{word.en}</span>
          {word.note && <span className="word-note">{word.note}</span>}
        </>
      ) : (
        <span className="word-hint">toucher pour révéler</span>
      )}
    </button>
  );
}

function Quiz({ items, onFinish }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [draft, setDraft] = useState('');
  const [showModel, setShowModel] = useState(false);

  const q = items[i];
  const isLast = i === items.length - 1;

  const record = (points) => {
    const next = [...answers, points];
    setAnswers(next);
    if (isLast) {
      onFinish(next.reduce((a, b) => a + b, 0), items.length);
    } else {
      setI(i + 1);
      setPicked(null);
      setDraft('');
      setShowModel(false);
    }
  };

  if (q.type === 'open') {
    return (
      <div className="quiz">
        <QuizProgress i={i} n={items.length} />
        <p className="quiz-q">{q.q}</p>
        <textarea
          className="quiz-open"
          rows={6}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Écris ta réponse en français…"
          autoCapitalize="sentences"
          spellCheck={false}
        />
        {!showModel ? (
          <button className="btn primary" disabled={draft.trim().length < 15} onClick={() => setShowModel(true)}>
            {draft.trim().length < 15 ? 'Écris quelques phrases…' : 'Comparer avec un modèle'}
          </button>
        ) : (
          <>
            <div className="model">
              <h4>Réponse modèle</h4>
              <p>{q.model}</p>
            </div>
            <p className="self-grade-label">Ta réponse s’en approche&nbsp;?</p>
            <div className="row">
              <button className="btn good" onClick={() => record(1)}>
                Oui
              </button>
              <button className="btn ok" onClick={() => record(0.5)}>
                À peu près
              </button>
              <button className="btn bad" onClick={() => record(0)}>
                Pas vraiment
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const options = q.type === 'tf' ? ['Vrai', 'Faux'] : q.options;
  const correctIndex = q.type === 'tf' ? (q.answer ? 0 : 1) : q.answer;
  const answered = picked !== null;

  return (
    <div className="quiz">
      <QuizProgress i={i} n={items.length} />
      <p className="quiz-q">{q.q}</p>
      <div className="options">
        {options.map((opt, k) => {
          let cls = 'option';
          if (answered) {
            if (k === correctIndex) cls += ' correct';
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
          <div className={`feedback ${picked === correctIndex ? 'ok' : 'no'}`}>
            <strong>{picked === correctIndex ? 'Correct.' : 'Pas tout à fait.'}</strong>
            {q.why && <span> {q.why}</span>}
          </div>
          <button className="btn primary" onClick={() => record(picked === correctIndex ? 1 : 0)}>
            {isLast ? 'Terminer' : 'Question suivante'}
          </button>
        </>
      )}
    </div>
  );
}

function QuizProgress({ i, n }) {
  return (
    <div className="quiz-progress">
      Question {i + 1} / {n}
    </div>
  );
}

export default function Today({
  state,
  update,
  challenge,
  stats,
  dueCount,
  exhausted,
  today,
  goToCards,
}) {
  const [step, setStep] = useState(-1); // -1 = overview, STEPS.length = récap
  const [revealed, setRevealed] = useState({});
  const [listenSeconds, setListenSeconds] = useState(0);
  const [result, setResult] = useState(null);
  const scrollRef = useRef(null);

  const alreadyDone = !!state.days[today];
  const recycled = useMemo(
    () => (challenge ? recycleWords(state, challenge, today, 3) : []),
    // Deliberately not depending on `state`: the recycled set should stay put
    // while you work through the session, not reshuffle after each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challenge && challenge.id, today]
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [step]);

  if (!challenge) {
    return (
      <div className="card">
        <h2>Aucun défi disponible</h2>
        <p>La banque de contenu est vide. Ajoute un pack dans <code>content/</code>.</p>
      </div>
    );
  }

  const finishQuiz = (right, total) => {
    const projected = nextScore(state.score, total ? right / total : 0.75, challenge.difficulty);
    setResult({ right, total, before: state.score, after: projected });
    update((s) =>
      completeDay(
        s,
        {
          challengeId: challenge.id,
          quizRight: right,
          quizTotal: total,
          listenSeconds,
          difficulty: challenge.difficulty,
          newWords: challenge.newWords,
        },
        today
      )
    );
    setStep(STEPS.length);
  };

  // ---------------------------------------------------------------- overview
  if (step === -1) {
    return (
      <div ref={scrollRef}>
        {alreadyDone && !result && (
          <div className="card done-banner">
            <strong>Défi du jour terminé ✓</strong>
            <p>
              Tu peux le refaire librement — ça ne changera ni ton score ni ta série. Les cartes,
              elles, comptent toujours.
            </p>
          </div>
        )}

        <div className="card hero">
          <div className="hero-meta">
            <span className="pill">Défi du jour</span>
            <span className="pill ghost">{'●'.repeat(challenge.difficulty)}{'○'.repeat(5 - challenge.difficulty)}</span>
          </div>
          <h1>{challenge.title}</h1>
          <p className="subtitle">{challenge.subtitle}</p>

          <ul className="agenda">
            <li>
              <b>{challenge.newWords.length} mots nouveaux</b>
              {recycled.length > 0 && <span> + {recycled.length} à revoir</span>}
            </li>
            <li>
              <b>Lecture</b> — {challenge.reading.paragraphs.length} paragraphes,{' '}
              {challenge.reading.paragraphs.join(' ').split(/\s+/).length} mots
            </li>
            <li>
              <b>Écoute</b> — {challenge.listening.kind === 'podcast' ? 'extrait de podcast' : 'dialogue'},{' '}
              {challenge.listening.lines.length} répliques
            </li>
            <li>
              <b>Grammaire</b> — {challenge.grammar.point}
            </li>
            <li>
              <b>Quiz</b> — {challenge.quiz.length} questions
            </li>
          </ul>

          <button className="btn primary big" onClick={() => setStep(0)}>
            {alreadyDone ? 'Refaire le défi' : 'Commencer'}
          </button>
        </div>

        {exhausted && (
          <div className="card muted small">
            Tu as terminé les 30 défis de la banque au moins une fois. L’app continue de te
            proposer des reprises au bon niveau, mais c’est le moment d’ajouter un pack —
            voir <code>content/SCHEMA.md</code>.
          </div>
        )}

        {dueCount > 0 && (
          <button className="card action-card" onClick={goToCards}>
            <span>
              <b>{dueCount} carte{dueCount > 1 ? 's' : ''} à réviser</b>
              <br />
              <span className="muted">Révision espacée — 3 à 5 minutes</span>
            </span>
            <span className="chev">›</span>
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ récap
  if (step === STEPS.length) {
    const pct = result && result.total ? Math.round((result.right / result.total) * 100) : 0;
    const delta = result ? Math.round((result.after - result.before) * 10) / 10 : 0;
    return (
      <div ref={scrollRef} className="card recap">
        <h2>{pct >= 80 ? 'Bien joué.' : pct >= 50 ? 'Pas mal.' : 'Difficile, celui-là.'}</h2>
        <div className="recap-score">
          {/* Self-graded answers can score a half point, so show a French decimal comma. */}
          {String(result.right).replace('.', ',')}/{result.total}
          <span className="recap-pct">{pct}%</span>
        </div>

        <ul className="recap-list">
          <li>
            Niveau estimé <b>{state.score}</b>{' '}
            {delta !== 0 && (
              <span className={delta > 0 ? 'up' : 'down'}>
                ({delta > 0 ? '+' : ''}
                {delta})
              </span>
            )}
          </li>
          <li>
            Série <b>{state.streak.current} jour{state.streak.current > 1 ? 's' : ''}</b>
          </li>
          <li>
            <b>{challenge.newWords.length} mots</b> ajoutés à ton paquet
          </li>
          {listenSeconds > 0 && (
            <li>
              <b>{Math.round(listenSeconds / 6) / 10} min</b> d’écoute
            </li>
          )}
        </ul>

        {pct < 60 && (
          <p className="muted small">
            Sous 60 %, le prochain défi sera un peu plus facile. C’est voulu : on progresse
            plus vite autour de 75–85 % de réussite.
          </p>
        )}
        {pct >= 90 && challenge.difficulty < 5 && (
          <p className="muted small">
            Au-dessus de 90 %, l’app va monter la difficulté. Si ça devient frustrant, ça
            redescendra tout seul.
          </p>
        )}

        <div className="row">
          <button className="btn primary" onClick={goToCards}>
            Réviser les cartes {dueCount > 0 ? `(${dueCount})` : ''}
          </button>
          <button className="btn" onClick={() => setStep(-1)}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ steps
  const stepper = (
    <div className="stepper">
      {STEPS.map((s, k) => (
        <button
          key={s}
          className={`step${k === step ? ' active' : ''}${k < step ? ' past' : ''}`}
          onClick={() => setStep(k)}
        >
          {s}
        </button>
      ))}
    </div>
  );

  const nav = (
    <div className="row nav-row">
      <button className="btn" onClick={() => setStep(step - 1)}>
        {step === 0 ? 'Retour' : '← ' + STEPS[step - 1]}
      </button>
      {step < STEPS.length - 1 && (
        <button className="btn primary" onClick={() => setStep(step + 1)}>
          {STEPS[step + 1]} →
        </button>
      )}
    </div>
  );

  return (
    <div ref={scrollRef}>
      {stepper}

      {step === 0 && (
        <div className="card">
          <h2>Mots du jour</h2>
          <p className="muted small">
            Touche une carte pour voir le sens. Ces mots reviennent dans le texte et dans
            l’audio, puis passent dans ton paquet à la fin du défi.
          </p>
          <div className="word-grid">
            {challenge.newWords.map((w) => (
              <WordCard
                key={w.fr}
                word={w}
                revealed={!!revealed[w.fr]}
                onToggle={() => setRevealed((r) => ({ ...r, [w.fr]: !r[w.fr] }))}
              />
            ))}
          </div>

          {recycled.length > 0 && (
            <>
              <h3 className="recycle-title">À revoir en passant</h3>
              <p className="muted small">
                Tirés de ton paquet, choisis parce qu’ils sont dus ou proches du sujet du jour.
              </p>
              <div className="word-grid">
                {recycled.map((w) => (
                  <WordCard
                    key={w.id}
                    word={w}
                    revealed={!!revealed[w.fr]}
                    onToggle={() => setRevealed((r) => ({ ...r, [w.fr]: !r[w.fr] }))}
                  />
                ))}
              </div>
            </>
          )}
          {nav}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h2>{challenge.title}</h2>
          <span className="kind-tag">{challenge.reading.kind}</span>
          <div className="reading">
            {challenge.reading.paragraphs.map((p, i) => (
              <GlossedText key={i} text={p} glossary={challenge.reading.glossary} />
            ))}
          </div>

          <Player
            title="Écouter le texte"
            compact
            lines={challenge.reading.paragraphs.flatMap(toSentences).map((text) => ({ text }))}
            settings={state.settings}
            onSeconds={(s) => setListenSeconds((x) => x + s)}
          />

          {challenge.reading.glossary && challenge.reading.glossary.length > 0 && (
            <details className="glossary">
              <summary>Glossaire ({challenge.reading.glossary.length})</summary>
              <dl>
                {challenge.reading.glossary.map((g) => (
                  <div key={g.fr} className="gl-row">
                    <dt>{g.fr}</dt>
                    <dd>{g.en}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {nav}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>Écoute</h2>
          <p className="muted small">
            Écoute d’abord sans le texte. Deux fois, si nécessaire — c’est normal. Puis
            affiche la transcription et repère ce que tu avais manqué.
          </p>
          <Player
            title={challenge.listening.kind === 'podcast' ? 'Extrait de podcast' : 'Dialogue'}
            lines={challenge.listening.lines}
            settings={state.settings}
            showTranscriptToggle
            onSeconds={(s) => setListenSeconds((x) => x + s)}
          />
          {nav}
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h2>Point de grammaire</h2>
          <h3 className="gram-point">{challenge.grammar.point}</h3>
          <p>{challenge.grammar.explain}</p>
          <ul className="examples">
            {challenge.grammar.examples.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {nav}
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <Quiz items={challenge.quiz} onFinish={finishQuiz} />
        </div>
      )}
    </div>
  );
}
