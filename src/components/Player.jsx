import { useEffect, useMemo, useRef, useState } from 'react';
import { estimateSeconds, tokenize, ttsSupported, useFrenchVoices, useLineSpeaker } from '../lib/tts';

const RATES = [
  { v: 0.7, label: '0,7×', hint: 'très lent' },
  { v: 0.85, label: '0,85×', hint: 'lent' },
  { v: 1, label: '1×', hint: 'normal' },
  { v: 1.15, label: '1,15×', hint: 'rapide' },
];

// off  — listen blind, nothing on screen
// word — one word at a time, in sync with the voice (the TikTok-style caption)
// full — the whole transcript, with the spoken word highlighted in place
const MODES = [
  { id: 'off', label: 'Rien' },
  { id: 'word', label: 'Mot à mot' },
  { id: 'full', label: 'Texte' },
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
  const [mode, setMode] = useState(showTranscriptToggle ? 'off' : 'full');
  const [played, setPlayed] = useState(false);

  const {
    play,
    playLine,
    stop,
    pause,
    resume,
    playing,
    paused,
    index,
    wordIndex,
    boundarySupported,
    elapsed,
    resetElapsed,
  } = useLineSpeaker({
      voices,
      voiceURI: settings.voiceURI,
      rate,
      trackWords: mode === 'word' || mode === 'full',
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
  const activeLine = index >= 0 ? lines[index] : null;

  if (!supported) {
    return (
      <div className="player unsupported">
        <p>
          Ce navigateur ne gère pas la synthèse vocale. Sur iPhone, ouvre l’app dans Safari.
          La transcription reste disponible ci-dessous.
        </p>
        <Transcript lines={lines} index={-1} wordIndex={-1} onReplay={null} visible />
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
        <button
          className="play-btn"
          onClick={playing ? pause : paused ? resume : start}
          disabled={noVoice}
          aria-label={playing ? 'Pause' : paused ? 'Reprendre' : 'Écouter'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="player-info">
          <span className="player-title">{title || 'Écouter'}</span>
          <span className="player-sub">
            {playing
              ? `${index + 1} / ${lines.length} · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
              : paused
                ? `en pause · réplique ${index + 1} / ${lines.length}`
                : `~${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${lines.length} répliques`}
          </span>
        </div>
        {/* Stop is a separate control now that the big button pauses. Only shown
            when there's something to stop, so the idle player stays one button. */}
        {(playing || paused) && (
          <button className="btn subtle tiny" onClick={stop} aria-label="Arrêter">
            ■
          </button>
        )}
      </div>
      {paused && (
        <p className="tiny-note muted">
          Reprend au début de la réplique en cours — iOS ne sait pas repartir en plein mot.
        </p>
      )}

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
        <>
          <div className="modes">
            {MODES.map((m) => (
              <button
                key={m.id}
                className={`rate${mode === m.id ? ' active' : ''}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'off' && !played && (
            <p className="muted small">Essaie une première écoute sans rien lire.</p>
          )}
        </>
      )}

      {mode === 'word' && (
        <Karaoke
          line={activeLine}
          wordIndex={wordIndex}
          playing={playing}
          estimated={boundarySupported === false}
        />
      )}

      <Transcript
        lines={lines}
        index={index}
        wordIndex={wordIndex}
        visible={mode === 'full'}
        onReplay={(i) => playLine(lines, i)}
      />
    </div>
  );
}

// One word at a time, big and centred, revealed as it's spoken. Fixed height so
// the page doesn't jump around while the words change.
function Karaoke({ line, wordIndex, playing, estimated }) {
  const words = useMemo(() => (line ? tokenize(line.text) : []), [line]);
  const current = wordIndex >= 0 && wordIndex < words.length ? words[wordIndex] : null;

  return (
    <div className="karaoke" aria-live="off">
      {line && line.speaker && <span className="karaoke-speaker">{line.speaker}</span>}
      <span className={`karaoke-word${current ? ' on' : ''}`}>
        {current ? current.text : playing ? '·' : '▶'}
      </span>
      {line && (
        <span className="karaoke-progress" aria-hidden="true">
          {words.map((_, i) => (
            <span key={i} className={`kp${i <= wordIndex ? ' done' : ''}`} />
          ))}
        </span>
      )}
      {estimated && playing && (
        <span className="karaoke-note">
          synchronisation estimée — cette voix ne signale pas les mots
        </span>
      )}
    </div>
  );
}

function Transcript({ lines, index, wordIndex, visible, onReplay }) {
  if (!visible) return null;
  return (
    <ol className="transcript">
      {lines.map((l, i) => (
        <li key={i} className={i === index ? 'active' : ''}>
          {l.speaker && <span className="speaker">{l.speaker}</span>}
          <span className="line-text">
            {i === index ? <SpokenLine text={l.text} wordIndex={wordIndex} /> : l.text}
          </span>
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

// The active line with the spoken word marked in place, so "Texte" mode still
// tells you where the voice is.
function SpokenLine({ text, wordIndex }) {
  const words = useMemo(() => tokenize(text), [text]);
  if (wordIndex < 0 || wordIndex >= words.length) return text;
  const w = words[wordIndex];
  return (
    <>
      {text.slice(0, w.start)}
      <mark className="spoken">{text.slice(w.start, w.end)}</mark>
      {text.slice(w.end)}
    </>
  );
}
