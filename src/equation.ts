import { COLOR_MODE_COUNT } from "./color-modes.js";
import { COLOR_SCHEMES } from "./color-scheme.js";
import {
  SinEquation,
  CubicEquation,
  AtanEquation,
  EquationMultiply,
  OffsetInput,
  MultiplyInput,
  type Equation,
  Complex,
} from "./factors.js";

/**
 * Generates a random, differentiable complex equation by combining the
 * building blocks from factors.js, based on a hash value.
 *
 * @param {number} hash - The seed for the random generation
 * @returns {{
 *   equation: import('./factors.js').Equation,
 *   glslForm: string,
 *   derivativeGlslForm: string,
 *   mathForm: string,
 *   zeros: [number, number][],
 *   sides: number,
 *   colorMode: number,
 * }}
 */
export function generateComplexEquation(hash: number): {
  equation: Equation;
  colorModeIndex: number;
  colorSchemeIndex: number;
  sides: number;
} {
  // Seeded PRNG (Mulberry32) to guarantee deterministic randomness
  let seed = hash;
  function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // The camera is fixed (see `drawNewtonFractal`'s `scale`), so magnification
  // is baked into the equation instead: every length — root positions and
  // input offsets — grows by ZOOM, while frequencies and angles, which are
  // inverse lengths, shrink by the same amount. Zeros therefore end up ZOOM
  // times further apart on average, i.e. the view sits ZOOM times closer to
  // the structure between them.
  const ZOOM = 4;

  // Random helpers
  const randRange = (min: number, max: number): number =>
    min + random() * (max - min);
  const randInt = (min: number, max: number): number =>
    Math.floor(randRange(min, max + 1));
  const chance = (p: number): boolean => random() < p;
  function pick<T>(list: T[]): T {
    return list[randInt(0, list.length - 1)];
  }
  const randComplex = (min: number, max: number): Complex => [
    randRange(min, max),
    randRange(min, max),
  ];

  // Complex number with a logarithmically distributed magnitude and a random
  // angle — keeps small and large scales equally likely.
  const randPolar = (minMag: number, maxMag: number): Complex => {
    const mag = Math.pow(10, randRange(Math.log10(minMag), Math.log10(maxMag)));
    const ang = randRange(0, 2 * Math.PI);
    return [mag * Math.cos(ang), mag * Math.sin(ang)];
  };

  // Factories for the available primitives. The cubic's roots are positions,
  // so they spread out with ZOOM; the sine's frequency sets the spacing
  // π/|frequency| between its zeros and the atan's angle sets the distance
  // ±1/|angle| to its branch cuts, so both shrink instead.
  const primitives: { [name: string]: () => Equation } = {
    cubic: () =>
      new CubicEquation([
        randComplex(-ZOOM, ZOOM),
        randComplex(-ZOOM, ZOOM),
        randComplex(-ZOOM, ZOOM),
      ]),
    sin: () =>
      new SinEquation(randPolar(0.75 / ZOOM, 6 / ZOOM), {
        zeroCount: randInt(3, 9),
      }),
    atan: () => new AtanEquation(randPolar(0.5 / ZOOM, 4 / ZOOM)),
  };

  // Randomly rotate/scale and shift the input of a primitive. A factor of i
  // turns sin into i*sinh, an offset moves the feature away from the origin.
  const decorate = (eq: Equation): Equation => {
    // A dimensionless factor: it rotates and mildly rescales, so it is left
    // alone — scaling it as well would compound with the primitive's own.
    if (chance(0.6)) eq = new MultiplyInput(eq, randPolar(0.6, 1.6));
    if (chance(0.5)) eq = new OffsetInput(eq, randComplex(-ZOOM, ZOOM));
    return eq;
  };

  // Two or three decorated primitives multiplied together. At least one cubic
  // is guaranteed, so Newton's method always has a set of explicit roots to
  // converge to.
  const names = Object.keys(primitives);
  const count = randInt(2, 3);
  const chosen = Array.from({ length: count }, () => pick(names));
  if (!chosen.includes("cubic")) chosen[randInt(0, count - 1)] = "cubic";

  const equation = chosen
    .map((name) => decorate(primitives[name]()))
    .reduce((a, b) => new EquationMultiply(a, b));

  // Plateau shape: 0-2 → circle, 3-7 → polygon with that many sides
  const sides = randInt(0, 7);
  // Which of the shader's coloring modes to use
  const colorModeIndex = randInt(0, COLOR_MODE_COUNT - 1);
  const colorSchemeIndex = randInt(0, COLOR_SCHEMES.length - 1);

  return {
    equation,
    colorModeIndex,
    colorSchemeIndex,
    sides,
  };
}
