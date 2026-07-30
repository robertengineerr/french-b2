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
//   - `boundary` events are unreliable, so word timing falls back to estimates

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

// Splits a line into words with their character offsets, so a `boundary` event's
// charIndex can be mapped back to which word is being spoken. Keeps apostrophes
// and hyphens inside the word — «quelques-uns» and «l'école» are one word each.
export function tokenize(text) {
  const out = [];
  const re = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

// Plays an array of { speaker, text } lines in order, reporting the active line
// and — for karaoke captions — the active word within it.
export function useLineSpeaker({ voices, voiceURI, rate = 0.9, trackWords = false }) {
  const [index, setIndex] = useState(-1);
  const [wordIndex, setWordIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Whether the browser actually delivered boundary events. Drives the UI's
  // decision to trust real timing vs. the estimated fallback.
  const [boundarySupported, setBoundarySupported] = useState(null);

  const linesRef = useRef([]);
  const cursorRef = useRef(0);
  const watchdogRef = useRef(null);
  const tickRef = useRef(null);
  const fallbackRef = useRef([]);
  const stoppedRef = useRef(true);
  const doneRef = useRef(null);
  const gotBoundaryRef = useRef(false);
  // Which line to pick up from. Null means nothing is paused.
  const pausedAtRef = useRef(null);

  const clearFallback = () => {
    fallbackRef.current.forEach((id) => clearTimeout(id));
    fallbackRef.current = [];
  };

  const clearTimers = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    watchdogRef.current = null;
    tickRef.current = null;
    clearFallback();
  };

  const stop = useCallback(() => {
    stoppedRef.current = true;
    pausedAtRef.current = null;
    clearTimers();
    if (synth) synth.cancel();
    setPlaying(false);
    setPaused(false);
    setIndex(-1);
    setWordIndex(-1);
    cursorRef.current = 0;
  }, []);

  // Pause is implemented as "cancel, and remember which sentence we were on",
  // not as speechSynthesis.pause().
  //
  // The native pause/resume pair is unreliable on iOS — it can leave speech in a
  // state that never resumes, which is why this hook already stops playback when
  // the tab is hidden. Cancelling is the one thing that always works, and the
  // cost of rebuilding from a remembered cursor is that resuming replays the
  // current sentence from its start rather than mid-word. For listening practice
  // that's arguably the better behaviour: you hear the whole sentence again,
  // which is what you wanted anyway if something interrupted you.
  const pause = useCallback(() => {
    if (!synth || stoppedRef.current) return;
    pausedAtRef.current = cursorRef.current;
    stoppedRef.current = true; // stops speakFrom's onend chain from advancing
    clearTimers(); // also stops the elapsed tick, so paused time isn't counted
    synth.cancel();
    setPlaying(false);
    setPaused(true);
    setWordIndex(-1);
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

  // When `boundary` never fires — Safari does this intermittently — reveal words
  // on a schedule weighted by length, so the caption still tracks roughly.
  const scheduleEstimatedWords = useCallback(
    (words, seconds) => {
      clearFallback();
      const chars = words.reduce((n, w) => n + w.text.length, 0) || 1;
      let acc = 0;
      words.forEach((w, i) => {
        const at = (acc / chars) * seconds * 1000;
        acc += w.text.length;
        fallbackRef.current.push(
          setTimeout(() => {
            // A real boundary event always wins over the estimate.
            if (!gotBoundaryRef.current) setWordIndex(i);
          }, at)
        );
      });
    },
    []
  );

  const speakFrom = useCallback(
    (i) => {
      if (!synth || stoppedRef.current) return;
      const lines = linesRef.current;
      if (i >= lines.length) {
        clearTimers();
        setPlaying(false);
        setIndex(-1);
        setWordIndex(-1);
        cursorRef.current = 0;
        stoppedRef.current = true;
        if (doneRef.current) doneRef.current();
        return;
      }

      cursorRef.current = i;
      setIndex(i);
      setWordIndex(-1);

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

      if (trackWords) {
        const words = tokenize(line.text);
        u.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          gotBoundaryRef.current = true;
          if (boundarySupported !== true) setBoundarySupported(true);
          clearFallback();
          const ci = e.charIndex || 0;
          // Last word whose start is at or before the reported index.
          let hit = -1;
          for (let k = 0; k < words.length; k++) {
            if (words[k].start <= ci) hit = k;
            else break;
          }
          if (hit >= 0) setWordIndex(hit);
        };
        // Give boundary events a moment; if none arrive, fall back to estimates.
        const secs = estimateSeconds([line], rate);
        fallbackRef.current.push(
          setTimeout(() => {
            if (!gotBoundaryRef.current) {
              setBoundarySupported(false);
              scheduleEstimatedWords(words, secs);
            }
          }, 350)
        );
      }

      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        clearFallback();
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
    [rate, voiceFor, trackWords, boundarySupported, scheduleEstimatedWords]
  );

  const play = useCallback(
    (lines, onDone) => {
      if (!synth || !lines || !lines.length) return;
      stop();
      linesRef.current = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
      doneRef.current = onDone || null;
      stoppedRef.current = false;
      gotBoundaryRef.current = false;
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
      const all = lines.map((l) => (typeof l === 'string' ? { text: l } : l));
      linesRef.current = [all[i]];
      doneRef.current = null;
      stoppedRef.current = false;
      gotBoundaryRef.current = false;
      setPlaying(true);
      tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      speakFrom(0);
    },
    [speakFrom, stop]
  );

  const resume = useCallback(() => {
    if (!synth || pausedAtRef.current === null) return;
    const from = pausedAtRef.current;
    pausedAtRef.current = null;
    stoppedRef.current = false;
    gotBoundaryRef.current = false;
    setPaused(false);
    setPlaying(true);
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    speakFrom(from);
  }, [speakFrom]);

  const resetElapsed = useCallback(() => setElapsed(0), []);

  useEffect(() => stop, [stop]);

  // If the tab goes away mid-playback, iOS suspends speech in a state it can't
  // resume from — so playback has to end. But *pause* rather than stop, so the
  // place is kept: switching apps for ten seconds shouldn't cost you the whole
  // listen, which is exactly what happens if you're doing this between other
  // things.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [pause]);

  return {
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
  };
}
