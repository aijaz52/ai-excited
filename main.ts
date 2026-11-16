// SUNSTEALER — a luminous ocean wave curls around and swallows a living sun.
// Turquoise threads and a glowing tail carry the wave around an orange orb.
// Radiant flares, drifting spray, and softened currents suggest motion and light.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// Geometry and grain are deterministic. The scene is rendered at twice the
// output resolution, then reduced during PNG assembly.
const OUTPUT_WIDTH = 1024;
const OUTPUT_HEIGHT = 1024;
const SAMPLE_SCALE = 2;
const RASTER_WIDTH = OUTPUT_WIDTH * SAMPLE_SCALE;
const RASTER_HEIGHT = OUTPUT_HEIGHT * SAMPLE_SCALE;
const CHANNEL_COUNT = 3;

type Point = readonly [number, number];
type Color = readonly [number, number, number];

const field = new Float32Array(RASTER_WIDTH * RASTER_HEIGHT * CHANNEL_COUNT);
const sunColor: Color = [255, 132, 32];
const waveColor: Color = [22, 235, 222];
const curlStart = 2.35;
const curlEnd = 7.55;

function limit(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function noiseAt(x: number, y: number) {
  let state = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + 1442695041) | 0;
  state = Math.imul(state ^ (state >>> 13), 1274126177);
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
}

function softenLight(value: number) {
  return 255 * (1 - Math.exp(-Math.max(0, value) / 255));
}

function paintSegment(from: Point, to: Point, radius: number, color: Color, strength: number) {
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  const feather = 0.6;
  const left = Math.max(0, Math.floor((Math.min(from[0], to[0]) - radius - feather) * SAMPLE_SCALE));
  const right = Math.min(RASTER_WIDTH - 1, Math.ceil((Math.max(from[0], to[0]) + radius + feather) * SAMPLE_SCALE));
  const top = Math.max(0, Math.floor((Math.min(from[1], to[1]) - radius - feather) * SAMPLE_SCALE));
  const bottom = Math.min(RASTER_HEIGHT - 1, Math.ceil((Math.max(from[1], to[1]) + radius + feather) * SAMPLE_SCALE));

  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const px = (x + 0.5) / SAMPLE_SCALE;
    const py = (y + 0.5) / SAMPLE_SCALE;
    const position = squaredLength ? limit(((px - from[0]) * deltaX + (py - from[1]) * deltaY) / squaredLength) : 0;
    const distance = Math.hypot(px - from[0] - position * deltaX, py - from[1] - position * deltaY);
    const coverage = limit((radius + feather - distance) / (2 * feather)) * strength;
    if (coverage <= 0) continue;
    const offset = (y * RASTER_WIDTH + x) * CHANNEL_COUNT;
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) field[offset + channel] += color[channel] * coverage;
  }
}

function paintBezier(points: readonly Point[], width: number, color: Color, strength: number, fadeAtLowerRight = false) {
  const [first, second, third, fourth] = points;
  const steps = 180;
  let previous = first;
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const inverse = 1 - t;
    const next: Point = [
      inverse ** 3 * first[0] + 3 * inverse * inverse * t * second[0] + 3 * inverse * t * t * third[0] + t ** 3 * fourth[0],
      inverse ** 3 * first[1] + 3 * inverse * inverse * t * second[1] + 3 * inverse * t * t * third[1] + t ** 3 * fourth[1],
    ];
    const taper = 0.22 + 0.78 * Math.sin(Math.PI * t) ** 0.45;
    const fade = fadeAtLowerRight ? 1 - 0.72 * limit((next[0] - 512) / 160) * limit((next[1] - 512) / 160) : 1;
    paintSegment(previous, next, width * taper, color, strength * fade);
    previous = next;
  }
}

function waveRadius(angle: number) {
  return 660 * Math.exp(-0.305 * (angle - curlStart));
}

function waveBreadth(angle: number) {
  return (42 + 57 * Math.sin(limit((angle - curlStart) / (curlEnd - curlStart)) * Math.PI)) * Math.min(1, (curlEnd - angle) / 0.68);
}

function wavePoint(angle: number, offset = 0): Point {
  const radius = waveRadius(angle) + offset;
  return [554 + radius * Math.cos(angle), 426 + radius * Math.sin(angle)];
}

function layVolume() {
  for (let y = 0; y < RASTER_HEIGHT; y++) for (let x = 0; x < RASTER_WIDTH; x++) {
    const px = (x + 0.5) / SAMPLE_SCALE;
    const py = (y + 0.5) / SAMPLE_SCALE;
    const deltaX = px - 554;
    const deltaY = py - 426;
    const distanceFromCenter = Math.hypot(deltaX, deltaY);
    let angle = Math.atan2(deltaY, deltaX);
    if (angle < curlStart) angle += Math.PI * 2;
    const isInsideCurl = angle <= curlEnd;
    const width = isInsideCurl ? waveBreadth(angle) : 0;
    const radialDelta = distanceFromCenter - waveRadius(angle);
    const normalizedDelta = radialDelta / Math.max(0.1, width);
    const haze = Math.exp(-(((px - 460) / 500) ** 2) - ((py - 420) / 430) ** 2);
    const sunDistance = Math.hypot(px - 558, py - 425);
    const sunGlow = 0.65 * Math.exp(-sunDistance / 53) + 1.2 * Math.exp(-(((sunDistance - 39) / 9) ** 2));
    const offset = (y * RASTER_WIDTH + x) * CHANNEL_COUNT;
    const base = [2.5 + haze * 2, 3 + haze * 6, 11 + haze * 14];
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) field[offset + channel] = base[channel] + sunColor[channel] * sunGlow;

    if (isInsideCurl) {
      const glow = Math.exp(-Math.abs(radialDelta + width * 0.7) / 21) * 0.19;
      for (let channel = 0; channel < CHANNEL_COUNT; channel++) field[offset + channel] += waveColor[channel] * glow;
      if (Math.abs(normalizedDelta) < 1) {
        const edge = limit((1 - Math.abs(normalizedDelta)) * width * 1.4);
        const ridge = Math.exp(-(((normalizedDelta + 0.65) / 0.22) ** 2));
        const ribs = (0.5 + 0.5 * Math.sin(normalizedDelta * 48 + angle * 11 + Math.sin(angle * 7) * 1.7)) ** 8;
        const silk = (0.5 + 0.5 * Math.sin(normalizedDelta * 151 + angle * 19)) ** 14;
        const light = (0.15 + 0.95 * ridge + 0.17 * ribs + 0.07 * silk) * (0.7 + 0.3 * Math.sin(angle - 3));
        const body: Color = [5 + 10 * light, 25 + 160 * light, 43 + 163 * light];
        for (let channel = 0; channel < CHANNEL_COUNT; channel++) field[offset + channel] = field[offset + channel] * (1 - edge) + body[channel] * edge;
      }
    }

    if (sunDistance < 39) {
      const limb = Math.sqrt(Math.max(0, 1 - (sunDistance / 39) ** 2));
      const cells = Math.sin(px * 0.31 + Math.sin(py * 0.19) * 2) * Math.sin(py * 0.37 + Math.sin(px * 0.12));
      const power = 1.7 + limb * 2.1 + cells * 0.28;
      field[offset] = 255 * power;
      field[offset + 1] = (110 + limb * 95) * power;
      field[offset + 2] = (12 + limb * 55) * power;
    }
  }
}

function layWaveThreads() {
  for (let thread = 0; thread < 76; thread++) {
    const position = thread / 75 * 2 - 1;
    const fromAngle = curlStart + noiseAt(thread, 11) * 0.35;
    const toAngle = curlEnd - noiseAt(thread, 12) * 0.17;
    let previous = wavePoint(fromAngle, position * waveBreadth(fromAngle));
    for (let step = 1; step <= 310; step++) {
      const angle = fromAngle + (toAngle - fromAngle) * step / 310;
      const flutter = Math.sin(angle * 13 + thread * 0.7) * Math.sin(angle * 4 + thread) * 1.4;
      const point = wavePoint(angle, position * waveBreadth(angle) + flutter * Math.sin((angle - fromAngle) / (toAngle - fromAngle) * Math.PI));
      const isHotEdge = position < -0.68;
      const color: Color = isHotEdge ? [130, 255, 232] : waveColor;
      const strength = (isHotEdge ? 0.52 : 0.13) * (0.55 + 0.45 * Math.sin(angle * 9 + thread * 1.7) ** 2);
      paintSegment(previous, point, isHotEdge ? 0.8 : 0.36 + noiseAt(thread, 14) * 0.45, color, strength);
      previous = point;
    }
  }
}

function layTailRim() {
  let previous = wavePoint(curlStart, waveBreadth(curlStart));
  for (let step = 1; step <= 100; step++) {
    const t = step / 100;
    const angle = curlStart + t * 0.48;
    const point = wavePoint(angle, waveBreadth(angle));
    paintSegment(previous, point, 0.55, [130, 255, 232], 0.48 * (1 - t) ** 0.7);
    previous = point;
  }
}

function laySunFilaments() {
  for (let thread = 0; thread < 17; thread++) {
    const fraction = thread / 16;
    paintBezier([[548 + fraction * 41, 448], [512 + fraction * 65, 520 + fraction * 22],
      [644 + fraction * 23, 590 - fraction * 12], wavePoint(curlEnd - 0.43 + fraction * 0.4, -8)],
      0.55 + fraction * 0.65, sunColor, 0.48);
  }
  paintBezier([[531, 454], [494, 504], [625, 623], wavePoint(curlEnd - 0.12)], 0.85, [255, 235, 152], 0.95);
}

function laySpray() {
  for (let thread = 0; thread < 32; thread++) {
    const angle = 3.65 + thread / 31 * 2.4;
    const root = wavePoint(angle, waveBreadth(angle) * (0.75 + noiseAt(thread, 25) * 0.22));
    const reach = 30 + noiseAt(thread, 26) ** 2 * 138;
    const tangent: Point = [-Math.sin(angle), Math.cos(angle)];
    const radial: Point = [Math.cos(angle), Math.sin(angle)];
    const tip: Point = [root[0] + tangent[0] * reach + radial[0] * reach * 0.26, root[1] + tangent[1] * reach + radial[1] * reach * 0.26];
    paintBezier([root, [root[0] + radial[0] * 34, root[1] + radial[1] * 34],
      [tip[0] - tangent[0] * 35, tip[1] - tangent[1] * 35], tip],
      0.6 + noiseAt(thread, 27) * 1.1, thread % 7 === 0 ? sunColor : waveColor, 0.4);
  }
  for (let drop = 0; drop < 480; drop++) {
    const angle = 3.4 + noiseAt(drop, 30) * 3.25;
    const offset = waveBreadth(angle) + 6 + noiseAt(drop, 31) ** 2 * 130;
    const point = wavePoint(angle, offset);
    const length = 1 + noiseAt(drop, 32) ** 4 * 13;
    const end: Point = [point[0] - Math.sin(angle) * length, point[1] + Math.cos(angle) * length];
    paintSegment(point, end, 0.25 + noiseAt(drop, 33) ** 5 * 1.6, drop % 9 === 0 ? sunColor : waveColor, 0.18 + noiseAt(drop, 34) * 0.7);
  }
}

function layPerspectiveCurrents() {
  for (let current = 0; current < 26; current++) {
    const fraction = current / 25;
    paintBezier([[-120, 1010 + fraction * 220], [270, 686 + fraction * 240],
      [570, 920 - fraction * 45], [1100, 640 + fraction * 360]],
      0.45 + fraction * 1.25, current % 6 === 0 ? sunColor : waveColor, 0.06 + fraction * 0.07, true);
  }
}

function laySolarFlares() {
  for (let flare = 0; flare < 18; flare++) {
    const angle = flare * Math.PI * 2 / 18;
    const reach = 5 + noiseAt(flare, 50) * 7;
    for (let step = 0; step < 10; step++) {
      const t = step / 10;
      const radius = 38 + reach * t;
      const nextRadius = 38 + reach * (step + 1) / 10;
      paintSegment([558 + Math.cos(angle) * radius, 425 + Math.sin(angle) * radius],
        [558 + Math.cos(angle) * nextRadius, 425 + Math.sin(angle) * nextRadius],
        0.8 * (1 - t), sunColor, 0.9 * (1 - t));
    }
  }
}

function renderScene() {
  layVolume();
  layWaveThreads();
  layTailRim();
  laySunFilaments();
  laySpray();
  layPerspectiveCurrents();
  laySolarFlares();
}

function checksum(bytes: Uint8Array) {
  let remainder = 0xffffffff;
  for (const byte of bytes) {
    remainder ^= byte;
    for (let bit = 0; bit < 8; bit++) remainder = (remainder >>> 1) ^ (0xedb88320 & -(remainder & 1));
  }
  return (remainder ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Uint8Array) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  const chunk = Buffer.alloc(payload.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(checksum(payload), payload.length + 4);
  return chunk;
}

function predictPaeth(left: number, above: number, diagonal: number) {
  const estimate = left + above - diagonal;
  const distanceLeft = Math.abs(estimate - left);
  const distanceAbove = Math.abs(estimate - above);
  const distanceDiagonal = Math.abs(estimate - diagonal);
  return distanceLeft <= distanceAbove && distanceLeft <= distanceDiagonal ? left : distanceAbove <= distanceDiagonal ? above : diagonal;
}

function encodePng() {
  const rowBytes = OUTPUT_WIDTH * CHANNEL_COUNT;
  const reduced = Buffer.alloc(rowBytes * OUTPUT_HEIGHT);
  for (let y = 0; y < OUTPUT_HEIGHT; y++) for (let x = 0; x < OUTPUT_WIDTH; x++) {
    const dither = (noiseAt(x, y) - noiseAt(x + 811, y + 367)) * 0.65;
    for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
      let total = 0;
      for (let sampleY = 0; sampleY < SAMPLE_SCALE; sampleY++) for (let sampleX = 0; sampleX < SAMPLE_SCALE; sampleX++)
        total += softenLight(field[(((y * SAMPLE_SCALE + sampleY) * RASTER_WIDTH + x * SAMPLE_SCALE + sampleX) * CHANNEL_COUNT) + channel]);
      reduced[y * rowBytes + x * CHANNEL_COUNT + channel] = Math.round(limit(total / (SAMPLE_SCALE * SAMPLE_SCALE) + dither, 0, 255));
    }
  }

  const filtered = Buffer.alloc((rowBytes + 1) * OUTPUT_HEIGHT);
  for (let y = 0; y < OUTPUT_HEIGHT; y++) {
    let lowestScore = Infinity;
    let selectedFilter = 0;
    const candidates = Array.from({ length: 5 }, () => Buffer.alloc(rowBytes));
    for (let filter = 0; filter < 5; filter++) {
      let score = 0;
      for (let x = 0; x < rowBytes; x++) {
        const left = x >= 3 ? reduced[y * rowBytes + x - 3] : 0;
        const above = y ? reduced[(y - 1) * rowBytes + x] : 0;
        const diagonal = y && x >= 3 ? reduced[(y - 1) * rowBytes + x - 3] : 0;
        const prediction = [0, left, above, Math.floor((left + above) / 2), predictPaeth(left, above, diagonal)][filter];
        const residual = (reduced[y * rowBytes + x] - prediction) & 255;
        candidates[filter][x] = residual;
        score += Math.min(residual, 256 - residual);
      }
      if (score < lowestScore) { lowestScore = score; selectedFilter = filter; }
    }
    filtered[y * (rowBytes + 1)] = selectedFilter;
    candidates[selectedFilter].copy(filtered, y * (rowBytes + 1) + 1);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(OUTPUT_WIDTH, 0);
  header.writeUInt32BE(OUTPUT_HEIGHT, 4);
  header[8] = 8;
  header[9] = 2;
  const output = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', header), makeChunk('IDAT', deflateSync(filtered, { level: 9 })), makeChunk('IEND', Buffer.alloc(0))]);
  if (output.length > 1024 * 1024) throw new Error(`PNG exceeds contest limit: ${output.length} bytes`);
  return output;
}

async function writePreview() {
  renderScene();
  const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR || process.cwd();
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, 'entry.png');
  const png = encodePng();
  await writeFile(outputPath, png);
  console.log(`${outputPath}: ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}, ${png.length} bytes`);
}

writePreview().catch((error) => { console.error(error); process.exitCode = 1; });
