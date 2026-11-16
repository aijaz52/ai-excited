import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// SOLAR IRIS — a magnetic aperture caught at the instant it opens.
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
const angle = -0.39, ca = Math.cos(angle), sa = Math.sin(angle);
function world(u: number, v: number): Point {
  return [480 + u * ca - v * sa, 551 + u * sa + v * ca];
}
const gold: Color = [255, 172, 58], cyan: Color = [36, 224, 246];

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
function curve(points: readonly Point[], width: number, color: Color, strength: number) {
  const [a, b, c, d] = points;
  const count = 180;
  let previous = a;
  for (let j = 1; j <= count; j++) {
    const t = j / count, u = 1 - t;
    const next: Point = [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
      u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]];
    const taper = 0.22 + 0.78 * Math.sin(Math.PI * t) ** 0.45;
    stroke(previous, next, width * taper, color, strength);
    previous = next;
  }
}
function localCurve(points: readonly Point[], width: number, color: Color, strength: number) {
  curve(points.map(([u, v]) => world(u, v)), width, color, strength);
}

function render() {
  const tip = world(350, 0);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const px = (x + 0.5) / S, py = (y + 0.5) / S;
    const dx = px - 480, dy = py - 551;
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
    const t = clamp((u + 350) / 700);
    const height = 151 * Math.sin(Math.PI * t) ** 0.88;
    const outside = Math.max(0, Math.abs(u) - 350);
    const edge = Math.hypot(Math.abs(v) - height, outside * 1.5);
    const inside = Math.abs(u) < 350 && Math.abs(v) < height;
    const upper = v < 0;
    const rimColor = upper ? gold : cyan;
    const turbulence = 0.75 + 0.17 * Math.sin(u * 0.071 + v * 0.097) + 0.08 * Math.sin(u * 0.231 - v * 0.143);
    const rim = (0.95 * Math.exp(-edge * edge / 2.8) + 0.36 * Math.exp(-edge / 10) + 0.14 * Math.exp(-edge / 39)) * turbulence;
    const haze = Math.exp(-((u / 570) ** 2 + (v / 300) ** 2));
    const tipDistance = Math.hypot(px - tip[0], py - tip[1]);
    const flare = 2.7 * Math.exp(-tipDistance * tipDistance / 180) + 0.9 * Math.exp(-tipDistance / 23) + 0.34 * Math.exp(-tipDistance / 93);
    const vignette = clamp(1 - Math.hypot((px - 520) / 850, (py - 500) / 850));
    const base = inside ? [1.4, 3.0, 7.0] : [2.5 + haze * 2, 5 + haze * 10, 12 + haze * 18];
    const index = (y * SW + x) * 3;
    for (let c = 0; c < 3; c++) pixels[index + c] = base[c] * (0.65 + vignette * 0.35) + rimColor[c] * rim + [255, 222, 162][c] * flare;

    // A dim circular event horizon inside the almond gives it an iris,
    // while preserving the large, almost black central negative space.
    const r = Math.hypot((u + 22) * 0.94, v);
    const polar = Math.atan2(v, u + 22);
    const crescent = Math.exp(-(((r - 112) / 1.8) ** 2)) * (0.12 + 0.2 * (0.5 + 0.5 * Math.cos(polar + 0.7)));
    if (inside) for (let c = 0; c < 3; c++) pixels[index + c] += (upper ? gold[c] : cyan[c]) * crescent;
  }

  // Large field loops curl back to a shared ignition point. Unequal spacing,
  // reach and curvature keep the silhouette organic rather than mechanical.
  for (const side of [-1, 1]) {
    for (let j = 0; j < 19; j++) {
      const q = j / 18;
      const root = -330 + q * 540;
      const h = 151 * Math.sin(Math.PI * (root + 350) / 700) ** 0.88;
      const reach = (140 + 155 * Math.sin(q * Math.PI)) * (side < 0 ? 1 : 0.76);
      const points: Point[] = [[root, side * h], [root - 110 + q * 110, side * (h + reach)],
        [230 + q * 170, side * (reach + 90) - 35], [350 + (hash(j, side + 4) - 0.5) * 12, (hash(j, 7) - 0.5) * 12]];
      const color = side < 0 ? (j % 5 === 0 ? cyan : gold) : (j % 6 === 0 ? gold : cyan);
      localCurve(points, 5.2, color, 0.016);
      localCurve(points, 1.05 + hash(j, side + 10) * 0.7, color, 0.36);
      if (j % 3 === 0) localCurve(points, 0.3, [255, 246, 206], 0.55);
      const companion: Point[] = points.map(([a, b], k) => [a - (k === 3 ? 0 : 5), b + side * (k === 3 ? 0 : 5 + q * 5)]);
      localCurve(companion, 0.36, color, 0.22);
    }
  }

  // Thin, windswept trailing arcs make the motion legible at thumbnail size.
  for (let j = 0; j < 11; j++) {
    const shift = j * 9;
    localCurve([[-615, 70 + shift], [-465, 200 + shift], [-240, 282 + shift], [160 + j * 10, 200 - j * 5]],
      0.45, cyan, 0.08 + j * 0.005);
  }

  // Fine plasma threads hug the aperture without crossing its dark interior.
  for (let side of [-1, 1]) for (let j = 0; j < 7; j++) {
    const h = (side < 0 ? 209 : 205) + j * 4;
    localCurve([[-350, 0], [-180, side * h], [160, side * h], [350, 0]],
      j === 0 ? 1.1 : 0.35, side < 0 ? gold : cyan, j === 0 ? 0.62 : 0.15);
  }

  // A single bright knot and directional diffraction spike, aligned to the eye.
  const hot: Color = [255, 250, 229];
  localCurve([[268, 0], [320, 0], [410, 0], [520, 0]], 0.75, hot, 0.85);
  stroke(world(350, -29), world(350, 29), 0.42, cyan, 0.7);
  stroke(tip, tip, 3.2, hot, 12);

  // Sparse, tiny sparks flow into the same corner; no competing bright stars.
  for (let j = 0; j < 190; j++) {
    const u = -500 + hash(j, 40) * 1030;
    const v = (hash(j, 41) - 0.5) * 790;
    const h = Math.abs(u) < 350 ? 151 * Math.sin(Math.PI * clamp((u + 350) / 700)) ** 0.88 : 0;
    if (Math.abs(u) < 355 && Math.abs(v) < h + 24) continue;
    const p = world(u, v);
    const radius = 0.2 + hash(j, 42) ** 4 * 0.85;
    stroke(p, world(u + 0.6 + hash(j, 43) * 2, v - 0.3), radius, j % 3 ? cyan : gold, 0.14 + hash(j, 44) * 0.38);
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
