import { generateComplexEquation } from './equation.js';
import { drawNewtonFractal } from './newton-fractal.js'

// Cosine palettes: color(t) = a + b * cos(2π * (c*t + d))
// Each entry is a [r,g,b] triple.
const COLOR_SCHEMES = [
    { name: 'rainbow',    a:[0.500,0.500,0.500], b:[0.500,0.500,0.500], c:[1.000,1.000,1.000], d:[0.000,0.333,0.667] },
    { name: 'fire',       a:[0.500,0.500,0.500], b:[0.500,0.500,0.500], c:[1.000,0.700,0.400], d:[0.000,0.150,0.200] },
    { name: 'ocean',      a:[0.500,0.500,0.500], b:[0.500,0.500,0.500], c:[1.000,1.000,1.000], d:[0.000,0.100,0.200] },
    { name: 'sunset',     a:[0.500,0.500,0.500], b:[0.500,0.500,0.500], c:[2.000,1.000,0.000], d:[0.500,0.200,0.250] },
    { name: 'neon',       a:[0.500,0.500,0.500], b:[0.500,0.500,0.500], c:[1.000,0.500,0.500], d:[0.800,0.900,0.300] },
    { name: 'deep-space', a:[0.200,0.100,0.300], b:[0.500,0.500,0.500], c:[1.000,1.000,1.000], d:[0.000,0.250,0.500] },
    { name: 'gold',       a:[0.800,0.600,0.200], b:[0.400,0.300,0.100], c:[0.500,0.500,0.500], d:[0.000,0.100,0.200] },
    { name: 'acid',       a:[0.500,0.500,0.500], b:[0.500,0.500,0.500], c:[0.500,1.000,0.667], d:[0.000,0.000,0.333] },
];

(() => {
    const canvas = document.getElementById('canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl = canvas.getContext('webgl2');
    if (!gl) {
        console.error('WebGL2 is not supported in this browser.');
        return;
    }

    const hash = 5168;
    const equation = generateComplexEquation(hash);
    const { zeros, sides, colorMode } = equation;
    console.log(`f(z)  = ${equation.glslForm}`);
    console.log(`f'(z) = ${equation.derivativeGlslForm}`);
    console.log(`Zeros: ${zeros.map(([re, im]) => `${re.toFixed(2)}${im < 0 ? '-' : '+'}${Math.abs(im).toFixed(2)}i`).join(', ')}`);
    console.log(`Plateau sides: ${sides < 3 ? 'circle' : sides}, color mode: ${colorMode}`);

    const colorScheme = COLOR_SCHEMES[hash % COLOR_SCHEMES.length];
    console.log('Color scheme:', colorScheme.name);

    drawNewtonFractal(gl, equation, colorScheme, { sides, colorMode });
})();
