import { COMPLEX_GLSL, toGlslVec2 } from './factors.js';

const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Signature of the `colorize` function each coloring snippet becomes the body
 * of. Listing the parameters explicitly is deliberate: a snippet may only read
 * these, never the internals of the Newton loop.
 *
 *   rootIndex       - index of the zero that captured z, or -1 if none did
 *   iterations      - steps taken, MAX_ITER if z never settled
 *   distanceSquared - squared distance from the final z to its zero
 *   delta           - final z relative to its zero, inside the capture region
 *   lastDelta       - the iterate before it, outside the capture region
 *   bandPosition    - where the pixel sits across its iteration band: 0 at the
 *                     inner edge (lastDelta exactly on the capture boundary),
 *                     1 at the outer edge (delta exactly on it). Blending
 *                     lastDelta into delta with it is continuous across band
 *                     boundaries, because the two coincide there.
 *   smoothIter      - iterations + bandPosition, free of visible band edges
 *
 * The file-scope constants MAX_ITER and ZERO_COUNT and the helpers palette()
 * and safeDir() are in scope as well.
 */
const COLORIZE_PARAMS =
    'int rootIndex, int iterations, float distanceSquared, vec2 delta, vec2 lastDelta, float bandPosition, float smoothIter';

/**
 * Coloring modes. Each entry is a GLSL snippet that assigns the output color
 * `color` from the arguments listed above. Exactly one snippet is injected into
 * the shader, the same way the equation and its zeros are.
 */
const COLOR_MODES = [
    // 0: one hue per basin (golden-ratio spaced), shaded by iteration count
    `float shade = sqrt(float(iterations) / float(MAX_ITER));
    color = palette(rootIndex < 0 ? shade : fract(float(rootIndex) * 0.618034 + 0.25 * shade));`,

    // 1: distance to the nearest zero — smooth log-spaced repeating bands
    `color = palette(fract(-log2(max(distanceSquared, 1e-30)) * 0.07));`,

    // 2: smooth combined — iteration structure with distance-based sub-band correction
    `float logDistance = -log2(max(distanceSquared, 1e-30));   // larger when closer to a zero
    color = palette(fract(float(iterations) * 0.08 + logDistance * 0.05));`,

    // 3: flat basins — the index of the zero, spread evenly over the palette.
    // Points that reached no zero (rootIndex = -1) map to 0.0, distinct from every root.
    `color = palette(float(rootIndex + 1) / float(max(ZERO_COUNT, 1)));`,

    // 4: direction to the nearest zero, blended across each iteration band so
    // the edges between bands disappear. Both directions are normalized first,
    // otherwise the much longer lastDelta swamps the mix.
    `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : sin(atan(direction.x, direction.y)*3.0) * 0.5 + 0.5;
    color = e* palette(0.5) + (1.0-e) * palette(1.0);
    `,
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

// ---- Newton iteration ----

const int   MAX_ITER = 64;   // give up after this many steps
const float TOL      = 1e-6; // step length below which z counts as settled

// ---- complex arithmetic ----
${COMPLEX_GLSL}
// ---- capture region ----

// Position of p within the capture region around a zero, normalized so that the
// value is < 1 inside, exactly 1 on the boundary and > 1 outside, whatever the
// shape. sides < 3 is a circle of radius R; sides >= 3 is a regular n-gon with
// circumradius R, whose edge midpoints sit at the apothem R*cos(PI/n).
float regionCoord(vec2 p) {
    float dist = length(p);
    if (dist == 0.0) return 0.0;         // atan(0, 0) is undefined
    if (u_sides < 3) return dist / u_radius;
    float PI = 3.14159265358979;
    float sectorSize = 2.0 * PI / float(u_sides);
    float angle = atan(p.y, p.x);        // angle in (-PI, PI)
    float phi = mod(angle, sectorSize);  // position within sector [0, sectorSize)
    float dev = phi - sectorSize * 0.5;  // deviation from sector midpoint
    return dist * cos(dev) / (u_radius * cos(PI / float(u_sides)));
}

// Unit vector along v, or zero if v has no direction to speak of.
vec2 safeDir(vec2 v) {
    float len = length(v);
    return len > 1e-30 ? v / len : vec2(0.0);
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

// The selected coloring mode, and the only thing it gets to see.
vec3 colorize(${COLORIZE_PARAMS}) {
    vec3 color;
    ${coloring}
    return color;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y);
    vec2 z   = uv * u_scale + u_center;
    vec2 last_z = z;

    int iter = MAX_ITER;
    int root = -1;   // index of the zero z was captured by, -1 if none

    for (int i = 0; i < MAX_ITER; i++) {
        // Capture check: is z inside the target region around one of the zeros?
        for (int k = 0; k < ZERO_COUNT; k++) {
            if (regionCoord(z - ZEROS[k]) < 1.0) { root = k; break; }
        }
        if (root >= 0) { iter = i; break; }

        vec2 fz  = evalF(z);
        vec2 dfz = evalDF(z);

        // Stationary point: the Newton step is undefined, so stop here
        if (dot(dfz, dfz) < 1e-30) { iter = i; break; }

        vec2 step = cdiv(fz, dfz);
        last_z = z;
        z -= step;

        // Converged onto something we don't have listed (sine has infinitely
        // many zeros, only a window of them is baked in)
        if (dot(step, step) < TOL * TOL) { iter = i; break; }
    }

    // Distances to the nearest zero, for the smooth color modes.
    // root is -1 when nothing captured z, so clamp before indexing.
    vec2 zero = ZEROS[max(root, 0)];
    vec2 delta     = z - zero;        // inside the capture region
    vec2 lastDelta = last_z - zero;   // the iterate before it, outside

    // Where this pixel sits across its iteration band. Newton converges
    // quadratically, so the band is uniform in log space, not in distance:
    // the ratio of the logs of the normalized region coordinates puts 0 on the
    // boundary the previous iterate crossed and 1 on the one this iterate
    // crossed. At either edge the two deltas describe the same point, so
    // neighbouring bands agree there and the seam between them vanishes.
    float capturedCoord = max(regionCoord(delta), 1e-30);      // <= 1
    float previousCoord = max(regionCoord(lastDelta), 1e-30);  // >= 1, == captured when iter == 0
    float bandSpan = log(previousCoord) - log(capturedCoord);
    float bandPosition = bandSpan > 1e-6
        ? clamp(log(previousCoord) / bandSpan, 0.0, 1.0)
        : 1.0;

    vec3 color = colorize(
        root, iter, dot(delta, delta), delta, lastDelta,
        bandPosition, float(iter) + bandPosition
    );

    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
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
 * @returns {() => void} releases the GL resources this draw allocated
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

    return () => {
        gl.deleteProgram(prog);
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(buf);
    };
}
