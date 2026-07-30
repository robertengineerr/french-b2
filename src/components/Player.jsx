import { useEffect, useRef, useState } from 'react';
import { estimateSeconds, ttsSupported, useFrenchVoices, useLineSpeaker } from '../lib/tts';

const RATES = [
  { v: 0.7, label: '0,7×', hint: 'très lent' },
  { v: 0.85, label: '0,85×', hint: 'lent' },
  { v: 1, label: '1×', hint: 'normal' },
  { v: 1.15, label: '1,15×', hint: 'rapide' },
];

export default function Player({
  lines,
  settings,
  showTranscriptToggle = false,
  compact = false,
  title,
  onSeconds,
}) {
  const voices = useFrenchVoices();
  const [rate, setRate] = useState(settings.rate || 0.9);
  const [showText, setShowText] = useState(!showTranscriptToggle);
  const [played, setPlayed] = useState(false);

  const { play, playLine, stop, playing, index, elapsed, resetElapsed } = useLineSpeaker({
    voices,
    voiceURI: settings.voiceURI,
    rate,
  });

  // Report listening time once per stretch of playback rather than every tick.
  const reported = useRef(0);
  useEffect(() => {
    if (!playing && elapsed > reported.current) {
      const delta = elapsed - reported.current;
      reported.current = elapsed;
      if (onSeconds && delta > 0) onSeconds(delta);
    }
  }, [playing, elapsed, onSeconds]);

  const supported = ttsSupported();
  const noVoice = supported && voices.length === 0;
  const seconds = estimateSeconds(lines, rate);

  if (!supported) {
    return (
      <div className="player unsupported">
        <p>
          Ce navigateur ne gère pas la synthèse vocale. Sur iPhone, ouvre l’app dans Safari.
          La transcription reste disponible ci-dessous.
        </p>
        <Transcript lines={lines} index={-1} onReplay={null} visible />
      </div>
    );
  }

  const start = () => {
    resetElapsed();
    reported.current = 0;
    setPlayed(true);
    play(lines);
  };

  return (
    <div className={`player${compact ? ' compact' : ''}`}>
      <div className="player-row">
        <button className="play-btn" onClick={playing ? stop : start} disabled={noVoice}>
          {playing ? '■' : '▶'}
        </button>
        <div className="player-info">
          <span className="player-title">{title || 'Écouter'}</span>
          <span className="player-sub">
            {playing
              ? `${index + 1} / ${lines.length} · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
              : `~${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${lines.length} répliques`}
          </span>
        </div>
      </div>

      <div className="rates">
        {RATES.map((r) => (
          <button
            key={r.v}
            className={`rate${Math.abs(rate - r.v) < 0.01 ? ' active' : ''}`}
            onClick={() => setRate(r.v)}
            title={r.hint}
          >
            {r.label}
          </button>
        ))}
      </div>

      {noVoice && (
        <p className="warn small">
          Aucune voix française trouvée sur cet appareil. Sur iPhone&nbsp;:
          Réglages → Accessibilité → Contenu énoncé → Voix → Français. La transcription
          fonctionne quand même.
        </p>
      )}

      {showTranscriptToggle && (
        <button className="btn subtle" onClick={() => setShowText((s) => !s)}>
          {showText ? 'Masquer la transcription' : 'Afficher la transcription'}
        </button>
      )}

      {showTranscriptToggle && !showText && !played && (
        <p className="muted small">Essaie une première écoute sans lire.</p>
      )}

      <Transcript
        lines={lines}
        index={index}
        visible={showText}
        onReplay={(i) => playLine(lines, i)}
      />
    </div>
  );
}

function Transcript({ lines, index, visible, onReplay }) {
  if (!visible) return null;
  return (
    <ol className="transcript">
      {lines.map((l, i) => (
        <li key={i} className={i === index ? 'active' : ''}>
          {l.speaker && <span className="speaker">{l.speaker}</span>}
          <span className="line-text">{l.text}</span>
          {onReplay && (
            <button className="replay" onClick={() => onReplay(i)} aria-label="Réécouter cette ligne">
              ↺
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
