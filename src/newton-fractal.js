import { COMPLEX_GLSL, toGlslVec2 } from './factors.js';

const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Coloring modes. Each entry is a GLSL snippet that assigns the palette
 * coordinate `t` from the values the Newton loop leaves in scope:
 *
 *   root      - index of the zero that captured z, or -1 if none did
 *   iter      - iterations taken, MAX_ITER if it never settled
 *   d2        - squared distance from the final z to the nearest zero
 *   ZERO_COUNT
 *
 * Exactly one snippet is injected into the shader, the same way the equation
 * and its zeros are.
 */
const COLOR_MODES = [
    // 0: one hue per basin (golden-ratio spaced), shaded by iteration count
    `float shade = sqrt(float(iter) / float(MAX_ITER));
    t = root < 0 ? shade : fract(float(root) * 0.618034 + 0.25 * shade);`,

    // 1: distance to the nearest zero — smooth log-spaced repeating bands
    `t = fract(-log2(max(d2, 1e-30)) * 0.07);`,

    // 2: smooth combined — iteration structure with distance-based sub-band correction
    `float logD = -log2(max(d2, 1e-30));   // larger when closer to a zero
    t = fract(float(iter) * 0.08 + logD * 0.05);`,

    // 3: flat basins — the index of the zero, spread evenly over the palette.
    // Points that reached no zero (root = -1) map to 0.0, distinct from every root.
    `t = float(root + 1) / float(max(ZERO_COUNT, 1));`,
];

/** Number of coloring modes available to `drawNewtonFractal`. */
export const COLOR_MODE_COUNT = COLOR_MODES.length;

/**
 * Bakes the zeros of the equation into the shader as a constant array. Newton's
 * method terminates once an iterate lands on one of them.
 *
 * @param {[number, number][]} zeros
 */
function buildZerosGlsl(zeros) {
    // GLSL has no zero-length arrays, so keep a dummy entry and rely on the count.
    if (zeros.length === 0) {
        return 'const int ZERO_COUNT = 0;\nconst vec2 ZEROS[1] = vec2[1](vec2(0.0, 0.0));';
    }
    const n = zeros.length;
    const items = zeros.map((z) => toGlslVec2(z)).join(',\n    ');
    return `const int ZERO_COUNT = ${n};\nconst vec2 ZEROS[${n}] = vec2[${n}](\n    ${items}\n);`;
}

/**
 * Builds the fragment shader for one specific equation: f(z), f'(z) and the
 * zeros of f are baked into the source, the expressions in the variable `z`.
 *
 * @param {string} glslForm            - expression for f(z)
 * @param {string} derivativeGlslForm  - expression for f'(z)
 * @param {[number, number][]} zeros   - the zeros Newton's method converges to
 * @param {number} colorMode           - index into COLOR_MODES
 */
function buildFragSrc(glslForm, derivativeGlslForm, zeros, colorMode) {
    const coloring = COLOR_MODES[colorMode];
    if (!coloring) throw new RangeError(`Unknown color mode ${colorMode}`);

    return `#version 300 es
precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_scale;

// Capture region around each zero: sides < 3 = circle, sides >= 3 = regular polygon
uniform int   u_sides;
uniform float u_radius;

out vec4 fragColor;

// ---- complex arithmetic ----
${COMPLEX_GLSL}
// ---- capture region ----

// Returns true if p is inside a regular n-gon centered at origin with circumradius R.
// Each sector's midpoint edge is at distance R*cos(PI/n) from center (the apothem).
bool insidePolygon(vec2 p, int n, float R) {
    if (dot(p, p) == 0.0) return true;   // atan(0, 0) is undefined
    float PI = 3.14159265358979;
    float sectorSize = 2.0 * PI / float(n);
    float a   = atan(p.y, p.x);          // angle in (-PI, PI)
    float phi = mod(a, sectorSize);       // position within sector [0, sectorSize)
    float dev = phi - sectorSize * 0.5;  // deviation from sector midpoint
    return length(p) * cos(dev) < R * cos(PI / float(n));
}

// ---- the generated equation ----

${buildZerosGlsl(zeros)}

vec2 evalF(vec2 z) {
    return ${glslForm};
}

vec2 evalDF(vec2 z) {
    return ${derivativeGlslForm};
}

// ---- coloring ----

// Palette uniforms: color = a + b * cos(2π * (c*t + d))
uniform vec3 u_pal_a;
uniform vec3 u_pal_b;
uniform vec3 u_pal_c;
uniform vec3 u_pal_d;

vec3 palette(float t) {
    return u_pal_a + u_pal_b * cos(6.28318 * (u_pal_c * t + u_pal_d));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
    vec2 z   = uv * u_scale + u_center;

    const int   MAX_ITER = 64;
    const float TOL      = 1e-6;

    int iter = MAX_ITER;
    int root = -1;   // index of the zero z was captured by, -1 if none

    for (int i = 0; i < MAX_ITER; i++) {
        // Capture check: is z inside the target region around one of the zeros?
        for (int k = 0; k < ZERO_COUNT; k++) {
            vec2 p = z - ZEROS[k];
            bool hit = u_sides < 3
                ? dot(p, p) < u_radius * u_radius
                : insidePolygon(p, u_sides, u_radius);
            if (hit) { root = k; break; }
        }
        if (root >= 0) { iter = i; break; }

        vec2 fz  = evalF(z);
        vec2 dfz = evalDF(z);

        // Stationary point: the Newton step is undefined, so stop here
        if (dot(dfz, dfz) < 1e-30) { iter = i; break; }

        vec2 step = cdiv(fz, dfz);
        z -= step;

        // Converged onto something we don't have listed (sine has infinitely
        // many zeros, only a window of them is baked in)
        if (dot(step, step) < TOL * TOL) { iter = i; break; }
    }

    // Squared distance to the nearest zero, for the smooth color modes
    float d2 = 1e30;
    for (int k = 0; k < ZERO_COUNT; k++) {
        vec2 p = z - ZEROS[k];
        d2 = min(d2, dot(p, p));
    }

    float t;
    ${coloring}

    fragColor = vec4(clamp(palette(t), 0.0, 1.0), 1.0);
}
`;
}

function compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile error:\n${gl.getShaderInfoLog(shader)}`);
    }
    return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
    const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(`Program link error:\n${gl.getProgramInfoLog(prog)}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
}

/**
 * Renders a Newton's fractal for a generated equation using a WebGL2 shader.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {Object} equation     - { glslForm, derivativeGlslForm, zeros } from generateComplexEquation
 * @param {Object} colorScheme  - cosine palette { a, b, c, d } each [r, g, b]
 * @param {Object} [view]
 * @param {number} [view.scale=3.0]  - half-width of the visible complex plane
 * @param {number} [view.cx=0]       - real part of the view center
 * @param {number} [view.cy=0]       - imaginary part of the view center
 * @param {number} [view.sides=0]    - capture region around each zero: <3 = circle, >=3 = regular polygon with that many sides
 * @param {number} [view.radius=0.02] - size of the capture region; also the shape drawn at each zero
 * @param {number} [view.colorMode=0] - index into COLOR_MODES: 0 basins, 1 distance-to-zero, 2 combined, 3 flat basin index
 */
export function drawNewtonFractal(gl, equation, colorScheme, { scale = 3.0, cx = 0, cy = 0, sides = 0, radius = 0.02, colorMode = 0 } = {}) {
    const { glslForm, derivativeGlslForm, zeros = [] } = equation;

    const prog = createProgram(gl, VERT_SRC, buildFragSrc(glslForm, derivativeGlslForm, zeros, colorMode));
    gl.useProgram(prog);

    // Full-screen quad covering NDC [-1, 1]
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,   1, -1,  -1,  1,
        -1,  1,   1, -1,   1,  1,
    ]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u = (name) => gl.getUniformLocation(prog, name);
    const setF = (name, v) => gl.uniform1f(u(name), v);

    const w = gl.canvas.width;
    const h = gl.canvas.height;
    gl.viewport(0, 0, w, h);

    gl.uniform2f(u('u_resolution'), w, h);
    gl.uniform2f(u('u_center'), cx, cy);
    setF('u_scale', scale);
    gl.uniform1i(u('u_sides'), sides);
    setF('u_radius', radius);

    const { a, b, c, d } = colorScheme;
    gl.uniform3fv(u('u_pal_a'), a);
    gl.uniform3fv(u('u_pal_b'), b);
    gl.uniform3fv(u('u_pal_c'), c);
    gl.uniform3fv(u('u_pal_d'), d);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}
