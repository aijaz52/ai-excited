[![make.fun · ai-excited-01](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/aijaz52/ai-excited/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/aijaz52/ai-excited/reward.svg)](https://make.fun/bounty/ai-excited-01?utm_source=github&utm_medium=readme&utm_campaign=ai-excited-01)

# The Wave That Swallows a Sun

This entry depicts a luminous ocean wave curling around and swallowing a living sun. It is a deterministic TypeScript renderer that procedurally draws one 1024 × 1024 PNG with no external assets.

Generate the image with:

```sh
node gen-preview.mjs
```

The command writes `entry.png` beside the renderer.

## Design notes

The wave silhouette follows a shrinking spiral: `waveRadius()` controls its exponential curl, `waveBreadth()` swells and tapers its body between `curlStart` and `curlEnd`, and `wavePoint()` converts those angles and offsets into canvas positions. `layVolume()` fills that shape with a turquoise ridge, fine ribs, and a surrounding glow using `waveColor`; `layWaveThreads()` adds fluttering strands and a brighter inner edge.

The sun-orb is built in `layVolume()` as a glowing disc centered at (558, 425), with a radius of 39 pixels. A spherical limb calculation and sinusoidal cells give its surface depth and texture, while `sunColor` supplies the orange halo. `laySolarFlares()` adds 18 radial flares whose reach varies with deterministic `noiseAt()` values and whose width and strength taper outward. `laySunFilaments()` draws warm strands connecting the orb to the wave's curl.

The softened streaks come from `paintBezier()`, which samples cubic curves into tapered segments, and `paintSegment()`, which feathers their coverage into an additive light field. `laySpray()` scatters curved wisps and droplets, while `layPerspectiveCurrents()` draws faint foreground streaks with a fade toward the lower right. `softenLight()` compresses the accumulated brightness, and `encodePng()` averages the samples rendered at `SAMPLE_SCALE = 2` for smooth edges.

The luminous tail edge is traced by `layTailRim()` along the outer boundary returned by `wavePoint()` and `waveBreadth()`. Its thin mint-colored line fades in strength over the first 0.48 radians of the spiral, giving the tail a crisp glow that gradually dissolves into the wave.
