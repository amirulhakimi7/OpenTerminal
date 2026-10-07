// Background music, synthesised live with Web Audio: no audio files, nothing
// licensed. A small sequencer plays lo-fi / chiptune loops — pads, bass,
// drums, a square-wave lead, a ticking pulse, vinyl hiss — and the floor picks
// a mood from what the market is doing. Moods change on the next bar, so the
// music turns rather than cuts. Sound effects duck it so alerts stay clear.

import { audioContext } from "./audio";

export type Mood =
  | "tower-night" | "tower-day" | "tower-dawn" | "tower-dusk"
  | "floor-calm" | "floor-open" | "floor-rally" | "floor-tension"
  | "floor-warroom" | "floor-flat" | "floor-closed";

type Song = {
  bpm: number;
  swing: number; // 0..0.3: how late the off-beat 16ths land (lo-fi lilt)
  chords: number[][]; // one chord per bar, MIDI notes, root first
  pad: { wave: OscillatorType; gain: number; cutoff: number };
  bass: { steps: number[]; gain: number } | null; // steps in a 16-step bar
  kick: number[] | null;
  snare: number[] | null;
  hat: number[] | null;
  lead: { wave: OscillatorType; gain: number; every: number; chance: number; octave: number } | null;
  pulse: { freq: number; every: number; gain: number } | null;
  hiss: number; // vinyl crackle level, 0 = off
};

// Chords (MIDI). City-pop sevenths for the skyline, lo-fi ii-V-I for the floor,
// minor for trouble.
const NIGHT = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
const DAY = [[48, 52, 55, 59], [55, 59, 62, 66], [57, 60, 64, 67], [53, 57, 60, 64]]; // Cmaj7 Gmaj7 Am7 Fmaj7
const SOFT = [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]]; // Fmaj7 G7 Em7 Am7
const LOFI = [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [57, 60, 64, 67]]; // Dm7 G7 Cmaj7 Am7
const BRIGHT = [[48, 52, 55, 60], [53, 57, 60, 65], [55, 59, 62, 67], [53, 57, 60, 65]]; // C F G F
const DARK = [[45, 48, 52, 57], [41, 45, 48, 53], [50, 53, 57, 62], [52, 56, 59, 64]]; // Am F Dm E
const STILL = [[45, 48, 52, 57], [45, 48, 52, 57], [41, 45, 48, 53], [41, 45, 48, 53]]; // Am Am F F

const SONGS: Record<Mood, Song> = {
  "tower-night": {
    bpm: 82, swing: 0.12, chords: NIGHT,
    pad: { wave: "sawtooth", gain: 0.05, cutoff: 1100 },
    bass: { steps: [0, 6, 10], gain: 0.16 },
    kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
    lead: { wave: "square", gain: 0.035, every: 2, chance: 0.45, octave: 12 },
    pulse: null, hiss: 0.012,
  },
  "tower-day": {
    bpm: 98, swing: 0.05, chords: DAY,
    pad: { wave: "triangle", gain: 0.06, cutoff: 2400 },
    bass: { steps: [0, 4, 8, 11, 14], gain: 0.15 },
    kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    lead: { wave: "square", gain: 0.035, every: 2, chance: 0.6, octave: 24 },
    pulse: null, hiss: 0,
  },
  "tower-dawn": {
    bpm: 76, swing: 0.1, chords: SOFT,
    pad: { wave: "triangle", gain: 0.07, cutoff: 1600 },
    bass: { steps: [0, 8], gain: 0.12 },
    kick: null, snare: null, hat: [4, 12],
    lead: { wave: "triangle", gain: 0.05, every: 4, chance: 0.5, octave: 24 },
    pulse: null, hiss: 0.008,
  },
  "tower-dusk": {
    bpm: 84, swing: 0.14, chords: SOFT,
    pad: { wave: "sawtooth", gain: 0.05, cutoff: 1300 },
    bass: { steps: [0, 7, 10], gain: 0.14 },
    kick: [0, 10], snare: [4, 12], hat: [2, 6, 10, 14],
    lead: { wave: "square", gain: 0.03, every: 2, chance: 0.4, octave: 12 },
    pulse: null, hiss: 0.012,
  },
  "floor-calm": {
    bpm: 76, swing: 0.2, chords: LOFI,
    pad: { wave: "triangle", gain: 0.06, cutoff: 1200 },
    bass: { steps: [0, 7, 10], gain: 0.14 },
    kick: [0, 7, 10], snare: [4, 12], hat: [2, 6, 10, 14],
    lead: { wave: "triangle", gain: 0.035, every: 4, chance: 0.35, octave: 12 },
    pulse: null, hiss: 0.018,
  },
  "floor-open": {
    bpm: 90, swing: 0.1, chords: LOFI,
    pad: { wave: "triangle", gain: 0.06, cutoff: 1800 },
    bass: { steps: [0, 3, 6, 8, 11, 14], gain: 0.15 },
    kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    lead: { wave: "square", gain: 0.03, every: 2, chance: 0.5, octave: 12 },
    pulse: null, hiss: 0.01,
  },
  "floor-rally": {
    bpm: 104, swing: 0.04, chords: BRIGHT,
    pad: { wave: "sawtooth", gain: 0.05, cutoff: 2600 },
    bass: { steps: [0, 2, 4, 6, 8, 10, 12, 14], gain: 0.13 },
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
    lead: { wave: "square", gain: 0.04, every: 1, chance: 0.55, octave: 24 },
    pulse: null, hiss: 0,
  },
  "floor-tension": {
    bpm: 86, swing: 0, chords: DARK,
    pad: { wave: "sawtooth", gain: 0.05, cutoff: 700 },
    bass: { steps: [0, 3, 6, 8, 11, 14], gain: 0.18 },
    kick: [0, 3, 8, 11], snare: [12], hat: [4, 12],
    lead: null,
    pulse: { freq: 220, every: 8, gain: 0.04 }, hiss: 0.01,
  },
  "floor-warroom": {
    bpm: 100, swing: 0, chords: STILL,
    pad: { wave: "triangle", gain: 0.05, cutoff: 900 },
    bass: { steps: [0, 8], gain: 0.13 },
    kick: [0, 8], snare: null, hat: null,
    lead: null,
    pulse: { freq: 880, every: 4, gain: 0.035 }, hiss: 0,
  },
  "floor-flat": {
    bpm: 96, swing: 0, chords: STILL,
    pad: { wave: "sine", gain: 0.04, cutoff: 600 },
    bass: null,
    kick: null, snare: null, hat: null,
    lead: null,
    pulse: { freq: 330, every: 4, gain: 0.04 }, hiss: 0,
  },
  "floor-closed": {
    bpm: 66, swing: 0.15, chords: NIGHT,
    pad: { wave: "triangle", gain: 0.07, cutoff: 1000 },
    bass: { steps: [0], gain: 0.1 },
    kick: null, snare: null, hat: [8],
    lead: { wave: "triangle", gain: 0.04, every: 4, chance: 0.4, octave: 24 },
    pulse: null, hiss: 0.02,
  },
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// Deterministic "random" so a loop repeats like composed music, not noise.
const chance = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 2654435761);
  h ^= h >>> 15;
  return ((h >>> 0) % 1000) / 1000;
};

class Engine {
  private ctx: AudioContext;
  private out: GainNode; // volume
  private duckGain: GainNode;
  private noise: AudioBuffer;
  private hissSrc: AudioBufferSourceNode | null = null;
  private hissGain: GainNode;
  private mood: Mood;
  private pending: Mood | null = null;
  private step = 0;
  private bar = 0;
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: AudioContext, mood: Mood, volume: number) {
    this.ctx = ctx;
    this.mood = mood;
    this.out = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.duckGain).connect(ctx.destination);
    this.setVolume(volume);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 3000;
    this.hissGain.connect(hp).connect(this.out);
  }

  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.hissSrc = this.ctx.createBufferSource();
    this.hissSrc.buffer = this.noise;
    this.hissSrc.loop = true;
    this.hissSrc.connect(this.hissGain);
    this.hissSrc.start();
    this.applyHiss();
    // A short lookahead scheduler: notes are booked a little ahead on the audio
    // clock, so timing stays tight even when the page is busy drawing.
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.3);
    const src = this.hissSrc;
    this.hissSrc = null;
    setTimeout(() => src?.stop(), 1500);
  }

  setVolume(v: number) {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.9, t, 0.4);
  }

  setMood(m: Mood) {
    if (m !== this.mood) this.pending = m;
  }

  duck(seconds: number) {
    const t = this.ctx.currentTime;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.2, t, 0.05);
    g.setTargetAtTime(1, t + seconds, 0.6);
  }

  private applyHiss() {
    this.hissGain.gain.setTargetAtTime(SONGS[this.mood].hiss, this.ctx.currentTime, 0.8);
  }

  private tick() {
    const song = SONGS[this.mood];
    const sixteenth = 60 / song.bpm / 4;
    while (this.next < this.ctx.currentTime + 0.15) {
      const lilt = this.step % 2 === 1 ? song.swing * sixteenth : 0;
      this.play(SONGS[this.mood], this.step, this.next + lilt, sixteenth);
      this.next += sixteenth;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this.pending) {
          this.mood = this.pending; // turn on the bar line
          this.pending = null;
          this.applyHiss();
          break; // the new song has its own tempo
        }
      }
    }
  }

  private play(song: Song, step: number, t: number, sixteenth: number) {
    const chord = song.chords[this.bar % song.chords.length];
    const barLen = sixteenth * 16;
    if (step === 0) for (const n of chord) this.pad(hz(n), t, barLen, song.pad);
    if (song.bass?.steps.includes(step)) this.bassNote(hz(chord[step === 8 || step === 10 ? 2 : 0] - 12), t, sixteenth * 2.5, song.bass.gain);
    if (song.kick?.includes(step)) this.kick(t);
    if (song.snare?.includes(step)) this.snare(t);
    if (song.hat?.includes(step)) this.hat(t, step % 4 === 2 ? 0.05 : 0.03);
    if (song.lead && step % song.lead.every === 0 && chance(this.bar * 16 + step + 7) < song.lead.chance) {
      const tones = [...chord, chord[0] + 12];
      const n = tones[Math.floor(chance(this.bar * 31 + step) * tones.length)] + song.lead.octave;
      this.leadNote(hz(n), t, sixteenth * (song.lead.every > 1 ? 1.8 : 0.9), song.lead);
    }
    if (song.pulse && step % song.pulse.every === 0) this.blip(song.pulse.freq, t, song.pulse.gain);
  }

  // ---- instruments ----

  private env(t: number, attack: number, hold: number, release: number, peak: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  }

  private pad(f: number, t: number, len: number, p: Song["pad"]) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = p.cutoff;
    const g = this.env(t, 0.35, Math.max(0, len - 0.35), 0.8, p.gain);
    for (const detune of [-6, 6]) {
      const o = this.ctx.createOscillator();
      o.type = p.wave;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 1);
    }
    lp.connect(g).connect(this.out);
  }

  private bassNote(f: number, t: number, len: number, gain: number) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = this.env(t, 0.01, len * 0.6, len * 0.6, gain);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len * 1.4);
  }

  private leadNote(f: number, t: number, len: number, l: NonNullable<Song["lead"]>) {
    const o = this.ctx.createOscillator();
    o.type = l.wave;
    o.frequency.value = f;
    const g = this.env(t, 0.01, len * 0.4, len, l.gain);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + len * 1.6);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.env(t, 0.003, 0.02, 0.22, 0.32);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, len: number, gain: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(t, 0.002, 0.005, len, gain);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }

  private snare(t: number) {
    this.noiseHit(t, "bandpass", 1800, 0.14, 0.12);
  }

  private hat(t: number, gain: number) {
    this.noiseHit(t, "highpass", 7000, 0.04, gain);
  }

  private blip(f: number, t: number, gain: number) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = this.env(t, 0.002, 0.03, 0.08, gain);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.15);
  }
}

let engine: Engine | null = null;

/** Start (or resume) the music; call from a click or key press the first time. */
export function startMusic(mood: Mood, volume: number) {
  const ctx = audioContext();
  if (!ctx) return;
  if (!engine) engine = new Engine(ctx, mood, volume);
  engine.setMood(mood);
  engine.setVolume(volume);
  engine.start();
}

export function stopMusic() {
  engine?.stop();
}

export function setMusicMood(mood: Mood) {
  engine?.setMood(mood);
}

export function setMusicVolume(v: number) {
  engine?.setVolume(v);
}

/** Step the music back for `seconds` so a bell or a siren cuts through. */
export function duckMusic(seconds: number) {
  engine?.duck(seconds);
}
