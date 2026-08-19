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
 * Coloring modes. Each entry is a GLSL snippet that assigns the output color
 * `color` from the arguments listed above. Exactly one snippet is injected into
 * the shader, the same way the equation and its zeros are.
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
  // 2: smooth combined — iteration structure with distance-based sub-band correction
  {
    name: "smooth",
    glsl: `float logDistance = -log2(max(distanceSquared, 1e-30));   // larger when closer to a zero
    color = palette(fract(float(iterations) * 0.08 + logDistance * 0.05));`,
  },
  // 3: flat basins — the index of the zero, spread evenly over the palette.
  // Points that reached no zero (rootIndex = -1) map to 0.0, distinct from every root.
  {
    name: "root",
    glsl: `color = palette(float(rootIndex + 1) / float(max(ZERO_COUNT, 1)));`,
  },

  // 4: direction to the nearest zero, blended across each iteration band so
  // the edges between bands disappear. Both directions are normalized first,
  // otherwise the much longer lastDelta swamps the mix.
  {
    name: "radial",
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : sin(atan(direction.x, direction.y)*3.0) * 0.5 + 0.5;
    color = e* palette(0.5) + (1.0-e) * palette(1.0);
  `,
  },
];

/** Number of coloring modes available to `drawNewtonFractal`. */
export const COLOR_MODE_COUNT = COLOR_MODES.length;
