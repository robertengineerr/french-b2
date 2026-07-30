import { useMemo } from 'react';
import { B2_THRESHOLD, BANDS, heatmap } from '../engine';

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function Sparkline({ points, height = 44 }) {
  if (points.length < 2) return null;
  const w = 100;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = height - ((p - min) / span) * (height - 6) - 3;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Stats({ state, stats, challenges, today }) {
  const grid = useMemo(() => heatmap(state, 14, today), [state, today]);
  const scores = state.scoreHistory.map((h) => h.score);
  const pct = Math.round(stats.progressToB2 * 100);

  const history = useMemo(
    () =>
      Object.keys(state.days)
        .sort()
        .reverse()
        .slice(0, 20)
        .map((k) => {
          const d = state.days[k];
          const ch = challenges.find((c) => c.id === d.challengeId);
          return { key: k, ...d, title: ch ? ch.title : d.challengeId };
        }),
    [state.days, challenges]
  );

  const accuracyByDay = useMemo(
    () =>
      Object.keys(state.days)
        .sort()
        .map((k) => {
          const d = state.days[k];
          return d.quizTotal ? d.quizRight / d.quizTotal : 0;
        }),
    [state.days]
  );

  return (
    <>
      <div className="card">
        <h2>Progression vers B2</h2>
        <div className="level-row">
          <span className="level-now">{stats.band.label}</span>
          <span className="muted small">{stats.band.blurb}</span>
        </div>

        <div className="meter" role="img" aria-label={`${pct}% du chemin vers B2`}>
          <div className="meter-fill" style={{ width: `${pct}%` }} />
          {BANDS.slice(0, -1).map((b) => (
            <span key={b.label} className="meter-tick" style={{ left: `${Math.min(100, ((b.max + 1) / B2_THRESHOLD) * 100)}%` }} />
          ))}
        </div>
        <div className="meter-legend">
          <span>score {state.score}</span>
          <span>
            {state.score >= B2_THRESHOLD ? 'seuil B2 franchi' : `${pct}% · seuil B2 à ${B2_THRESHOLD}`}
          </span>
        </div>

        {scores.length > 2 && (
          <div className="spark-wrap">
            <Sparkline points={scores.slice(-40)} />
            <span className="muted small">niveau estimé, {Math.min(40, scores.length)} derniers points</span>
          </div>
        )}

        {stats.etaWeeks != null && (
          <p className="eta">
            À ce rythme ({stats.perWeek} séance{stats.perWeek > 1 ? 's' : ''}/semaine), seuil B2
            atteint dans <b>~{stats.etaWeeks} semaines</b>.
            <span className="muted"> Estimation grossière, elle bougera.</span>
          </p>
        )}
      </div>

      <div className="tiles">
        <Tile value={stats.streak.current} label="série actuelle" sub={`record ${stats.streak.longest}`} />
        <Tile value={stats.sessions} label="défis faits" />
        <Tile
          value={stats.recentAccuracy != null ? `${Math.round(stats.recentAccuracy * 100)}%` : '—'}
          label="réussite (10 derniers)"
          sub={stats.lifetimeAccuracy != null ? `${Math.round(stats.lifetimeAccuracy * 100)}% au total` : ''}
        />
        <Tile value={`${stats.listenMinutes}`} label="minutes d’écoute" />
      </div>

      <div className="card">
        <h2>Activité</h2>
        <div className="heat">
          <div className="heat-days">
            {DAY_LABELS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="heat-grid">
            {grid.map((col, i) => (
              <div key={i} className="heat-col">
                {col.map((cell) => (
                  <span
                    key={cell.key}
                    title={`${cell.key}${cell.done ? ` — ${Math.round((cell.accuracy || 0) * 100)}%` : ''}`}
                    className={
                      'heat-cell' +
                      (cell.future ? ' future' : '') +
                      (cell.done ? ` done l${cell.accuracy == null ? 2 : cell.accuracy >= 0.85 ? 3 : cell.accuracy >= 0.6 ? 2 : 1}` : '')
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="muted small">14 semaines. L’intensité de la couleur suit le score du quiz.</p>
        {stats.streakAtRisk && !stats.doneToday && (
          <p className="warn small">
            Série en jeu : tu as travaillé hier, pas encore aujourd’hui.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Paquet de vocabulaire</h2>
        <div className="bar-stack" role="img" aria-label="répartition du paquet">
          <span className="seg mastered" style={{ flex: Math.max(stats.mastered, 0.001) }} />
          <span className="seg learning" style={{ flex: Math.max(stats.learning, 0.001) }} />
          <span className="seg untouched" style={{ flex: Math.max(stats.untouched, 0.001) }} />
        </div>
        <ul className="legend">
          <li>
            <span className="key mastered" /> acquises <b>{stats.mastered}</b>
          </li>
          <li>
            <span className="key learning" /> en cours <b>{stats.learning}</b>
          </li>
          <li>
            <span className="key untouched" /> pas encore vues <b>{stats.untouched}</b>
          </li>
        </ul>
        <p className="muted small">
          {stats.deckSize} cartes au total · {stats.dueToday} à réviser aujourd’hui
          {stats.leeches > 0 && ` · ${stats.leeches} carte${stats.leeches > 1 ? 's' : ''} récalcitrante${stats.leeches > 1 ? 's' : ''}`}
        </p>
      </div>

      {accuracyByDay.length > 2 && (
        <div className="card">
          <h2>Réussite par séance</h2>
          <div className="bars">
            {accuracyByDay.slice(-24).map((a, i) => (
              <span
                key={i}
                className="qbar"
                style={{ height: `${Math.max(4, a * 100)}%` }}
                title={`${Math.round(a * 100)}%`}
              />
            ))}
          </div>
          <p className="muted small">
            La zone visée est 75–85 %. Trop haut trop souvent, le contenu est trop facile ; trop
            bas, l’app redescend d’un cran.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Défis terminés</h2>
        {history.length === 0 ? (
          <p className="muted">Rien encore.</p>
        ) : (
          <ul className="history">
            {history.map((h) => (
              <li key={h.key}>
                <span className="h-date">{h.key.slice(5)}</span>
                <span className="h-title">{h.title}</span>
                <span className="h-score">
                  {h.quizTotal ? `${Math.round((h.quizRight / h.quizTotal) * 100)}%` : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Tile({ value, label, sub }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  );
}
