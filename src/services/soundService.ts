import { APP_CONFIG } from '@/config/app.config';
import type { SoundSettings } from '@/types/settings';

/* ==========================================================================
   Short UI sounds generated with WebAudio (no audio files, works offline):
   scan beep, success chime, error buzz.
   ========================================================================== */

let context: AudioContext | null = null;
let settings: SoundSettings | null = null;

export function configureSounds(next: SoundSettings): void {
  settings = next;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  context ??= new window.AudioContext();
  return context;
}

function tone(frequency: number, durationMs: number, delayMs = 0, type: OscillatorType = 'sine'): void {
  const ctx = audio();
  if (!ctx || !settings?.enabled) return;
  const start = ctx.currentTime + delayMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  const volume = Math.max(0, Math.min(1, settings.volume)) * 0.18;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + durationMs / 1000 + 0.02);
}

export const sounds = {
  scan(): void {
    if (settings?.scan) tone(APP_CONFIG.sound.scanHz, 70, 0, 'square');
  },
  success(): void {
    if (!settings?.success) return;
    const [first, second] = APP_CONFIG.sound.successHz;
    tone(first, 110);
    tone(second, 170, 100);
  },
  error(): void {
    if (settings?.error) tone(APP_CONFIG.sound.errorHz, 220, 0, 'sawtooth');
  },
};
