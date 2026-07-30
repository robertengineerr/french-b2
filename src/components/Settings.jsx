import { useRef, useState } from 'react';
import { freshState, STORAGE_KEY } from '../engine';
import { downloadReminder } from '../lib/ics';
import { useFrenchVoices } from '../lib/tts';

export default function Settings({ state, update, setState }) {
  const voices = useFrenchVoices();
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const set = (key, value) =>
    update((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));

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
