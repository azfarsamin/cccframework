"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./verse-audio.module.css";

/** Independent of analysis and text-selection state; one HTMLAudioElement per Reader. */
export type AudioSurah = { number: number; numberOfAyahs: number };
export type AudioVerse = { chapter: number; verse: number };
type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";

const CDN = "https://cdn.islamic.network/quran/audio/128/ar.alafasy";

/** The CDN uses a 1-based, Qurʾān-wide verse sequence (1–6236). */
export function globalAyahNumber(surahs: AudioSurah[], chapter: number, verse: number): number | null {
  if (surahs.length !== 114 || !Number.isInteger(chapter) || !Number.isInteger(verse) || chapter < 1 || chapter > 114) return null;
  let total = 0;
  for (let i = 0; i < 114; i++) {
    const surah = surahs[i];
    if (!surah || surah.number !== i + 1 || !Number.isInteger(surah.numberOfAyahs) || surah.numberOfAyahs < 1) return null;
    if (i < chapter - 1) total += surah.numberOfAyahs;
    if (i === chapter - 1 && (verse < 1 || verse > surah.numberOfAyahs)) return null;
  }
  // Guard against a partial / unexpected numbering scheme.
  if (surahs.reduce((sum, s) => sum + s.numberOfAyahs, 0) !== 6236) return null;
  return total + verse;
}

export function adjacentAudioVerse(surahs: AudioSurah[], current: AudioVerse, direction: -1 | 1): AudioVerse | null {
  if (globalAyahNumber(surahs, current.chapter, current.verse) === null) return null;
  const size = surahs[current.chapter - 1].numberOfAyahs;
  if (direction === 1) {
    if (current.verse < size) return { chapter: current.chapter, verse: current.verse + 1 };
    return current.chapter < 114 ? { chapter: current.chapter + 1, verse: 1 } : null;
  }
  if (current.verse > 1) return { chapter: current.chapter, verse: current.verse - 1 };
  return current.chapter > 1 ? { chapter: current.chapter - 1, verse: surahs[current.chapter - 2].numberOfAyahs } : null;
}

function isSameVerse(a: AudioVerse | null, b: AudioVerse): boolean {
  return !!a && a.chapter === b.chapter && a.verse === b.verse;
}
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function useQuranVerseAudio(surahs: AudioSurah[]) {
  const element = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<AudioVerse | null>(null);
  // Disregard rejections from older play() calls after a user chooses another verse.
  const intent = useRef(0);
  const wantsPlayback = useRef(false);
  const [current, setCurrent] = useState<AudioVerse | null>(null);
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const [error, setError] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  const ready = globalAyahNumber(surahs, 1, 1) !== null;

  const resume = useCallback((audio: HTMLAudioElement, sequence: number) => {
    wantsPlayback.current = true;
    setError("");
    setStatus("loading");
    void audio.play().then(() => {
      if (sequence === intent.current) setStatus("playing");
    }).catch(() => {
      if (sequence === intent.current) {
        wantsPlayback.current = false;
        setStatus("error");
        setError("Could not play this recording. Check your connection or press Play again.");
      }
    });
  }, []);

  const playVerse = useCallback((next: AudioVerse, toggleIfSame = true) => {
    const audio = element.current;
    if (!audio) return;
    const global = globalAyahNumber(surahs, next.chapter, next.verse);
    if (global === null) {
      setError("Qurʾān verse index is not ready. Try again after the surah list loads.");
      setStatus("error");
      return;
    }
    if (toggleIfSame && isSameVerse(currentRef.current, next)) {
      if (wantsPlayback.current) {
        wantsPlayback.current = false;
        intent.current++;
        audio.pause();
        setStatus("paused");
      } else resume(audio, ++intent.current);
      return;
    }
    const sequence = ++intent.current;
    audio.pause();
    currentRef.current = next;
    setCurrent(next);
    setPosition(0);
    setDuration(0);
    setError("");
    audio.src = `${CDN}/${global}.mp3`;
    audio.playbackRate = speed;
    audio.load();
    resume(audio, sequence);
  }, [resume, speed, surahs]);

  useEffect(() => {
    const audio = element.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime || 0);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlaying = () => { setStatus("playing"); setError(""); };
    const onWaiting = () => setStatus("loading");
    const onPause = () => {
      if (currentRef.current && !audio.ended) setStatus(previous => previous === "error" ? previous : "paused");
    };
    const onError = () => {
      wantsPlayback.current = false;
      setStatus("error");
      setError("Mishary's recording could not be loaded. Check the connection and try again.");
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const audio = element.current;
    if (!audio) return;
    const onEnded = () => {
      const verse = currentRef.current;
      if (!verse) return;
      if (repeat) {
        audio.currentTime = 0;
        resume(audio, ++intent.current);
        return;
      }
      const next = continuous ? adjacentAudioVerse(surahs, verse, 1) : null;
      if (next) playVerse(next, false);
      else { wantsPlayback.current = false; setStatus("paused"); }
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [continuous, playVerse, repeat, resume, surahs]);

  const changeSpeed = useCallback((value: number) => {
    if (![0.75, 1, 1.25].includes(value)) return;
    setSpeed(value);
    if (element.current) element.current.playbackRate = value;
  }, []);
  const seek = useCallback((value: number) => {
    const audio = element.current;
    if (!audio || !Number.isFinite(audio.duration) || !Number.isFinite(value)) return;
    audio.currentTime = Math.max(0, Math.min(value, audio.duration));
    setPosition(audio.currentTime);
  }, []);
  const stop = useCallback(() => {
    intent.current++;
    wantsPlayback.current = false;
    const audio = element.current;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); }
    currentRef.current = null;
    setCurrent(null);
    setPosition(0);
    setDuration(0);
    setError("");
    setStatus("idle");
  }, []);
  const move = useCallback((direction: -1 | 1) => {
    if (!currentRef.current) return;
    const next = adjacentAudioVerse(surahs, currentRef.current, direction);
    if (next) playVerse(next, false);
  }, [playVerse, surahs]);

  return {
    audioRef: element, ready, current, status, error, repeat, setRepeat,
    continuous, setContinuous, speed, changeSpeed, position, duration,
    playVerse, seek, stop, move,
    isActive: (chapter: number, verse: number) => isSameVerse(current, { chapter, verse }),
  };
}

export type QuranAudioController = ReturnType<typeof useQuranVerseAudio>;

export function VerseAudioButton({ audio, chapter, verse }: { audio: QuranAudioController; chapter: number; verse: number }) {
  const active = audio.isActive(chapter, verse);
  const playing = active && (audio.status === "playing" || audio.status === "loading");
  return <button
    type="button"
    className={`${styles.verseButton} ${active ? styles.verseButtonActive : ""}`}
    disabled={!audio.ready}
    aria-label={`${playing ? "Pause" : "Play"} Mishary Alafasy recitation of ${chapter}:${verse}`}
    aria-pressed={playing}
    title={!audio.ready ? "Loading verse audio index" : `${playing ? "Pause" : "Play"} recitation — ${chapter}:${verse}`}
    onClick={() => audio.playVerse({ chapter, verse })}
  >{playing ? "Ⅱ" : "▶"}<span className={styles.buttonLabel}> Listen</span></button>;
}

export function VerseAudioDock({ audio, goToVerse }: {
  audio: QuranAudioController;
  goToVerse: (chapter: number, verse: number) => void;
}) {
  const current = audio.current;
  const playing = audio.status === "playing" || audio.status === "loading";
  return <section className={styles.dock} aria-label="Qurʾān verse recitation">
    <audio ref={audio.audioRef} preload="none" aria-label="Mishary Rashid Alafasy verse recitation" />
    <div className={styles.topLine}>
      <div className={styles.identity}><strong>Verse recitation</strong><span>Mishary Rashid Alafasy</span></div>
      <div className={styles.nowPlaying} aria-live="polite">{current ? `Now playing ${current.chapter}:${current.verse}` : "Choose ▶ beside any verse"}</div>
    </div>
    <div className={styles.transport}>
      <button type="button" aria-label="Previous verse" title="Previous verse" onClick={() => audio.move(-1)} disabled={!current || !audio.ready}>⏮</button>
      <button type="button" aria-label={playing ? "Pause recitation" : "Play or resume recitation"} title={playing ? "Pause" : "Play"} disabled={!current || !audio.ready} onClick={() => { if (current) audio.playVerse(current); }}>{playing ? "Ⅱ" : "▶"}</button>
      <button type="button" aria-label="Next verse" title="Next verse" onClick={() => audio.move(1)} disabled={!current || !audio.ready}>⏭</button>
      <button type="button" aria-label="Stop recitation" title="Stop" onClick={audio.stop} disabled={!current}>■</button>
      <span className={styles.timer}>{formatTime(audio.position)}</span>
      <input className={styles.progress} type="range" aria-label="Recitation playback position" min={0} max={audio.duration || 1} step={0.1}
        value={audio.duration > 0 ? Math.min(audio.position, audio.duration) : 0}
        disabled={!current || audio.duration <= 0} onChange={event => audio.seek(Number(event.target.value))} />
      <span className={styles.timer}>{formatTime(audio.duration)}</span>
    </div>
    <div className={styles.options}>
      <label>Speed <select aria-label="Recitation playback speed" value={audio.speed} onChange={event => audio.changeSpeed(Number(event.target.value))}>
        <option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option>
      </select></label>
      <button type="button" className={audio.repeat ? styles.enabled : ""} aria-pressed={audio.repeat} onClick={() => audio.setRepeat(!audio.repeat)} title="Repeat this verse">Repeat verse {audio.repeat ? "✓" : ""}</button>
      <button type="button" className={audio.continuous ? styles.enabled : ""} aria-pressed={audio.continuous} onClick={() => audio.setContinuous(!audio.continuous)} title="Continue to the next verse automatically">Continuous {audio.continuous ? "✓" : ""}</button>
      {current && <button type="button" onClick={() => goToVerse(current.chapter, current.verse)} title="Open the playing verse in the Reader">Open {current.chapter}:{current.verse}</button>}
    </div>
    {audio.error && <p className={styles.error} role="alert">{audio.error}</p>}
    <p className={styles.credit}>Streamed on demand from <a href="https://alquran.cloud/cdn" target="_blank" rel="noreferrer">Al Quran Cloud</a> · <code>ar.alafasy</code>. Playback needs internet access. Verse audio and translation remain separate.</p>
  </section>;
}
