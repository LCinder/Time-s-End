// Post-processing that makes everything look like a worn 1930s film print:
// era palette, grain, scratches, dust, gate weave, flicker, vignette,
// damage blotches (= player health), lamps in the dark and the game-over burn.

import Phaser from 'phaser';
import type { EraPalette, FilmTuning } from '../core/types';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDamage;
uniform float uBurn;
uniform float uDark;
uniform vec3 uLight1;
uniform vec3 uLight2;
uniform float uPalette;
uniform float uRoll;
uniform float uFlash;
uniform float uGrain;
uniform float uScratch;
uniform float uVignette;
uniform float uWeave;
uniform float uFlicker;
varying vec2 outTexCoord;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = outTexCoord;
  float frame = mod(floor(uTime * 24.0), 997.0);
  float slow = mod(floor(uTime * 12.0), 997.0);

  // gate weave (the film jitters in the projector)
  uv += vec2(hash(vec2(slow, 1.7)) - 0.5, hash(vec2(slow, 9.1)) - 0.5) * 0.0022 * uWeave * (1.0 + uDamage * 2.0);
  uv.y = fract(uv.y + uRoll);

  vec3 c = texture2D(uMainSampler, uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 col;
  if (uPalette < 0.5) {
    float l = smoothstep(0.02, 0.98, lum);
    col = vec3(l * 0.96 + 0.02);
  } else if (uPalette < 1.5) {
    col = mix(vec3(0.10, 0.06, 0.03), vec3(1.0, 0.93, 0.78), smoothstep(0.0, 1.0, lum));
  } else if (uPalette < 2.5) {
    float warm = c.r;
    float cool = (c.g + c.b) * 0.5;
    col = vec3(warm * 0.95 + 0.03, cool * 0.75 + warm * 0.2, cool * 0.85);
  } else {
    col = c;
  }

  vec2 px = vec2(uv.x * uResolution.x, (1.0 - uv.y) * uResolution.y);

  // darkness with lamps (tunnel)
  if (uDark > 0.001) {
    float l1 = 1.0 - smoothstep(uLight1.z * 0.3, uLight1.z, distance(px, uLight1.xy));
    float l2 = 1.0 - smoothstep(uLight2.z * 0.2, uLight2.z, distance(px, uLight2.xy));
    float light = clamp(max(l1, l2) + 0.05, 0.0, 1.0);
    // keep the sing-along band and the HUD readable
    float sy = 1.0 - uv.y;
    float ui = clamp(step(0.85, sy) + step(sy, 0.09), 0.0, 1.0);
    light = max(light, ui * 0.9);
    col *= mix(1.0, light, uDark);
  }

  // grain
  float g = hash(px * 0.73 + frame * 17.13) - 0.5;
  col += g * 0.09 * uGrain * (1.0 + uDamage * 0.8);

  // vertical scratches
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float seed = mod(floor(uTime * (5.0 + fi * 3.0)), 997.0);
    float on = step(0.74 - uDamage * 0.45, hash(vec2(seed, fi * 3.7 + 1.0)));
    float x = hash(vec2(seed * 1.3, fi + 11.0));
    float w = 0.0007 + 0.0012 * hash(vec2(seed, fi + 5.0));
    float d = abs(uv.x - x);
    float line = (1.0 - smoothstep(0.0, w, d)) * on * uScratch;
    float bright = step(0.5, hash(vec2(seed, fi + 2.0)));
    col = mix(col, vec3(bright * 0.94 + 0.03), line * 0.55);
  }

  // dust & hairs
  vec2 grid = uv * vec2(64.0, 36.0);
  vec2 cell = floor(grid);
  float r = hash(cell + frame * 0.37);
  if (r > 0.9975 - uDamage * 0.006) {
    vec2 f = fract(grid) - 0.5;
    float dd = length(f * vec2(1.0, 1.0 + hash(cell) * 2.0));
    float speck = 1.0 - smoothstep(0.08, 0.22, dd);
    col = mix(col, vec3(step(0.6, hash(cell + 3.0))), speck * 0.85 * uScratch);
  }

  // damage = burnt blotches creeping in from the edges
  if (uDamage > 0.01) {
    vec2 q = uv - 0.5;
    float edge = length(q * vec2(1.6, 1.0));
    float n = vnoise(uv * 7.0 + slow * 0.05);
    float blot = smoothstep(0.82 - uDamage * 0.3, 1.02 - uDamage * 0.3, edge + n * 0.25);
    col *= 1.0 - blot * 0.6;
  }

  // flicker
  col *= 1.0 + (hash(vec2(frame, 4.2)) - 0.5) * 0.07 * uFlicker * (1.0 + uDamage * 2.0);

  // vignette
  float vig = 1.0 - smoothstep(0.3, 0.9, length((uv - 0.5) * vec2(1.1, 1.0)));
  col *= mix(1.0, vig, 0.8 * uVignette);

  // film burn (game over)
  if (uBurn > 0.0) {
    vec2 pb = (uv - vec2(0.55, 0.45)) * vec2(1.78, 1.0);
    float d = length(pb) + vnoise(uv * 12.0) * 0.25 + vnoise(uv * 30.0) * 0.08;
    float rad = uBurn * 1.7;
    float hole = 1.0 - step(rad - 0.04, d);
    float rim = smoothstep(rad - 0.06, rad - 0.035, d) * (1.0 - smoothstep(rad - 0.01, rad + 0.02, d));
    float scorch = 1.0 - smoothstep(rad, rad + 0.14, d);
    col *= 1.0 - scorch * 0.55;
    col = mix(col, vec3(1.0, 0.97, 0.86), rim);
    col = mix(col, vec3(0.03), hole);
  }

  col += uFlash;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const PALETTE_INDEX: Record<EraPalette, number> = { bw1928: 0, sepia1930: 1, twoStrip1932: 2, full1935: 3 };

export class FilmPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  static tuning: FilmTuning = { grain: 1, scratches: 1, vignette: 1, weave: 1, flicker: 1 };

  damage = 0;
  burn = 0;
  dark = 0;
  light1 = { x: 0, y: 0, r: 1 };
  light2 = { x: 0, y: 0, r: 1 };
  palette = 0;
  roll = 0;
  flash = 0;

  constructor(game: Phaser.Game) {
    super({ game, name: 'FilmPipeline', fragShader: FRAG });
  }

  setEra(era: EraPalette): void {
    this.palette = PALETTE_INDEX[era] ?? 0;
  }

  onPreRender(): void {
    const t = FilmPipeline.tuning;
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
    this.set1f('uDamage', this.damage);
    this.set1f('uBurn', this.burn);
    this.set1f('uDark', this.dark);
    // lights are given in game coordinates (1280x720); convert to renderer pixels
    const sx = this.renderer.width / 1280;
    const sy = this.renderer.height / 720;
    this.set3f('uLight1', this.light1.x * sx, this.light1.y * sy, this.light1.r * sx);
    this.set3f('uLight2', this.light2.x * sx, this.light2.y * sy, this.light2.r * sx);
    this.set1f('uPalette', this.palette);
    this.set1f('uRoll', this.roll);
    this.set1f('uFlash', this.flash);
    this.set1f('uGrain', t.grain);
    this.set1f('uScratch', t.scratches);
    this.set1f('uVignette', t.vignette);
    this.set1f('uWeave', t.weave);
    this.set1f('uFlicker', t.flicker);
  }
}

/** Attach the film look to a scene's main camera and return the pipeline instance. */
export function addFilm(scene: Phaser.Scene, era: EraPalette = 'bw1928'): FilmPipeline | null {
  if (scene.game.renderer.type !== Phaser.WEBGL) return null;
  scene.cameras.main.setPostPipeline(FilmPipeline);
  const p = scene.cameras.main.getPostPipeline(FilmPipeline) as FilmPipeline | FilmPipeline[];
  const inst = Array.isArray(p) ? p[0] : p;
  inst?.setEra(era);
  return inst ?? null;
}
