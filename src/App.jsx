import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bankExhausted,
  dayKey,
  deriveStats,
  dueCards,
  loadState,
  lockServed,
  saveState,
  selectChallenge,
} from './engine';
import Today from './components/Today';
import Flashcards from './components/Flashcards';
import Stats from './components/Stats';
import Settings from './components/Settings';

const TABS = [
  { id: 'today', label: 'Aujourd’hui', icon: '◎' },
  { id: 'cards', label: 'Cartes', icon: '▤' },
  { id: 'stats', label: 'Stats', icon: '▮' },
  { id: 'settings', label: 'Réglages', icon: '⚙' },
];

export default function App() {
  const [state, setState] = useState(loadState);
  const [challenges, setChallenges] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('today');
  const today = dayKey();

  // Persist on every change. The state is a few tens of KB at most, so there's
  // no reason to debounce it.
  useEffect(() => saveState(state), [state]);

  // Content lives in /content as plain JSON so packs can be added without
  // touching the app bundle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const idx = await fetch('./content/index.json', { cache: 'no-cache' }).then((r) => {
          if (!r.ok) throw new Error(`index.json: ${r.status}`);
          return r.json();
        });
        const packs = await Promise.all(
          (idx.packs || []).map((f) =>
            fetch(`./content/${f}`, { cache: 'no-cache' }).then((r) => {
              if (!r.ok) throw new Error(`${f}: ${r.status}`);
              return r.json();
            })
          )
        );
        if (cancelled) return;
        setChallenges(packs.flatMap((p) => p.challenges || []));
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const challenge = useMemo(
    () => (challenges ? selectChallenge(state, challenges, today) : null),
    [challenges, state, today]
  );

  // Lock in the pick the first time it's shown, so it can't change mid-session
  // if the ability score shifts from a flashcard review.
  useEffect(() => {
    if (challenge && !(state.served && state.served[today])) {
      setState((s) => lockServed(s, challenge.id, today));
    }
  }, [challenge, state.served, today]);

  const stats = useMemo(() => deriveStats(state, today), [state, today]);
  const due = useMemo(() => dueCards(state, today), [state, today]);
  const exhausted = useMemo(
    () => (challenges ? bankExhausted(state, challenges) : false),
    [challenges, state]
  );

  const update = useCallback((fn) => setState((s) => fn(s)), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="brand">Parcours B2</span>
          <span className="band-chip" title={stats.band.blurb}>
            {stats.band.label}
          </span>
        </div>
        <div className="topbar-right">
          {stats.streak.current > 0 && (
            <span className={`streak${stats.streakAtRisk && !stats.doneToday ? ' at-risk' : ''}`}>
              {stats.doneToday || !stats.streakAtRisk ? '🔥' : '⏳'} {stats.streak.current}
            </span>
          )}
        </div>
      </header>

      <main className="content">
        {loadError && (
          <div className="card error">
            <h2>Contenu introuvable</h2>
            <p>
              Impossible de charger les défis (<code>{loadError}</code>). Si tu viens de déployer,
              vérifie que le dossier <code>content/</code> a bien été copié à côté de{' '}
              <code>index.html</code>.
            </p>
          </div>
        )}

        {!loadError && !challenges && <div className="card muted">Chargement du contenu…</div>}

        {challenges && tab === 'today' && (
          <Today
            state={state}
            update={update}
            challenge={challenge}
            stats={stats}
            dueCount={due.length}
            exhausted={exhausted}
            today={today}
            goToCards={() => setTab('cards')}
          />
        )}
        {challenges && tab === 'cards' && (
          <Flashcards state={state} update={update} today={today} challenges={challenges} />
        )}
        {challenges && tab === 'stats' && (
          <Stats state={state} stats={stats} challenges={challenges} today={today} />
        )}
        {challenges && tab === 'settings' && (
          <Settings state={state} update={update} setState={setState} />
        )}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="tab-label">{t.label}</span>
            {t.id === 'cards' && due.length > 0 && <span className="badge">{due.length}</span>}
            {t.id === 'today' && !stats.doneToday && <span className="dot" aria-hidden="true" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
