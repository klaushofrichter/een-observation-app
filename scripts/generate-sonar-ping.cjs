// Generate a sonar ping WAV file
// Run: node scripts/generate-sonar-ping.cjs
const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100
const DURATION = 0.6 // seconds
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION)

// Generate sonar ping: a sine wave that fades out with slight frequency sweep
const samples = new Float32Array(NUM_SAMPLES)
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE
  const progress = t / DURATION

  // Frequency sweeps down slightly from 1400Hz to 1000Hz for that classic sonar feel
  const freq = 1400 - 400 * progress

  // Exponential decay envelope
  const envelope = Math.exp(-6 * progress)

  // Sine wave with the sweeping frequency
  const phase = 2 * Math.PI * (1400 * t - 200 * t * t / DURATION)
  samples[i] = envelope * Math.sin(phase) * 0.5
}

// Convert to 16-bit PCM
const pcmData = Buffer.alloc(NUM_SAMPLES * 2)
for (let i = 0; i < NUM_SAMPLES; i++) {
  const val = Math.max(-1, Math.min(1, samples[i]))
  const intVal = Math.floor(val * 32767)
  pcmData.writeInt16LE(intVal, i * 2)
}

// Build WAV file
const dataSize = pcmData.length
const fileSize = 36 + dataSize
const wav = Buffer.alloc(44 + dataSize)

// RIFF header
wav.write('RIFF', 0)
wav.writeUInt32LE(fileSize, 4)
wav.write('WAVE', 8)

// fmt chunk
wav.write('fmt ', 12)
wav.writeUInt32LE(16, 16) // chunk size
wav.writeUInt16LE(1, 20) // PCM format
wav.writeUInt16LE(1, 22) // mono
wav.writeUInt32LE(SAMPLE_RATE, 24)
wav.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
wav.writeUInt16LE(2, 32) // block align
wav.writeUInt16LE(16, 34) // bits per sample

// data chunk
wav.write('data', 36)
wav.writeUInt32LE(dataSize, 40)
pcmData.copy(wav, 44)

const outPath = path.join(__dirname, '..', 'public', 'sounds', 'sonar-ping.wav')
fs.writeFileSync(outPath, wav)
console.log(`Generated ${outPath} (${wav.length} bytes, ${DURATION}s, ${SAMPLE_RATE}Hz, 16-bit mono)`)
