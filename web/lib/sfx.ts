// Synthesised sound effects (Web Audio). No audio files.
// Off until the user turns sound on: browsers only allow audio after a
// gesture, and a trading screen shouldn't start making noise uninvited.

import { audioContext } from "./audio";
import { duckMusic } from "./music";

export type Sfx = "bell" | "siren" | "cheer" | "chime" | "gong" | "drop";

const audio = audioContext;

/** Call from a click handler so the browser lets audio start. */
export function unlockAudio() {
  audio();
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(a.destination);
  o.start(start);
  o.stop(start + dur + 0.05);
}

function noise(a: AudioContext, start: number, dur: number, gain: number, band: number) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.3 ? 1 : 0.3); // clappy texture
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = band;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(start);
}

export function play(kind: Sfx) {
  const a = audio();
  if (!a) return;
  duckMusic(kind === "chime" ? 1.2 : 3.5); // any music steps back so the alert is heard
  const t = a.currentTime + 0.02;
  switch (kind) {
    case "bell": // the opening/closing bell: three strikes of a bright, inharmonic bell
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.55;
        for (const [ratio, g] of [[1, 0.18], [2.76, 0.08], [5.4, 0.04], [8.93, 0.02]] as const) tone(a, 880 * ratio, s, 1.6, "sine", g);
      }
      break;
    case "siren": // FORCE FLAT
      for (let i = 0; i < 4; i++) {
        tone(a, 660, t + i * 0.5, 0.24, "square", 0.05);
        tone(a, 880, t + i * 0.5 + 0.25, 0.24, "square", 0.05);
      }
      break;
    case "cheer": // rally applause
      noise(a, t, 1.8, 0.25, 2400);
      tone(a, 523, t, 0.15, "triangle", 0.08);
      tone(a, 659, t + 0.12, 0.15, "triangle", 0.08);
      tone(a, 784, t + 0.24, 0.3, "triangle", 0.08);
      break;
    case "chime": // a message delivered
      tone(a, 1318, t, 0.25, "sine", 0.07);
      tone(a, 1760, t + 0.1, 0.35, "sine", 0.06);
      break;
    case "gong": // war room
      tone(a, 110, t, 2.5, "sine", 0.2);
      tone(a, 220 * 1.48, t, 1.8, "sine", 0.06);
      break;
    case "drop": // sell-off
      for (let i = 0; i < 3; i++) tone(a, 392 / (1 + i * 0.25), t + i * 0.18, 0.3, "sawtooth", 0.05);
      break;
  }
}
