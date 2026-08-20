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
    glsl: `
    color = palette(smoothIter * 0.4);`,
  },
  {
    name: "root",
    glsl: `color = palette(float(rootIndex + 1) / float(max(ZERO_COUNT, 1)));`,
  },
  {
    name: "smooth-root",
    glsl: `float logDistance = smoothIter;   // larger when closer to a zero
    color = palette(logDistance * 0.1 + float(rootIndex + 1) / float(max(ZERO_COUNT, 1)));`,
  },
  {
    name: "radial",
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : atan(direction.x, direction.y);
    color = palette(e / 6.28318);
  `,
  },
  {
    name: "spiral",
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : atan(direction.x, direction.y);
    color = palette(e / 6.28318 + smoothIter * 0.8);`,
  },
  {
    name: "hard-edge-radial",
    glsl: `vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);
    vec2 direction = safeDir(blended);
    float e=  rootIndex < 0 ? 0.0 : atan(direction.x, direction.y);
    color = palette(trunc(e / 6.28318 * 9.0) / 9.0);
  `,
  },
  {
    name: "image",
    glsl: `
    // Droste Effect implementation
    const float scaleFactor = 2.5; // Configurable scale factor for the recursive effect
    vec2 blended = mix(safeDir(lastDelta), safeDir(delta), bandPosition);

    // Apply Droste Effect: recursively embed the image within itself
    // Use distortion correction to reduce corner stretching
    float r = sqrt(dot(blended, blended));
    vec2 uv = blended / r;

    uv *= exp(smoothIter / 2.0);

    float innerImageSize = 615.0;
    float outerImageSize = 1555.0;
    float ratio = innerImageSize / outerImageSize;

    while (abs(uv.x) > 0.48 || abs(uv.y) > 0.48) {
        uv*=ratio;
    }

    color = texture(u_texture, uv + vec2(0.5, 0.5)).xyz;
  `,
  },
];

/** Number of coloring modes available to `drawNewtonFractal`. */
export const COLOR_MODE_COUNT = COLOR_MODES.length;
