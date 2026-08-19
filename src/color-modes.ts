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
export const COLORIZE_PARAMS =
  "int rootIndex, int iterations, float distanceSquared, vec2 delta, vec2 lastDelta, float bandPosition, float smoothIter";

export type ColorMode = { name: string; glsl: string };
/**
 * Coloring modes. Each entry is a GLSL snippet
 */
export const COLOR_MODES: ColorMode[] = [
  {
    name: "iterations",
    glsl: `float shade = sqrt(float(iterations) / float(MAX_ITER));
    color = palette(rootIndex < 0 ? shade : fract(float(rootIndex) * 0.618034 + 0.25 * shade));`,
  },

  {
    name: "center distance",
    glsl: `color = palette(fract(-log2(max(distanceSquared, 1e-30)) * 0.07));`,
  },
  {
    name: "smooth",
    glsl: `float logDistance = smoothIter;   // larger when closer to a zero
    color = palette(logDistance * 0.4);`,
  },
  {
    name: "root",
    glsl: `color = palette(float(rootIndex + 1) / float(max(ZERO_COUNT, 1)));`,
  },
  {
    name: 'smooth-root',
    glsl: `float logDistance = smoothIter;   // larger when closer to a zero
    color = palette(logDistance * 0.1 + float(rootIndex + 1) / float(max(ZERO_COUNT, 1)));`,
  },
  {
    name: "radial",
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : sin(atan(direction.x, direction.y)*3.0) * 0.5 + 0.5;
    color = e* palette(0.5) + (1.0-e) * palette(1.0);
  `,
  },
  {
    name: 'spiral',
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : atan(direction.x, direction.y);
    color = palette(e * 0.1 + float(rootIndex) * 0.2 + smoothIter * 0.2);`,
  },
  {
    name: 'hard-edge-radial',
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : sin(atan(direction.x, direction.y)*3.0) * 0.5 + 0.5;
    color = e > 0.5 ? palette(0.5): e>0.05 ? palette(1.0) : palette(0.1);
  `,
  }
];

/** Number of coloring modes available to `drawNewtonFractal`. */
export const COLOR_MODE_COUNT = COLOR_MODES.length;
