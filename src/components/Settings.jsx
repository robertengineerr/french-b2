import { useRef, useState } from 'react';
import { dayKey, freshState, STORAGE_KEY } from '../engine';
import { downloadReminder } from '../lib/ics';
import { useFrenchVoices } from '../lib/tts';
import { aiState, callsToday, fmt, MODELS, monthKey, spentThisMonth } from '../lib/claude';

export default function Settings({ state, update, setState }) {
  const voices = useFrenchVoices();
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showKey, setShowKey] = useState(false);
  const fileRef = useRef(null);
  const today = dayKey();

  const set = (key, value) =>
    update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));

  const ai = aiState(state);
  const setAI = (key, value) =>
    update((s) => ({ ...s, ai: { ...aiState(s), [key]: value } }));
  const spent = spentThisMonth(state, today);
  const pctSpent = Math.min(100, (spent / ai.capUSD) * 100);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parcours-b2-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !parsed.cards) throw new Error('fichier inattendu');
        setState(parsed);
        setMsg('Progression restaurée.');
      } catch (e) {
        setMsg(`Import impossible : ${e.message}`);
      }
    };
    reader.readAsText(file);
  };

  const standalone =
    typeof window !== 'undefined' &&
    (window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches);

  return (
    <>
      <div className="card">
        <h2>Audio</h2>

        <label className="field">
          <span>Voix française</span>
          <select
            value={state.settings.voiceURI || ''}
            onChange={(e) => set('voiceURI', e.target.value || null)}
          >
            <option value="">Automatique</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
                {v.localService ? '' : ' (en ligne)'}
              </option>
            ))}
          </select>
        </label>
        {voices.length === 0 ? (
          <p className="warn small">
            Aucune voix française détectée. Sur iPhone : Réglages → Accessibilité → Contenu
            énoncé → Voix → Français, puis télécharge une voix (Thomas ou Audrey).
          </p>
        ) : (
          <p className="muted small">
            {voices.length} voix disponible{voices.length > 1 ? 's' : ''}. Les voix locales
            fonctionnent hors ligne ; deux voix différentes servent à distinguer les
            interlocuteurs d’un dialogue.
          </p>
        )}

        <label className="field checkbox">
          <input
            type="checkbox"
            checked={state.settings.autoPlay !== false}
            onChange={(e) => set('autoPlay', e.target.checked)}
          />
          <span>Lancer l’audio automatiquement</span>
        </label>
        <p className="muted small">
          Décoche pour que les cartes d’écoute ne parlent que si tu touches 🔈 — utile au
          bureau, où une carte qui se met à parler toute seule est le problème. Le lecteur du
          défi se met en pause avec ❚❚ et reprend au début de la réplique en cours.
        </p>

        <label className="field">
          <span>Vitesse par défaut · {state.settings.rate.toFixed(2)}×</span>
          <input
            type="range"
            min="0.6"
            max="1.2"
            step="0.05"
            value={state.settings.rate}
            onChange={(e) => set('rate', Number(e.target.value))}
          />
        </label>
      </div>

      <div className="card">
        <h2>Révisions</h2>
        <label className="field">
          <span>Cartes par session · {state.settings.reviewsPerSession}</span>
          <input
            type="range"
            min="5"
            max="60"
            step="5"
            value={state.settings.reviewsPerSession}
            onChange={(e) => set('reviewsPerSession', Number(e.target.value))}
          />
        </label>
        <p className="muted small">
          20 cartes prennent environ quatre minutes. Au-delà de 40, la qualité des réponses
          baisse plus vite que le nombre de cartes n’augmente.
        </p>
      </div>

      <div className="card">
        <h2>Correction IA (facultatif)</h2>
        <p className="muted small">
          Avec une clé API Anthropic, un modèle relit tes réponses écrites — grammaire{' '}
          <i>et</i> fluidité — et traduit les mots que le dictionnaire intégré ne connaît pas.
          Sans clé, rien ne change : l’auto-évaluation et l’ajout manuel continuent de marcher.
        </p>

        <label className="field">
          <span>Clé API</span>
          <div className="key-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={ai.key}
              onChange={(e) => setAI('key', e.target.value.trim())}
              placeholder="sk-ant-…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn subtle tiny" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'cacher' : 'voir'}
            </button>
          </div>
        </label>
        <p className="muted small">
          Elle est stockée dans ce navigateur, comme le reste, et envoyée directement à
          l’API — il n’y a pas de serveur intermédiaire. Ce qui veut dire qu’elle est lisible
          par ce navigateur&nbsp;: utilise une clé dédiée à cette app, avec sa propre limite de
          dépenses côté Anthropic, et pas ta clé principale.
        </p>

        <label className="field">
          <span>Modèle</span>
          <select value={ai.model} onChange={(e) => setAI('model', e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.blurb}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Plafond mensuel · ${ai.capUSD.toFixed(2)}</span>
          <input
            type="range"
            min="0.5"
            max="20"
            step="0.5"
            value={ai.capUSD}
            onChange={(e) => setAI('capUSD', Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Appels maximum par jour · {ai.dailyCalls}</span>
          <input
            type="range"
            min="5"
            max="100"
            step="5"
            value={ai.dailyCalls}
            onChange={(e) => setAI('dailyCalls', Number(e.target.value))}
          />
        </label>

        <div className="spend">
          <p className="small">
            <b>{fmt(spent)}</b> dépensés en {monthKey(today)} sur {fmt(ai.capUSD)} ·{' '}
            {callsToday(state, today)} appel{callsToday(state, today) > 1 ? 's' : ''} aujourd’hui
          </p>
          <div className="spend-bar">
            {/* A hair of width even at zero, so an empty meter still reads as a
                meter rather than as another slider with a missing thumb. */}
            <span
              style={{ width: `${Math.max(pctSpent, 1.5)}%` }}
              className={pctSpent > 80 ? 'hot' : ''}
            />
          </div>
        </div>
        <p className="muted small">
          Le compteur utilise les jetons réellement facturés, pas une estimation. Au plafond,
          les appels sont refusés — l’app continue de fonctionner sans eux. Une correction
          coûte typiquement moins d’un centime, donc {fmt(ai.capUSD)} par mois est déjà
          beaucoup. Mets aussi une limite sur la clé dans la console Anthropic&nbsp;: celle-là,
          vider le navigateur ne l’efface pas.
        </p>

        <div className="row">
          <button
            className={ai.enabled ? 'btn' : 'btn primary'}
            onClick={() => setAI('enabled', !ai.enabled)}
          >
            {ai.enabled ? 'Désactiver l’IA' : 'Réactiver l’IA'}
          </button>
          <button
            className="btn subtle"
            onClick={() => {
              setAI('spend', {});
              setMsg('Compteur de dépenses remis à zéro (ça n’annule pas la facture).');
            }}
          >
            Remettre le compteur à zéro
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Images des cartes (facultatif)</h2>
        <p className="muted small">
          Avec une clé Pexels (gratuite, <code>pexels.com/api</code>), l’app propose six images
          quand tu ajoutes un mot, et tu en choisis une — ou aucune. L’image choisie est
          téléchargée sur l’appareil, donc elle marche hors ligne.
        </p>
        <label className="field">
          <span>Clé API Pexels</span>
          <input
            type="password"
            value={ai.imageKey || ''}
            onChange={(e) => setAI('imageKey', e.target.value.trim())}
            placeholder="laisser vide pour désactiver"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <p className="muted small">
          Beaucoup de mots ne se photographient pas — «&nbsp;abordable&nbsp;» et
          «&nbsp;bon marché&nbsp;» ne se distinguent pas en image. Si ta clé Claude est
          configurée, le choix n’est proposé que pour les mots où une photo aide vraiment.
        </p>
        <p className="tiny-note muted">
          Ces images vivent dans une base séparée du navigateur, pas dans l’export JSON&nbsp;:
          changer de téléphone garde tout ton vocabulaire mais pas les images.
        </p>
      </div>

      <div className="card">
        <h2>Rappel quotidien</h2>
        <p className="muted small">
          iOS ne laisse pas une app web programmer une notification à heure fixe. Le moyen
          fiable est un événement récurrent dans ton calendrier, avec alerte — il marche hors
          ligne, survit à une réinstallation, et tu peux changer l’heure directement dans
          Calendrier.
        </p>
        <label className="field">
          <span>Heure du rappel</span>
          <input
            type="time"
            value={state.settings.reminderTime}
            onChange={(e) => set('reminderTime', e.target.value)}
          />
        </label>
        <button
          className="btn primary"
          onClick={() => downloadReminder(state.settings.reminderTime, window.location.href)}
        >
          Télécharger le rappel (.ics)
        </button>
        <p className="muted small">
          Ouvre le fichier téléchargé → « Ajouter tout ». Il crée un événement quotidien
          « Défi de français » avec une alerte à l’heure choisie.
        </p>
      </div>

      {!standalone && (
        <div className="card">
          <h2>Installer sur l’iPhone</h2>
          <ol className="steps-list">
            <li>Ouvre cette page dans <b>Safari</b> (pas Chrome — l’ajout à l’écran d’accueil lui est réservé).</li>
            <li>Touche le bouton <b>Partager</b> (le carré avec une flèche).</li>
            <li>Choisis <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
          </ol>
          <p className="muted small">
            L’app s’ouvre alors en plein écran, sans barre d’adresse, et fonctionne hors ligne.
          </p>
        </div>
      )}

      <div className="card">
        <h2>Sauvegarde</h2>
        <p className="muted small">
          Toute ta progression vit dans le navigateur de cet appareil. Rien n’est envoyé
          ailleurs — ce qui veut dire aussi que vider les données de Safari l’effacerait.
          Exporte de temps en temps.
        </p>
        <div className="row">
          <button className="btn" onClick={exportJSON}>
            Exporter
          </button>
          <button className="btn" onClick={() => fileRef.current && fileRef.current.click()}>
            Importer
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => e.target.files[0] && importJSON(e.target.files[0])}
        />
        {msg && <p className="small">{msg}</p>}
      </div>

      <div className="card danger-zone">
        <h2>Tout remettre à zéro</h2>
        <p className="muted small">
          Efface la progression, les séries et l’état des cartes, et recharge le paquet de
          départ. Irréversible.
        </p>
        {!confirmReset ? (
          <button className="btn bad" onClick={() => setConfirmReset(true)}>
            Réinitialiser…
          </button>
        ) : (
          <div className="row">
            <button
              className="btn bad"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                setState(freshState());
                setConfirmReset(false);
                setMsg('Réinitialisé.');
              }}
            >
              Oui, tout effacer
            </button>
            <button className="btn" onClick={() => setConfirmReset(false)}>
              Annuler
            </button>
          </div>
        )}
      </div>

      <div className="card muted small about">
        <p>
          <b>Comment l’adaptation marche.</b> Chaque quiz fait bouger un score de 0 à 100. Le
          score détermine la difficulté du défi servi le lendemain, et la cible est 75–85 % de
          réussite : au-dessus ça monte, en dessous ça descend. Les cartes suivent un
          algorithme de type SM-2 — un rappel réussi allonge l’intervalle, un oubli le remet
          presque à zéro.
        </p>
      </div>
    </>
  );
}
