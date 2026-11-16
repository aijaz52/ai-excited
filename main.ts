import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// SUNSTEALER — an ocean of aurora curls up and steals a living sun.
// All geometry and grain are deterministic; render at twice the final size.
const W = 1024, H = 1024, S = 2, SW = W * S, SH = H * S;
type Point = readonly [number, number];
type Color = readonly [number, number, number];
const pixels = new Float32Array(SW * SH * 3);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const hash = (x: number, y: number) => {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const gold: Color = [255, 132, 32], cyan: Color = [22, 235, 222];

// Additive radiance with a soft shoulder: overlapping strands retain detail.
function expose(value: number) { return 255 * (1 - Math.exp(-Math.max(0, value) / 255)); }
function stroke(a: Point, b: Point, radius: number, color: Color, strength: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const feather = 0.6;
  const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - radius - feather) * S));
  const x1 = Math.min(SW - 1, Math.ceil((Math.max(a[0], b[0]) + radius + feather) * S));
  const y0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - radius - feather) * S));
  const y1 = Math.min(SH - 1, Math.ceil((Math.max(a[1], b[1]) + radius + feather) * S));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = (x + 0.5) / S, py = (y + 0.5) / S;
    const t = length ? clamp(((px - a[0]) * dx + (py - a[1]) * dy) / length) : 0;
    const distance = Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
    const coverage = clamp((radius + feather - distance) / (2 * feather)) * strength;
    if (coverage <= 0) continue;
    const index = (y * SW + x) * 3;
    for (let c = 0; c < 3; c++) pixels[index + c] += color[c] * coverage;
  }
}
function curve(points: readonly Point[], width: number, color: Color, strength: number, fadeBottomRight = false) {
  const [a, b, c, d] = points;
  const count = 180;
  let previous = a;
  for (let j = 1; j <= count; j++) {
    const t = j / count, u = 1 - t;
    const next: Point = [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
      u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]];
    const taper = 0.22 + 0.78 * Math.sin(Math.PI * t) ** 0.45;
    const fade = fadeBottomRight ? 1 - 0.72 * clamp((next[0] - 512) / 160) * clamp((next[1] - 512) / 160) : 1;
    stroke(previous, next, width * taper, color, strength * fade);
    previous = next;
  }
}
const start = 2.35, end = 7.55;
const spiralRadius = (a: number) => 660 * Math.exp(-0.305 * (a - start));
const breadth = (a: number) => (42 + 57 * Math.sin(clamp((a - start) / (end - start)) * Math.PI)) * Math.min(1, (end - a) / 0.68);
function wave(a: number, offset = 0): Point {
  const r = spiralRadius(a) + offset;
  return [554 + r * Math.cos(a), 426 + r * Math.sin(a)];
}

function render() {
  // A continuous shaded volume gives the crest weight even at thumbnail size.
  // Analytic polar distance keeps the surface clean, without polygon seams.
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const px = (x + 0.5) / S, py = (y + 0.5) / S;
    const dx = px - 554, dy = py - 426, r = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx);
    if (a < start) a += Math.PI * 2;
    const valid = a <= end;
    const width = valid ? breadth(a) : 0;
    const delta = r - spiralRadius(a);
    const q = delta / Math.max(0.1, width);
    const haze = Math.exp(-(((px - 460) / 500) ** 2) - ((py - 420) / 430) ** 2);
    const sunR = Math.hypot(px - 558, py - 425);
    const sunGlow = 0.65 * Math.exp(-sunR / 53) + 1.2 * Math.exp(-(((sunR - 39) / 9) ** 2));
    const index = (y * SW + x) * 3;
    const base = [2.5 + haze * 2, 3 + haze * 6, 11 + haze * 14];
    for (let c = 0; c < 3; c++) pixels[index + c] = base[c] + gold[c] * sunGlow;
    if (valid) {
      const glow = Math.exp(-Math.abs(delta + width * 0.7) / 21) * 0.19;
      for (let c = 0; c < 3; c++) pixels[index + c] += cyan[c] * glow;
      if (Math.abs(q) < 1) {
        const edge = clamp((1 - Math.abs(q)) * width * 1.4);
        const ridge = Math.exp(-(((q + 0.65) / 0.22) ** 2));
        const ribs = (0.5 + 0.5 * Math.sin(q * 48 + a * 11 + Math.sin(a * 7) * 1.7)) ** 8;
        const silk = (0.5 + 0.5 * Math.sin(q * 151 + a * 19)) ** 14;
        const light = (0.15 + 0.95 * ridge + 0.17 * ribs + 0.07 * silk) * (0.7 + 0.3 * Math.sin(a - 3));
        const body: Color = [5 + 10 * light, 25 + 160 * light, 43 + 163 * light];
        for (let c = 0; c < 3; c++) pixels[index + c] = pixels[index + c] * (1 - edge) + body[c] * edge;
      }
    }
    // The sun has a hard circular limb and turbulent, incandescent interior.
    if (sunR < 39) {
      const limb = Math.sqrt(Math.max(0, 1 - (sunR / 39) ** 2));
      const cells = Math.sin(px * 0.31 + Math.sin(py * 0.19) * 2) * Math.sin(py * 0.37 + Math.sin(px * 0.12));
      const power = 1.7 + limb * 2.1 + cells * 0.28;
      pixels[index] = 255 * power;
      pixels[index + 1] = (110 + limb * 95) * power;
      pixels[index + 2] = (12 + limb * 55) * power;
    }
  }

  // Long liquid laminae follow one accelerating curl. Uneven, interrupted
  // highlights avoid the uniform wireframe appearance of a mathematical spiral.
  for (let j = 0; j < 76; j++) {
    const f = j / 75 * 2 - 1;
    const from = start + hash(j, 11) * 0.35;
    const to = end - hash(j, 12) * 0.17;
    let previous = wave(from, f * breadth(from));
    for (let k = 1; k <= 310; k++) {
      const a = from + (to - from) * k / 310;
      const flutter = Math.sin(a * 13 + j * 0.7) * Math.sin(a * 4 + j) * 1.4;
      const p = wave(a, f * breadth(a) + flutter * Math.sin((a - from) / (to - from) * Math.PI));
      const hot = f < -0.68;
      const color: Color = hot ? [130, 255, 232] : cyan;
      const strength = (hot ? 0.52 : 0.13) * (0.55 + 0.45 * Math.sin(a * 9 + j * 1.7) ** 2);
      stroke(previous, p, hot ? 0.8 : 0.36 + hash(j, 14) * 0.45, color, strength);
      previous = p;
    }
  }

  // A thin luminous rim traces the lower-left tail's exiting contour.
  let tailPrevious = wave(start, breadth(start));
  for (let k = 1; k <= 100; k++) {
    const t = k / 100, a = start + t * 0.48;
    const p = wave(a, breadth(a));
    stroke(tailPrevious, p, 0.55, [130, 255, 232], 0.48 * (1 - t) ** 0.7);
    tailPrevious = p;
  }

  // The curling lip strips a long molten filament directly off the sun.
  for (let j = 0; j < 17; j++) {
    const s = j / 16;
    curve([[548 + s * 41, 448], [512 + s * 65, 520 + s * 22],
      [644 + s * 23, 590 - s * 12], wave(end - 0.43 + s * 0.4, -8)],
      0.55 + s * 0.65, gold, 0.48);
  }
  curve([[531, 454], [494, 504], [625, 623], wave(end - 0.12)], 0.85, [255, 235, 152], 0.95);

  // Spray tears away tangentially at the crest: distinct sweeping blades,
  // then tiny droplets, all traveling in the same direction.
  for (let j = 0; j < 32; j++) {
    const a = 3.65 + j / 31 * 2.4;
    const root = wave(a, breadth(a) * (0.75 + hash(j, 25) * 0.22));
    const reach = 30 + hash(j, 26) ** 2 * 138;
    const tangent: Point = [-Math.sin(a), Math.cos(a)];
    const radial: Point = [Math.cos(a), Math.sin(a)];
    const tip: Point = [root[0] + tangent[0] * reach + radial[0] * reach * 0.26,
      root[1] + tangent[1] * reach + radial[1] * reach * 0.26];
    curve([root, [root[0] + radial[0] * 34, root[1] + radial[1] * 34],
      [tip[0] - tangent[0] * 35, tip[1] - tangent[1] * 35], tip],
      0.6 + hash(j, 27) * 1.1, j % 7 === 0 ? gold : cyan, 0.4);
  }
  for (let j = 0; j < 480; j++) {
    const a = 3.4 + hash(j, 30) * 3.25;
    const offset = breadth(a) + 6 + hash(j, 31) ** 2 * 130;
    const p = wave(a, offset);
    const length = 1 + hash(j, 32) ** 4 * 13;
    const q: Point = [p[0] - Math.sin(a) * length, p[1] + Math.cos(a) * length];
    stroke(p, q, 0.25 + hash(j, 33) ** 5 * 1.6, j % 9 === 0 ? gold : cyan, 0.18 + hash(j, 34) * 0.7);
  }

  // Broad perspective currents feed the giant wave from outside the frame.
  for (let j = 0; j < 26; j++) {
    const v = j / 25;
    curve([[-120, 1010 + v * 220], [270, 686 + v * 240],
      [570, 920 - v * 45], [1100, 640 + v * 360]],
      0.45 + v * 1.25, j % 6 === 0 ? gold : cyan, 0.06 + v * 0.07, true);
  }
  // Short tapered radial flares establish that the captive light is a star.
  for (let j = 0; j < 18; j++) {
    const a = j * Math.PI * 2 / 18;
    const reach = 5 + hash(j, 50) * 7;
    for (let k = 0; k < 10; k++) {
      const t = k / 10, r = 38 + reach * t, nextR = 38 + reach * (k + 1) / 10;
      stroke([558 + Math.cos(a) * r, 425 + Math.sin(a) * r],
        [558 + Math.cos(a) * nextR, 425 + Math.sin(a) * nextR],
        0.8 * (1 - t), gold, 0.9 * (1 - t));
    }
  }
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
function paeth(a: number, b: number, c: number) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function png() {
  const stride = W * 3;
  const image = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Dither after averaging floating-point samples so subtle glows never
    // acquire quantization contours. Shared RGB grain preserves neutral light.
    const dither = (hash(x, y) - hash(x + 811, y + 367)) * 0.65;
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++)
        sum += expose(pixels[(((y * S + sy) * SW + x * S + sx) * 3) + c]);
      image[y * stride + x * 3 + c] = Math.round(clamp(sum / (S * S) + dither, 0, 255));
    }
  }
  // Choose the lowest-residual PNG filter per row before DEFLATE.
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    let bestScore = Infinity, bestFilter = 0;
    const candidates = Array.from({ length: 5 }, () => Buffer.alloc(stride));
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 3 ? image[y * stride + x - 3] : 0;
        const b = y ? image[(y - 1) * stride + x] : 0;
        const c = y && x >= 3 ? image[(y - 1) * stride + x - 3] : 0;
        const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
        const value = (image[y * stride + x] - prediction) & 255;
        candidates[filter][x] = value;
        score += Math.min(value, 256 - value);
      }
      if (score < bestScore) { bestScore = score; bestFilter = filter; }
    }
    raw[y * (stride + 1)] = bestFilter;
    candidates[bestFilter].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const data = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  if (data.length > 1024 * 1024) throw new Error(`PNG exceeds contest limit: ${data.length} bytes`);
  return data;
}
async function main() {
  render();
  const outputDir = process.env.MAKEFUN_OUTPUT_DIR || process.cwd();
  await mkdir(outputDir, { recursive: true });
  const out = join(outputDir, 'entry.png');
  const data = png();
  await writeFile(out, data);
  console.log(`${out}: ${W}x${H}, ${data.length} bytes`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
