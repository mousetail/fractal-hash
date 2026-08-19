// ---- complex helpers (tuple form, matching the `zeros` type) ----
export type Complex = [number, number];

const cAdd = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const cSub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
const cMul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];

function cDiv(a: Complex, b: Complex): Complex {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}

const cAbs = (a: Complex): number => Math.hypot(a[0], a[1]);
const cLog = (a: Complex): Complex => [
  Math.log(cAbs(a)),
  Math.atan2(a[1], a[0]),
];
const cSin = (a: Complex): Complex => [
  Math.sin(a[0]) * Math.cosh(a[1]),
  Math.cos(a[0]) * Math.sinh(a[1]),
];
const cCos = (a: Complex): Complex => [
  Math.cos(a[0]) * Math.cosh(a[1]),
  -Math.sin(a[0]) * Math.sinh(a[1]),
];

// atan(z) = (i/2) * log((i + z) / (i - z))
const cAtan = (a: Complex): Complex =>
  cMul([0, 0.5], cLog(cDiv(cAdd([0, 1], a), cSub([0, 1], a))));

/**
 * Accepts a number, a [re, im] tuple or a { re, im } object (e.g. `Complex`).
 * @returns {Complex}
 */
export function toComplex(
  v: number | Complex | { re: number; im?: number },
): Complex {
  if (typeof v === "number") return [v, 0];
  if (Array.isArray(v)) return [v[0], v[1] ?? 0];
  if (v && typeof v.re === "number") return [v.re, v.im ?? 0];
  throw new TypeError(
    `Cannot interpret ${JSON.stringify(v)} as a complex number`,
  );
}

/** Removes zeros that coincide (within `eps`), keeping the first occurrence. */
function dedupeZeros(zeros: Complex[], eps: number = 1e-9): Complex[] {
  return zeros.filter(
    (z, i) => zeros.findIndex((o) => cAbs(cSub(z, o)) <= eps) === i,
  );
}

// ---- GLSL literal formatting ----

function glslFloat(x: number): string {
  if (!Number.isFinite(x))
    throw new RangeError(`Cannot emit ${x} as a GLSL float`);
  const s = String(x);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

const glslVec2 = (c: Complex): string =>
  `vec2(${glslFloat(c[0])}, ${glslFloat(c[1])})`;

/** Formats a complex number as a GLSL `vec2` literal. @param {Complex} c */
export const toGlslVec2 = (
  c: number | Complex | { re: number; im?: number },
): string => glslVec2(toComplex(c));

// ---- human-readable formatting ----

/** Rounds to at most two decimals and drops trailing zeros. */
function mathFloat(x: number): string {
  const v = Math.abs(x) < 5e-3 ? 0 : x;
  return String(Number(v.toFixed(2)));
}

/** A signed term such as ` - 0.5i`, or '' when the coefficient rounds to zero. */
function mathTerm(value: number, unit: string = ""): string {
  const s = mathFloat(Math.abs(value));
  if (s === "0") return "";
  const body = unit && s === "1" ? unit : `${s}${unit}`;
  return `${value < 0 ? " - " : " + "}${body}`;
}

/** Formats a complex number, parenthesised when it has both parts: `(1.2 - 0.5i)`. */
function mathComplex(c: Complex): string {
  const re = mathFloat(c[0]);
  const im = mathTerm(c[1], "i");
  if (!im) return re;
  if (re === "0") return im.replace(" + ", "").replace(" - ", "-");
  return `(${re}${im})`;
}

/** `input - c`, with the subtraction folded into the printed terms. */
function mathShift(input: string, c: Complex): string {
  const body = `${input}${mathTerm(-c[0])}${mathTerm(-c[1], "i")}`;
  return body === input ? input : `(${body})`;
}

/** `c * input`, dropping the factor when it is ±1. */
function mathScale(c: Complex, input: string): string {
  const s = mathComplex(c);
  if (s === "1") return input;
  if (s === "-1") return `-${input}`;
  return `${s}·${input}`;
}

/**
 * Complex helpers required by the emitted expressions. Prepend this to a
 * fragment shader before using any `glslForm`.
 *
 * Note: `newton-fractal.js` declares its own copies of `cmul`/`cdiv`/`csin`/
 * `ccos`; use one or the other, not both.
 */
export const COMPLEX_GLSL = `
vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

vec2 cdiv(vec2 a, vec2 b) {
    float d = dot(b, b);
    return vec2(dot(a, b), a.y*b.x - a.x*b.y) / d;
}

vec2 clog(vec2 z) {
    return vec2(log(length(z)), atan(z.y, z.x));
}

vec2 csin(vec2 z) {
    return vec2(sin(z.x) * cosh(z.y), cos(z.x) * sinh(z.y));
}

vec2 ccos(vec2 z) {
    return vec2(cos(z.x) * cosh(z.y), -sin(z.x) * sinh(z.y));
}

// atan(z) = (i/2) * log((i + z) / (i - z))
vec2 catan(vec2 z) {
    vec2 l = clog(cdiv(vec2(0.0, 1.0) + z, vec2(0.0, 1.0) - z));
    return 0.5 * vec2(-l.y, l.x);
}
`;

export interface Equation {
  glsl(input: string): string;

  glslDerivative(input: string): string;

  math(input: string): string;

  evaluate(z: Complex): Complex;

  evaluateDerivative(z: Complex): Complex;

  zeros(): Complex[];
}

// ---- primitives ----

/**
 * f(z) = sin(frequency * z)
 *
 * The zeros of sine are infinite in number; `zeroCount` of them, centred on the
 * origin, are reported.
 */
export class SinEquation implements Equation {
  private frequency: Complex;
  private zeroCount: number;

  constructor(
    frequency: number | Complex | { re: number; im?: number },
    { zeroCount = 7 } = {},
  ) {
    this.frequency = toComplex(frequency);
    this.zeroCount = zeroCount;
  }

  glsl(input: string): string {
    return `csin(cmul(${glslVec2(this.frequency)}, ${input}))`;
  }

  glslDerivative(input: string): string {
    const w = glslVec2(this.frequency);
    return `cmul(${w}, ccos(cmul(${w}, ${input})))`;
  }

  math(input: string): string {
    return `sin(${mathScale(this.frequency, input)})`;
  }

  evaluate(z: Complex): Complex {
    return cSin(cMul(this.frequency, z));
  }

  evaluateDerivative(z: Complex): Complex {
    return cMul(this.frequency, cCos(cMul(this.frequency, z)));
  }

  zeros(): Complex[] {
    if (cAbs(this.frequency) === 0) return []; // f ≡ 0, every point is a zero
    const first = -Math.floor(this.zeroCount / 2);
    return Array.from({ length: this.zeroCount }, (_, i) =>
      cDiv([(first + i) * Math.PI, 0], this.frequency),
    );
  }
}

/**
 * f(z) = (z - r1)(z - r2)(z - r3)
 */
export class CubicEquation implements Equation {
  private roots: Complex[];

  /** @param {Array<number|Complex|{re:number,im?:number}>} zeros exactly three roots */
  constructor(zeros: Array<number | Complex | { re: number; im?: number }>) {
    if (!Array.isArray(zeros) || zeros.length !== 3) {
      throw new RangeError("CubicEquation expects exactly three zeros");
    }
    this.roots = zeros.map(toComplex);
  }

  glsl(input: string): string {
    const [a, b, c] = this.factors(input);
    return `cmul(cmul(${a}, ${b}), ${c})`;
  }

  glslDerivative(input: string): string {
    // (abc)' = bc + ac + ab, since each factor differentiates to 1
    const [a, b, c] = this.factors(input);
    return `(cmul(${b}, ${c}) + cmul(${a}, ${c}) + cmul(${a}, ${b}))`;
  }

  /** GLSL expressions for the three linear factors (z - rk). @private */
  private factors(input: string): string[] {
    return this.roots.map((r) => `(${input} - ${glslVec2(r)})`);
  }

  math(input: string): string {
    return this.roots.map((r) => mathShift(input, r)).join("");
  }

  evaluate(z: Complex): Complex {
    const [a, b, c] = this.roots.map((r) => cSub(z, r));
    return cMul(cMul(a, b), c);
  }

  evaluateDerivative(z: Complex): Complex {
    const [a, b, c] = this.roots.map((r) => cSub(z, r));
    return cAdd(cAdd(cMul(b, c), cMul(a, c)), cMul(a, b));
  }

  zeros(): Complex[] {
    return this.roots.map((r) => [r[0], r[1]]);
  }
}

/**
 * f(z) = atan(angle * z)
 *
 * `angle` scales the input and therefore controls how fast the function sweeps
 * through its angular range; it also rotates the branch cuts, which sit at
 * ±i / angle.
 */
export class AtanEquation implements Equation {
  private angle: Complex;

  /** @param {number|Complex|{re:number,im?:number}} angle */
  constructor(angle: number | Complex | { re: number; im?: number }) {
    this.angle = toComplex(angle);
  }

  glsl(input: string): string {
    return `catan(cmul(${glslVec2(this.angle)}, ${input}))`;
  }

  glslDerivative(input: string): string {
    // d/dz atan(a*z) = a / (1 + (a*z)^2)
    const a = glslVec2(this.angle);
    const w = `cmul(${a}, ${input})`;
    return `cdiv(${a}, vec2(1.0, 0.0) + cmul(${w}, ${w}))`;
  }

  math(input: string): string {
    return `atan(${mathScale(this.angle, input)})`;
  }

  evaluate(z: Complex): Complex {
    return cAtan(cMul(this.angle, z));
  }

  evaluateDerivative(z: Complex): Complex {
    const w = cMul(this.angle, z);
    return cDiv(this.angle, cAdd([1, 0], cMul(w, w)));
  }

  zeros(): Complex[] {
    // atan(w) = 0 only at w = 0 (principal branch), so a*z = 0 → z = 0
    return cAbs(this.angle) === 0 ? [] : [[0, 0]];
  }
}

// ---- combinators ----

/**
 * f(z) = a(z) * b(z), with f'(z) = a'(z)b(z) + a(z)b'(z) (product rule).
 */
export class EquationMultiply implements Equation {
  private a: Equation;
  private b: Equation;

  /** @param {Equation} a @param {Equation} b */
  constructor(a: Equation, b: Equation) {
    this.a = a;
    this.b = b;
  }

  glsl(input: string): string {
    return `cmul(${this.a.glsl(input)}, ${this.b.glsl(input)})`;
  }

  glslDerivative(input: string): string {
    return (
      `(cmul(${this.a.glslDerivative(input)}, ${this.b.glsl(input)})` +
      ` + cmul(${this.a.glsl(input)}, ${this.b.glslDerivative(input)}))`
    );
  }

  math(input: string): string {
    return `${this.a.math(input)}·${this.b.math(input)}`;
  }

  evaluate(z: Complex): Complex {
    return cMul(this.a.evaluate(z), this.b.evaluate(z));
  }

  evaluateDerivative(z: Complex): Complex {
    return cAdd(
      cMul(this.a.evaluateDerivative(z), this.b.evaluate(z)),
      cMul(this.a.evaluate(z), this.b.evaluateDerivative(z)),
    );
  }

  /** A product vanishes wherever either factor does. */
  zeros(): Complex[] {
    return dedupeZeros([...this.a.zeros(), ...this.b.zeros()]);
  }
}

/**
 * f(z) = g(z + offset)
 *
 * The inner derivative is 1, so the derivative is simply g'(z + offset).
 */
export class OffsetInput implements Equation {
  private equation: Equation;
  private offset: Complex;

  /** @param {Equation} equation @param {number|Complex|{re:number,im?:number}} offset */
  constructor(
    equation: Equation,
    offset: number | Complex | { re: number; im?: number },
  ) {
    this.equation = equation;
    this.offset = toComplex(offset);
  }

  /** @private */
  private shifted(input: string): string {
    return `(${input} + ${glslVec2(this.offset)})`;
  }

  glsl(input: string): string {
    return this.equation.glsl(this.shifted(input));
  }

  glslDerivative(input: string): string {
    return this.equation.glslDerivative(this.shifted(input));
  }

  math(input: string): string {
    return this.equation.math(
      mathShift(input, [-this.offset[0], -this.offset[1]]),
    );
  }

  evaluate(z: Complex): Complex {
    return this.equation.evaluate(cAdd(z, this.offset));
  }

  evaluateDerivative(z: Complex): Complex {
    return this.equation.evaluateDerivative(cAdd(z, this.offset));
  }

  /** g(z + offset) = 0 where z + offset is a zero of g. */
  zeros(): Complex[] {
    return this.equation.zeros().map((z) => cSub(z, this.offset));
  }
}

/**
 * f(z) = g(z * factor)
 *
 * Typically used to rotate an equation — multiplying the input by i turns
 * sin into i*sinh, for instance. Chain rule: f'(z) = factor * g'(z * factor).
 */
export class MultiplyInput implements Equation {
  private equation: Equation;
  private factor: Complex;

  /** @param {Equation} equation @param {number|Complex|{re:number,im?:number}} factor */
  constructor(
    equation: Equation,
    factor: number | Complex | { re: number; im?: number },
  ) {
    this.equation = equation;
    this.factor = toComplex(factor);
  }

  /** @private */
  private scaled(input: string): string {
    return `cmul(${glslVec2(this.factor)}, ${input})`;
  }

  glsl(input: string): string {
    return this.equation.glsl(this.scaled(input));
  }

  glslDerivative(input: string): string {
    return `cmul(${glslVec2(this.factor)}, ${this.equation.glslDerivative(this.scaled(input))})`;
  }

  math(input: string): string {
    return this.equation.math(mathScale(this.factor, input));
  }

  evaluate(z: Complex): Complex {
    return this.equation.evaluate(cMul(this.factor, z));
  }

  evaluateDerivative(z: Complex): Complex {
    return cMul(
      this.factor,
      this.equation.evaluateDerivative(cMul(this.factor, z)),
    );
  }

  /** g(z * factor) = 0 where z * factor is a zero of g. */
  zeros(): Complex[] {
    if (cAbs(this.factor) === 0) return [];
    return this.equation.zeros().map((z) => cDiv(z, this.factor));
  }
}
