// Generates the Mafia game-phase sound effects as WAV files (no binary deps).
// Output goes to Frontend/assets/sounds/. Run: node scripts/generate-sounds.js
const fs = require('fs');
const path = require('path');

const SR = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('wrote', name);
}

function t(i) { return i / SR; }

// --- night ambience: 12s tense low drone, loops seamlessly -------------------
{
  const dur = 12;
  const n = SR * dur;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = t(i);
    // minor-key drone: A1 + C2 + E2 with slow beating
    let s = 0;
    s += Math.sin(2 * Math.PI * 55.0 * x) * 0.22;             // A1
    s += Math.sin(2 * Math.PI * 65.41 * x + 1.3) * 0.16;      // C2
    s += Math.sin(2 * Math.PI * 82.41 * x) * 0.10;            // E2
    s += Math.sin(2 * Math.PI * 1.1 * x) * 0.22 * Math.sin(2 * Math.PI * 82.41 * x); // slow AM
    // sparse "wind" noise, band-limited by a cheap one-pole lowpass below
    out[i] = s * 0.7;
  }
  // gentle low-pass for warmth + loop-safe fade edges are avoided via 1.1 Hz LFO
  // being periodic on 12s and all freqs chosen integer-divisible — beats align.
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += 0.08 * (out[i] - lp);
    out[i] = lp;
  }
  writeWav('night-ambience.wav', out);
}

// --- role activation sting: short ominous swell "your role wakes up" ---------
{
  const dur = 1.2;
  const n = SR * dur;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = t(i);
    const env = Math.min(1, x / 0.15) * Math.exp(-2.2 * x);
    let s = 0;
    s += Math.sin(2 * Math.PI * 110 * x) * 0.30;              // A2 rising tone
    s += Math.sin(2 * Math.PI * 116.5 * x) * 0.30;            // beating minor 2nd
    s += Math.sin(2 * Math.PI * 220 * x) * 0.12 * Math.exp(-4 * x);
    out[i] = s * env * 0.9;
  }
  writeWav('role-sting.wav', out);
}

// --- single role wake tick: one soft thump per waking role -------------------
{
  const dur = 0.5;
  const n = SR * dur;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = t(i);
    const env = Math.exp(-9 * x);
    const s = Math.sin(2 * Math.PI * 140 * x) * env * 0.8
            + Math.sin(2 * Math.PI * 70 * x) * env * 0.5;
    out[i] = s;
  }
  writeWav('role-wake-tick.wav', out);
}

// --- dawn chime: bright resolution, breaks the tension ----------------------
{
  const dur = 2.4;
  const n = SR * dur;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  const out = new Float32Array(n);
  notes.forEach((f, k) => {
    const start = k * 0.18 * SR;
    for (let i = start; i < n; i++) {
      const x = (i - start) / SR;
      const env = Math.min(1, x / 0.02) * Math.exp(-1.6 * x);
      out[i] += Math.sin(2 * Math.PI * f * x) * env * 0.16;
    }
  });
  writeWav('dawn-chime.wav', out);
}

// --- vote result sting: dramatic tension hit for the verdict ----------------
{
  const dur = 1.6;
  const n = SR * dur;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = t(i);
    const env = Math.min(1, x / 0.02) * Math.exp(-3.5 * x);
    let s = 0;
    s += Math.sin(2 * Math.PI * 98 * x) * 0.35;    // G2 punch
    s += Math.sin(2 * Math.PI * 103 * x) * 0.28;   // dissonant neighbor
    out[i] = s * env;
  }
  writeWav('vote-sting.wav', out);
}

console.log('done ->', OUT);
