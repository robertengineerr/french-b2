// Text-to-speech over the Web Speech API.
//
// Why this instead of generated audio files: it needs no API key, no server, no
// download, it works offline once the page is cached, and iOS ships genuinely
// good French voices (Thomas, Amélie, Audrey). The trade-off is that it reads
// rather than performs — fine for comprehension practice, and the speed control
// is worth more than the acting.
//
// Safari/iOS quirks handled below:
//   - the voice list is empty until `voiceschanged` fires, sometimes twice
//   - speech must start inside a user gesture (our play button qualifies)
//   - you must cancel() before a new speak() or utterances queue up silently
//   - onend occasionally never fires, so a watchdog advances the queue

import { useCallback, useEffect, useRef, useState } from 'react';

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

export function ttsSupported() {
  return !!synth && typeof window.SpeechSynthesisUtterance === 'function';
}

export function useFrenchVoices() {
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    if (!synth) return;
    const read = () => {
      const all = synth.getVoices() || [];
      const fr = all.filter((v) => (v.lang || '').toLowerCase().startsWith('fr'));
      // Prefer local (on-device) voices: they work offline and don't stutter.
      fr.sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name));
      setVoices(fr);
    };
    read();
    synth.addEventListener('voiceschanged', read);
    // Safari sometimes populates the list a beat after load without firing the event.
    const t = setTimeout(read, 400);
    return () => {
      synth.removeEventListener('voiceschanged', read);
      clearTimeout(t);
    };
  }, []);

  return voices;
}

// Rough spoken duration, used to show a length estimate before you press play
// and as the watchdog timeout. French runs about 180 words/minute at rate 1.
export function estimateSeconds(lines, rate = 1) {
  const words = lines.reduce((n, l) => n + String(l.text || l).trim().split(/\s+/).length, 0);
  return Math.round((words / 180) * 60 / Math.max(0.5, rate));
}

// Plays an array of { speaker, text } lines in order, reporting the active index
// so the transcript can follow along.
export function useLineSpeaker({ voices, voiceURI, rate = 0.9 }) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const linesRef = useRef([]);
  const cursorRef = useRef(0);
  const watchdogRef = useRef(null);
  const tickRef = useRef(null);
  const stoppedRef = useRef(true);
  const doneRef = useRef(null);

  const clearTimers = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    watchdogRef.current = null;
    tickRef.current = null;
  };

  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimers();
    if (synth) synth.cancel();
    setPlaying(false);
    setIndex(-1);
    cursorRef.current = 0;
  }, []);

  // Two voices so a dialogue doesn't sound like one person talking to themselves.
  const voiceFor = useCallback(
    (speaker) => {
      if (!voices.length) return null;
      const chosen = voiceURI ? voices.find((v) => v.voiceURI === voiceURI) : null;
      const primary = chosen || voices[0];
      if (!speaker || voices.length < 2) return primary;
      const speakers = [...new Set(linesRef.current.map((l) => l.speaker).filter(Boolean))];
      const slot = speakers.indexOf(speaker);
      if (slot <= 0) return primary;
      const alt = voices.find((v) => v.voiceURI !== primary.voiceURI);
      return slot % 2 === 1 && alt ? alt : primary;
    },
    [voices, voiceURI]
  );

  const speakFrom = useCallback(
    (i) => {
      if (!synth || stoppedRef.current) return;
      const lines = linesRef.current;
      if (i >= lines.length) {
        clearTimers();
        setPlaying(false);
        setIndex(-1);
        cursorRef.current = 0;
        stoppedRef.current = true;
        if (doneRef.current) doneRef.current();
        return;
      }

      cursorRef.current = i;
      setIndex(i);

      const line = lines[i];
      const u = new window.SpeechSynthesisUtterance(line.text);
      u.lang = 'fr-FR';
      u.rate = rate;
      const v = voiceFor(line.speaker);
      if (v) u.voice = v;
      // A hair of pitch variation helps tell two speakers apart even when only
      // one French voice is installed.
      const speakers = [...new Set(lines.map((l) => l.speaker).filter(Boolean))];
      u.pitch = speakers.indexOf(line.speaker) % 2 === 1 ? 1.08 : 0.96;

      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        speakFrom(i + 1);
      };

      u.onend = advance;
      u.onerror = advance;

      // If onend never fires (a known Safari bug), move on anyway.
      const budget = (estimateSeconds([line], rate) + 4) * 1000;
      watchdogRef.current = setTimeout(advance, budget);

      synth.cancel(); // required before speak() on Safari
      synth.speak(u);
    },
    [rate, voiceFor]
  );

  const play = useCallback(
    (lines, onDone) => {
      if (!synth || !lines || !lines.length) return;
      stop();
      linesRef.current = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
      doneRef.current = onDone || null;
      stoppedRef.current = false;
      setPlaying(true);
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      speakFrom(0);
    },
    [speakFrom, stop]
  );

  // Jump straight to one line — used by the per-line replay buttons.
  const playLine = useCallback(
    (lines, i) => {
      if (!synth) return;
      stop();
      linesRef.current = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
      doneRef.current = null;
      stoppedRef.current = false;
      setPlaying(true);
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      // Speak this one line, then stop rather than continuing the dialogue.
      const single = [linesRef.current[i]];
      const rest = linesRef.current;
      linesRef.current = single;
      setIndex(0);
      speakFrom(0);
      linesRef.current = rest;
    },
    [speakFrom, stop]
  );

  const resetElapsed = useCallback(() => setElapsed(0), []);

  useEffect(() => stop, [stop]);

  // If the tab goes away mid-playback, iOS suspends speech in a state it can't
  // resume from. Cleaner to stop and let the user press play again.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [stop]);

  return { play, playLine, stop, playing, index, elapsed, resetElapsed };
}
