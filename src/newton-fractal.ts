import { COLORIZE_PARAMS, ColorMode } from "./color-modes.js";
import { ColorScheme, PALETTE_GLSL } from "./color-scheme.js";
import { COMPLEX_GLSL, Equation, toGlslVec2 } from "./factors.js";

const VERT_SRC = `#version 300 es
in vec2 a_pos;
void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Bakes the zeros of the equation into the shader as a constant array. Newton's
 * method terminates once an iterate lands on one of them.
 */
function buildZerosGlsl(zeros: [number, number][]): string {
  // GLSL has no zero-length arrays, so keep a dummy entry and rely on the count.
  if (zeros.length === 0) {
    return "const int ZERO_COUNT = 0;\nconst vec2 ZEROS[1] = vec2[1](vec2(0.0, 0.0));";
  }
  const n = zeros.length;
  const items = zeros.map((z) => toGlslVec2(z)).join(",\n    ");
  return `const int ZERO_COUNT = ${n};\nconst vec2 ZEROS[${n}] = vec2[${n}](\n    ${items}\n);`;
}

/**
 * Builds the fragment shader for one specific equation: f(z), f'(z) and the
 * zeros of f are baked into the source, the expressions in the variable `z`.
 */
function buildFragSrc(
  glslForm: string,
  derivativeGlslForm: string,
  zeros: [number, number][],
  colorMode: ColorMode,
) {
  return `#version 300 es
precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_scale;

uniform sampler2D u_texture;

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

${PALETTE_GLSL}

// The selected coloring mode, and the only thing it gets to see.
vec3 colorize(${COLORIZE_PARAMS}) {
    vec3 color;
    ${colorMode.glsl}
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

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error:\n${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertSrc: string,
  fragSrc: string,
) {
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

type NewtonsFractalParams = {
  equation: Equation;
  colorScheme: ColorScheme;
  colorMode: ColorMode;
  scale: number;
  cx: number;
  cy: number;
  sides: number;
  radius: number;
  images: Record<string, HTMLImageElement>;
};
/**
 * Renders a Newton's fractal for a generated equation using a WebGL2 shader.
 */
export function drawNewtonFractal(
  gl: WebGL2RenderingContext,
  {
    equation,
    colorScheme,
    colorMode,
    scale,
    cx,
    cy,
    sides,
    radius,
    images,
  }: NewtonsFractalParams,
): () => void {
  const prog = createProgram(
    gl,
    VERT_SRC,
    buildFragSrc(
      equation.glsl("z"),
      equation.glslDerivative("z"),
      equation.zeros(),
      colorMode,
    ),
  );
  gl.useProgram(prog);

  // Full-screen quad covering NDC [-1, 1]
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const posLoc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  const setF = (name: string, v: number) => gl.uniform1f(u(name), v);

  const w = gl.canvas.width;
  const h = gl.canvas.height;
  gl.viewport(0, 0, w, h);

  gl.uniform2f(u("u_resolution"), w, h);
  gl.uniform2f(u("u_center"), cx, cy);
  setF("u_scale", scale);
  gl.uniform1i(u("u_sides"), sides);
  setF("u_radius", radius);

  const { a, b, c, d } = colorScheme;
  gl.uniform3fv(u("u_pal_a"), a);
  gl.uniform3fv(u("u_pal_b"), b);
  gl.uniform3fv(u("u_pal_c"), c);
  gl.uniform3fv(u("u_pal_d"), d);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set pixel store parameters before loading texture data
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // Set texture parameters before loading data
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  if (!(colorScheme.imageName in images)) {
    throw new Error(`Image not found: ${colorScheme.imageName}`);
  }
  // Load texture data
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    images[colorScheme.imageName],
  );

  // Generate mipmaps after setting parameters and loading data
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.uniform1i(u("u_texture"), 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  return () => {
    gl.deleteProgram(prog);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buf);
  };
}
