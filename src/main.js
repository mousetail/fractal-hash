import { Complex } from './complex.js'

/**
 * Generates a random, differentiable complex equation and its derivative
 * based on a hash value.
 *
 * @param {number} hash - The seed for the random generation
 * @returns {Object} Object containing equation strings and callable functions
 */
function generateComplexEquation(hash) {
    // 1. Seeded PRNG (Mulberry32) to guarantee deterministic randomness
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
    const randComplex = (min, max) => new Complex(randRange(min, max), randRange(min, max));

    // 3. Generate parameters for P(z)
    // Three explicit roots in the range -1-1i to 1+1i
    const r1 = randComplex(-1, 1);
    const r2 = randComplex(-1, 1);
    const r3 = randComplex(-1, 1);

    // 4. Generate parameters for g(z)
    const n = randInt(1, 4); // Polynomial degree inside g(z)
    const alpha = randComplex(-2, 2);
    const beta = randComplex(-2, 2);
    const delta = randComplex(-2, 2);

    // Logarithmic scaling for frequencies (1 to ~50) to vary order of magnitude of zeros
    const gamma = Math.pow(10, randRange(0, 1.7));
    const epsilon = Math.pow(10, randRange(0, 1.7));

    // String formatting helper
    const cStr = (c) => c.toString();
    const freqStr = (f) => f.toFixed(2);

    // 5. Construct String Representations
    const pStr = `(z - ${cStr(r1)})(z - ${cStr(r2)})(z - ${cStr(r3)})`;
    const dpStr = `((z - ${cStr(r2)})(z - ${cStr(r3)}) + (z - ${cStr(r1)})(z - ${cStr(r3)}) + (z - ${cStr(r1)})(z - ${cStr(r2)}))`;

    const gStr = `(${cStr(alpha)}*z^${n} + ${cStr(beta)}*sin(${freqStr(gamma)}z) + ${cStr(delta)}*cos(${freqStr(epsilon)}z))`;
    const dgStr = `(${cStr(Complex.scale(alpha, n))}*z^${n-1} + ${cStr(Complex.scale(beta, gamma))}*cos(${freqStr(gamma)}z) - ${cStr(Complex.scale(delta, epsilon))}*sin(${freqStr(epsilon)}z))`;

    const equationString = `f(z) = ${pStr} * ${gStr}`;
    const derivativeString = `f'(z) = ${dpStr} * ${gStr} + ${pStr} * ${dgStr}`;

    // 6. Construct Callable JS Functions
    const f = (z) => {
        if (!(z instanceof Complex)) z = new Complex(z, 0);

        // P(z)
        const p1 = Complex.sub(z, r1);
        const p2 = Complex.sub(z, r2);
        const p3 = Complex.sub(z, r3);
        const P = Complex.mul(Complex.mul(p1, p2), p3);

        // g(z) = alpha*z^n + beta*sin(gamma*z) + delta*cos(epsilon*z)
        const term1 = Complex.mul(alpha, Complex.pow(z, n));
        const term2 = Complex.mul(beta, Complex.sin(Complex.scale(z, gamma)));
        const term3 = Complex.mul(delta, Complex.cos(Complex.scale(z, epsilon)));
        const g = Complex.add(Complex.add(term1, term2), term3);

        return Complex.mul(P, g);
    };

    const df = (z) => {
        if (!(z instanceof Complex)) z = new Complex(z, 0);

        const p1 = Complex.sub(z, r1);
        const p2 = Complex.sub(z, r2);
        const p3 = Complex.sub(z, r3);

        // P(z)
        const P = Complex.mul(Complex.mul(p1, p2), p3);

        // P'(z)
        const dp1 = Complex.mul(p2, p3);
        const dp2 = Complex.mul(p1, p3);
        const dp3 = Complex.mul(p1, p2);
        const dP = Complex.add(Complex.add(dp1, dp2), dp3);

        // g(z)
        const term1 = Complex.mul(alpha, Complex.pow(z, n));
        const term2 = Complex.mul(beta, Complex.sin(Complex.scale(z, gamma)));
        const term3 = Complex.mul(delta, Complex.cos(Complex.scale(z, epsilon)));
        const g = Complex.add(Complex.add(term1, term2), term3);

        // g'(z) = alpha*n*z^(n-1) + beta*gamma*cos(gamma*z) - delta*epsilon*sin(epsilon*z)
        const dterm1 = Complex.mul(Complex.scale(alpha, n), Complex.pow(z, n > 0 ? n - 1 : 0));
        const dterm2 = Complex.mul(Complex.scale(beta, gamma), Complex.cos(Complex.scale(z, gamma)));
        const dterm3 = Complex.mul(Complex.scale(delta, -epsilon), Complex.sin(Complex.scale(z, epsilon)));
        const dg = Complex.add(Complex.add(dterm1, dterm2), dterm3);

        // Product Rule: f'(z) = P'(z)g(z) + P(z)g'(z)
        return Complex.add(Complex.mul(dP, g), Complex.mul(P, dg));
    };

    return {
        equationString,
        derivativeString,
        f,
        df,
    };
}

console.log(generateComplexEquation(1))
