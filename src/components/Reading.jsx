import { useMemo, useState } from 'react';
import { buildIndex, lookup, normalize } from '../lib/lookup';
import { tokenize } from '../lib/tts';
import { ttsSupported, useFrenchVoices, useLineSpeaker } from '../lib/tts';

// The reading pane. Every word is tappable; the result opens in a sheet at the
// bottom of the screen rather than a tooltip, because a tooltip near the top of a
// paragraph ends up under your thumb on a phone.
//
// Words already in your deck are marked so you can see your own vocabulary
// showing up in real text — which is the whole point of the recycling.
export default function Reading({ paragraphs, glossary = [], newWords = [], cards = [], onAdd }) {
  const [sel, setSel] = useState(null); // { token, entry }
  const [manual, setManual] = useState('');

  const index = useMemo(
    () => buildIndex({ newWords, glossary, cards: Object.values(cards) }),
    [newWords, glossary, cards]
  );

  // Which normalised forms are already in the deck, for the underline.
  const known = useMemo(() => {
    const s = new Set();
    Object.values(cards).forEach((c) => {
      s.add(normalize(c.fr));
      const bare = normalize(c.fr).replace(/^(le |la |les |l'|un |une |des |du )/, '');
      s.add(bare);
    });
    return s;
  }, [cards]);

  const voices = useFrenchVoices();
  const { playLine } = useLineSpeaker({ voices, voiceURI: null, rate: 0.8 });
  const canSpeak = ttsSupported() && voices.length > 0;

  const tap = (token) => {
    const entry = lookup(token, index);
    setManual('');
    setSel({ token, entry });
  };

  const inDeck = sel && sel.entry && sel.entry.source === 'deck';
  const alreadyKnown =
    sel && (known.has(normalize(sel.token)) || (sel.entry && known.has(normalize(sel.entry.fr))));

  const addIt = (fr, en) => {
    if (!onAdd || !fr || !en) return;
    onAdd({ fr, en });
    setSel(null);
    setManual('');
  };

  return (
    <>
      <div className="reading">
        {paragraphs.map((p, i) => (
          <Paragraph key={i} text={p} index={index} known={known} onTap={tap} selected={sel} />
        ))}
      </div>

      <p className="muted small tap-note">
        Touche n’importe quel mot pour le traduire et l’ajouter à ton paquet. Les mots
        <span className="known-swatch" /> sont déjà dans ton paquet.
      </p>

      {sel && (
        <>
          <button className="sheet-scrim" onClick={() => setSel(null)} aria-label="Fermer" />
          <div className="word-sheet" role="dialog">
            <div className="sheet-head">
              <span className="sheet-word">{sel.token}</span>
              {canSpeak && (
                <button
                  className="btn subtle tiny"
                  onClick={() => playLine([{ text: sel.token }], 0)}
                  aria-label="Prononcer"
                >
                  🔈
                </button>
              )}
              <button className="sheet-close" onClick={() => setSel(null)} aria-label="Fermer">
                ✕
              </button>
            </div>

            {sel.entry ? (
              <>
                <p className="sheet-en">{sel.entry.en}</p>
                {!sel.entry.exact && (
                  <p className="muted small">
                    forme de base&nbsp;: <b>{sel.entry.fr}</b>
                  </p>
                )}
                {sel.entry.note && <p className="sheet-note">{sel.entry.note}</p>}
                <div className="sheet-meta">
                  {sel.entry.source === 'today' && 'mot du jour'}
                  {sel.entry.source === 'glossary' && 'glossaire du texte'}
                  {sel.entry.source === 'deck' && 'dans ton paquet'}
                  {sel.entry.source === 'lexicon' && 'dictionnaire intégré'}
                </div>

                {alreadyKnown || inDeck ? (
                  <p className="muted small">Déjà dans ton paquet — rien à faire.</p>
                ) : (
                  <button className="btn primary" onClick={() => addIt(sel.entry.fr, sel.entry.en)}>
                    + Ajouter au paquet
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="muted small">
                  Pas dans le dictionnaire intégré — il ne couvre que le vocabulaire courant
                  et celui des textes. Écris la traduction si tu veux garder ce mot.
                </p>
                <input
                  className="type-input"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="traduction en anglais…"
                  autoCapitalize="off"
                />
                <button
                  className="btn primary"
                  disabled={!manual.trim()}
                  onClick={() => addIt(sel.token, manual.trim())}
                >
                  + Ajouter au paquet
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// Splits a paragraph into tappable word spans and untouched punctuation, keeping
// the original text byte-for-byte so nothing is lost or duplicated.
function Paragraph({ text, index, known, onTap, selected }) {
  const parts = useMemo(() => {
    const words = tokenize(text);
    const out = [];
    let at = 0;
    words.forEach((w) => {
      if (w.start > at) out.push({ t: text.slice(at, w.start) });
      out.push({ t: w.text, word: true });
      at = w.end;
    });
    if (at < text.length) out.push({ t: text.slice(at) });
    return out;
  }, [text]);

  return (
    <p className="reading-para">
      {parts.map((p, i) => {
        if (!p.word) return <span key={i}>{p.t}</span>;
        const n = normalize(p.t);
        const hit = index.get(n);
        // Head matches are excluded here on purpose — tapping "soit" resolving to
        // "soit … soit" is a useful lookup but not a word you own, and marking
        // every such token turns the paragraph into a wall of highlights.
        const isKnown = known.has(n) || (hit && hit.source === 'deck' && !hit.head);
        const isGloss = hit && !hit.head && (hit.source === 'glossary' || hit.source === 'today');
        const active = selected && selected.token === p.t;
        // A <span>, not a <button>: a button is an atomic inline-level box, so the
        // browser takes a line break between it and the punctuation that follows
        // — leaving stray periods stranded at the start of a line. Spans flow as
        // real text.
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            className={
              'w' +
              (isKnown ? ' known' : '') +
              (isGloss ? ' gloss' : '') +
              (active ? ' active' : '')
            }
            onClick={() => onTap(p.t)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTap(p.t);
              }
            }}
          >
            {p.t}
          </span>
        );
      })}
    </p>
  );
}
