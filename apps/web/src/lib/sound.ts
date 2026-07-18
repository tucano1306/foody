/**
 * Playful synthesized sound effects (Web Audio API — no audio assets to load).
 * Every sound fires from a user gesture, so the AudioContext can always start.
 * Sounds are always on: volume is the phone's job (hardware buttons/silent
 * mode), not an in-app toggle.
 */

export type SoundName = 'pop' | 'cart' | 'uncart' | 'low' | 'empty' | 'purchase' | 'payment' | 'levelup';

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (globalThis.window === undefined) return null;
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface Note {
  /** Start frequency in Hz */
  readonly freq: number;
  /** Glide target; omitted = steady pitch */
  readonly endFreq?: number;
  /** Offset from "now" in seconds */
  readonly at: number;
  /** Duration in seconds */
  readonly dur: number;
  readonly type?: OscillatorType;
  readonly vol?: number;
}

function schedule(notes: readonly Note[]): void {
  const ac = getContext();
  if (!ac) return;
  const now = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type ?? 'sine';
    const start = now + n.at;
    const end = start + n.dur;
    osc.frequency.setValueAtTime(n.freq, start);
    if (n.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(n.endFreq, end);
    const vol = n.vol ?? 0.06;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(end + 0.05);
  }
}

const SOUNDS: Record<SoundName, readonly Note[]> = {
  // Cheerful bubble pop — product back in stock / added to the cart
  pop: [
    { freq: 440, endFreq: 880, at: 0, dur: 0.09, type: 'sine', vol: 0.08 },
    { freq: 1320, at: 0.06, dur: 0.07, type: 'triangle', vol: 0.04 },
  ],
  // Happy little fanfare — item bought! Rising major arpeggio (C-E-G-C) with
  // a sparkle on top. Loud on purpose: must cut through supermarket noise.
  cart: [
    { freq: 523, at: 0, dur: 0.07, type: 'triangle', vol: 0.2 },
    { freq: 659, at: 0.06, dur: 0.07, type: 'triangle', vol: 0.2 },
    { freq: 784, at: 0.12, dur: 0.07, type: 'triangle', vol: 0.2 },
    { freq: 1047, at: 0.18, dur: 0.2, type: 'triangle', vol: 0.22 },
    { freq: 2093, at: 0.2, dur: 0.16, type: 'sine', vol: 0.1 },
    { freq: 3136, at: 0.26, dur: 0.12, type: 'sine', vol: 0.06 },
  ],
  // Short descending blip — item taken back out of the cart
  uncart: [
    { freq: 784, endFreq: 392, at: 0, dur: 0.12, type: 'triangle', vol: 0.14 },
  ],
  // Gentle "uh-oh" — running low
  low: [
    { freq: 494, at: 0, dur: 0.11, type: 'triangle', vol: 0.05 },
    { freq: 392, at: 0.12, dur: 0.16, type: 'triangle', vol: 0.05 },
  ],
  // Sad trombone slide — product ran out
  empty: [
    { freq: 330, endFreq: 247, at: 0, dur: 0.22, type: 'sawtooth', vol: 0.035 },
    { freq: 247, endFreq: 175, at: 0.24, dur: 0.32, type: 'sawtooth', vol: 0.035 },
  ],
  // Big coin "cha-ching" + victory tail — purchase registered
  purchase: [
    { freq: 988, at: 0, dur: 0.08, type: 'square', vol: 0.06 },
    { freq: 1319, at: 0.08, dur: 0.28, type: 'square', vol: 0.06 },
    { freq: 2637, at: 0.08, dur: 0.28, type: 'sine', vol: 0.04 },
    { freq: 1568, at: 0.34, dur: 0.12, type: 'triangle', vol: 0.08 },
    { freq: 2093, at: 0.44, dur: 0.3, type: 'triangle', vol: 0.09 },
  ],
  // Quick rising arpeggio + sparkle — cart 100% complete
  levelup: [
    { freq: 523, at: 0, dur: 0.08, type: 'triangle', vol: 0.06 },
    { freq: 659, at: 0.07, dur: 0.08, type: 'triangle', vol: 0.06 },
    { freq: 784, at: 0.14, dur: 0.08, type: 'triangle', vol: 0.06 },
    { freq: 1568, at: 0.21, dur: 0.25, type: 'sine', vol: 0.05 },
  ],
  // Little victory fanfare — payment confirmed
  payment: [
    { freq: 523, at: 0, dur: 0.1, type: 'triangle', vol: 0.06 },
    { freq: 659, at: 0.09, dur: 0.1, type: 'triangle', vol: 0.06 },
    { freq: 784, at: 0.18, dur: 0.1, type: 'triangle', vol: 0.06 },
    { freq: 1047, at: 0.27, dur: 0.32, type: 'triangle', vol: 0.07 },
  ],
};

export function playSound(name: SoundName): void {
  try {
    schedule(SOUNDS[name]);
  } catch {
    /* a missing beep is never worth an error */
  }
}
