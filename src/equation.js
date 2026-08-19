import { COLOR_MODE_COUNT } from './newton-fractal.js';
import {
    SinEquation,
    CubicEquation,
    AtanEquation,
    EquationMultiply,
    OffsetInput,
    MultiplyInput,
} from './factors.js';

/**
 * Generates a random, differentiable complex equation by combining the
 * building blocks from factors.js, based on a hash value.
 *
 * @param {number} hash - The seed for the random generation
 * @returns {{
 *   equation: import('./factors.js').Equation,
 *   glslForm: string,
 *   derivativeGlslForm: string,
 *   zeros: [number, number][],
 *   sides: number,
 *   colorMode: number,
 * }}
 */
export function generateComplexEquation(hash) {
    // Seeded PRNG (Mulberry32) to guarantee deterministic randomness
    let seed = hash;
    function random() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    // Random helpers
    const randRange = (min, max) => min + random() * (max - min);
    const randInt = (min, max) => Math.floor(randRange(min, max + 1));
    const chance = (p) => random() < p;
    const pick = (list) => list[randInt(0, list.length - 1)];
    const randComplex = (min, max) => [randRange(min, max), randRange(min, max)];

    // Complex number with a logarithmically distributed magnitude and a random
    // angle — keeps small and large scales equally likely.
    const randPolar = (minMag, maxMag) => {
        const mag = Math.pow(10, randRange(Math.log10(minMag), Math.log10(maxMag)));
        const ang = randRange(0, 2 * Math.PI);
        return [mag * Math.cos(ang), mag * Math.sin(ang)];
    };

    // Factories for the available primitives
    const primitives = {
        cubic: () => new CubicEquation([randComplex(-1, 1), randComplex(-1, 1), randComplex(-1, 1)]),
        sin: () => new SinEquation(randPolar(0.75, 6), { zeroCount: randInt(3, 9) }),
        atan: () => new AtanEquation(randPolar(0.5, 4)),
    };

    // Randomly rotate/scale and shift the input of a primitive. A factor of i
    // turns sin into i*sinh, an offset moves the feature away from the origin.
    const decorate = (eq) => {
        if (chance(0.6)) eq = new MultiplyInput(eq, randPolar(0.6, 1.6));
        if (chance(0.5)) eq = new OffsetInput(eq, randComplex(-1, 1));
        return eq;
    };

    // Two or three decorated primitives multiplied together. At least one cubic
    // is guaranteed, so Newton's method always has a set of explicit roots to
    // converge to.
    const names = Object.keys(primitives);
    const count = randInt(2, 3);
    const chosen = Array.from({ length: count }, () => pick(names));
    if (!chosen.includes('cubic')) chosen[randInt(0, count - 1)] = 'cubic';

    const equation = chosen
        .map((name) => decorate(primitives[name]()))
        .reduce((a, b) => new EquationMultiply(a, b));

    // Plateau shape: 0-2 → circle, 3-7 → polygon with that many sides
    const sides = randInt(0, 7);
    // Which of the shader's coloring modes to use
    const colorMode = randInt(0, COLOR_MODE_COUNT - 1);

    return {
        equation,
        glslForm: equation.glslForm,
        derivativeGlslForm: equation.derivativeGlslForm,
        zeros: equation.zeros,
        sides,
        colorMode,
    };
}
