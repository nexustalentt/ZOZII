import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BASE_SIZE = 512

// ---------- tiny PNG encoder ----------
const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------- math & rendering helpers ----------
const clamp01 = (v) => Math.min(1, Math.max(0, v))
const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function roundedBoxSdf(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - (halfW - r)
  const qy = Math.abs(py) - (halfH - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

function rotate(px, py, angleRad) {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return [px * cos - py * sin, px * sin + py * cos]
}

// Windows Service 8-toothed gear SDF centered at (0, 0)
function gearSdf(px, py, outerR, innerR, hubR, toothWidth, cornerR) {
  let dBody = Math.hypot(px, py) - hubR
  for (let i = 0; i < 4; i++) {
    const [rx, ry] = rotate(px, py, (i * Math.PI) / 4)
    const dTooth = roundedBoxSdf(rx, ry, outerR, toothWidth / 2, cornerR)
    dBody = Math.min(dBody, dTooth)
  }
  const dHoleDist = innerR - Math.hypot(px, py)
  return Math.max(dBody, dHoleDist)
}

// Palette for Windows Service icon:
// Light blue gradient tile, crisp white gear, subtle depth
const bgTop = [205, 238, 255]
const bgBottom = [160, 214, 250]
const borderColor = [105, 175, 232]
const gearColor = [255, 255, 255]
const gearShadow = [120, 180, 225]

function renderFrame(targetSize, isBgra = false) {
  const buf = Buffer.alloc(targetSize * targetSize * 4)
  const ss = targetSize <= 32 ? 4 : 2 // High supersampling for crisp small sizes
  const scale = targetSize / BASE_SIZE
  const half = targetSize / 2

  const tileHalf = half - 1.5 * scale
  const tileRadius = 60 * scale
  const outerR = 175 * scale
  const innerR = 48 * scale
  const hubR = 125 * scale
  const toothWidth = 84 * scale
  const cornerR = 20 * scale

  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = ((x * ss + sx + 0.5) / (targetSize * ss)) * targetSize - half
          const py = ((y * ss + sy + 0.5) / (targetSize * ss)) * targetSize - half

          const dTile = roundedBoxSdf(px, py, tileHalf, tileHalf, tileRadius)
          const tileAlpha = clamp01(1 - smoothstep(-0.8 * scale, 0.8 * scale, dTile))

          if (tileAlpha <= 0) continue

          const borderT = smoothstep(-2.8 * scale, -0.6 * scale, dTile)
          const gradT = clamp01(py / targetSize + 0.5)
          const bgR = bgTop[0] * (1 - gradT) + bgBottom[0] * gradT
          const bgG = bgTop[1] * (1 - gradT) + bgBottom[1] * gradT
          const bgB = bgTop[2] * (1 - gradT) + bgBottom[2] * gradT

          let r = bgR * (1 - borderT) + borderColor[0] * borderT
          let g = bgG * (1 - borderT) + borderColor[1] * borderT
          let b = bgB * (1 - borderT) + borderColor[2] * borderT

          const dGear = gearSdf(px, py, outerR, innerR, hubR, toothWidth, cornerR)
          const dShadow = gearSdf(px, py - 2.5 * scale, outerR, innerR, hubR, toothWidth, cornerR)

          const shadowA = (1 - smoothstep(-2 * scale, 3 * scale, dShadow)) * 0.35
          if (shadowA > 0) {
            r = r * (1 - shadowA) + gearShadow[0] * shadowA
            g = g * (1 - shadowA) + gearShadow[1] * shadowA
            b = b * (1 - shadowA) + gearShadow[2] * shadowA
          }

          const gearA = 1 - smoothstep(-0.85 * scale, 0.85 * scale, dGear)
          if (gearA > 0) {
            r = r * (1 - gearA) + gearColor[0] * gearA
            g = g * (1 - gearA) + gearColor[1] * gearA
            b = b * (1 - gearA) + gearColor[2] * gearA
          }

          rSum += r * tileAlpha
          gSum += g * tileAlpha
          bSum += b * tileAlpha
          aSum += tileAlpha * 255
        }
      }

      const count = ss * ss
      const i = (y * targetSize + x) * 4
      if (isBgra) {
        buf[i] = Math.round(bSum / count)
        buf[i + 1] = Math.round(gSum / count)
        buf[i + 2] = Math.round(rSum / count)
        buf[i + 3] = Math.round(aSum / count)
      } else {
        buf[i] = Math.round(rSum / count)
        buf[i + 1] = Math.round(gSum / count)
        buf[i + 2] = Math.round(bSum / count)
        buf[i + 3] = Math.round(aSum / count)
      }
    }
  }

  return buf
}

// ---------- BMP & PNG frame builders for ICO ----------
function bmpFrame(size) {
  const pixels = renderFrame(size, true) // BGRA
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // XOR + AND mask height
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16) // BI_RGB
  header.writeUInt32LE(size * size * 4, 20)

  // flip to bottom-up
  const flipped = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    pixels.copy(flipped, (size - 1 - y) * size * 4, y * size * 4, (y + 1) * size * 4)
  }

  const maskRow = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskRow * size)
  return Buffer.concat([header, flipped, mask])
}

// Generate base 512x512 PNG for high-res assets
const basePng = encodePng(BASE_SIZE, BASE_SIZE, renderFrame(BASE_SIZE, false))

for (const rel of ['build', 'public/icons']) {
  mkdirSync(path.join(root, rel), { recursive: true })
}
writeFileSync(path.join(root, 'build', 'icon.png'), basePng)
writeFileSync(path.join(root, 'public', 'icons', 'icon.png'), basePng)
console.log(`icon written (${basePng.length} bytes) -> build/icon.png, public/icons/icon.png`)

// Build multi-resolution ICO containing 256, 128, 64, 48, 32, 24, 16
const sizes = [256, 128, 64, 48, 32, 24, 16]
const frames = sizes.map((s) => ({ s, data: bmpFrame(s) }))
const dir = Buffer.alloc(6)
dir.writeUInt16LE(1, 2)
dir.writeUInt16LE(frames.length, 4)
let offset = 6 + frames.length * 16
const entries = []
const blobs = []
for (const { s, data } of frames) {
  const e = Buffer.alloc(16)
  e[0] = s === 256 ? 0 : s
  e[1] = s === 256 ? 0 : s
  e.writeUInt16LE(1, 4)
  e.writeUInt16LE(32, 6)
  e.writeUInt32LE(data.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += data.length
  entries.push(e)
  blobs.push(data)
}
writeFileSync(path.join(root, 'build', 'icon.ico'), Buffer.concat([dir, ...entries, ...blobs]))
console.log(`ico written (${sizes.join(', ')}) -> build/icon.ico`)
