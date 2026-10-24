// Original procedural sound, no samples or remote assets. Deterministic PCM.
const fs = require('node:fs');
const path = require('node:path');
const rate = 16000, duration = 0.32, frames = Math.round(rate * duration);
const output = Buffer.alloc(44 + frames * 2);
output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
output.writeUInt32LE(rate, 24); output.writeUInt32LE(rate * 2, 28); output.writeUInt16LE(2, 32);
output.writeUInt16LE(16, 34); output.write('data', 36); output.writeUInt32LE(frames * 2, 40);
let phase = 0, peak = 0;
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  const frequency = 125 + 460 * Math.exp(-t * 32);
  phase += Math.PI * 2 * frequency / rate;
  const envelope = (1 - Math.exp(-t * 650)) * Math.exp(-t * 15) * Math.min(1, (duration - t) / 0.03);
  const second = t > 0.105 ? Math.sin(2 * Math.PI * (360 * (t - 0.105) + 125 * (t - 0.105) ** 2)) * Math.exp(-(t - 0.105) * 30) * 0.15 : 0;
  const sample = Math.round(Math.max(-1, Math.min(1, (Math.sin(phase) + Math.sin(phase * 1.98) * 0.11) * envelope * 0.66 + second)) * 32767);
  peak = Math.max(peak, Math.abs(sample)); output.writeInt16LE(sample, 44 + i * 2);
}
const destination = path.resolve(__dirname, '../src/assets/audio/bite-plop.wav');
fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, output);
console.log(JSON.stringify({ file: 'src/assets/audio/bite-plop.wav', frames, rate, duration, bytes: output.length, peak: peak / 32767 }));
