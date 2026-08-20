export type ColorScheme = {
  name: string;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
  imageName: string;
};
// Cosine palettes: color(t) = a + b * cos(2π * (c*t + d))
// Each entry is a [r,g,b] triple.
export const COLOR_SCHEMES: ColorScheme[] = [
  {
    name: "rainbow",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.333, 0.667],
    imageName: "love_triangle",
  },
  {
    name: "fire",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.15, 0.2],
    imageName: "droste",
  },
  {
    name: "ocean",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.1, 0.2],
    imageName: "harbour",
  },
  {
    name: "sunset",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [2.0, 1.0, 1.0],
    d: [0.5, 0.2, 0.25],
    imageName: "harbour",
  },
  {
    name: "neon",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.8, 0.9, 0.3],
    imageName: "mountain",
  },
  {
    name: "deep-space",
    a: [0.2, 0.1, 0.3],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.25, 0.5],
    imageName: "keyboard",
  },
  {
    name: "gold",
    a: [0.8, 0.6, 0.2],
    b: [0.4, 0.3, 0.1],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.1, 0.2],
    imageName: "bugs",
  },
  {
    name: "acid",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.0, 0.333],
    imageName: "water_damage",
  },
];

export const PALETTE_GLSL = `vec3 palette(float t) {
    return u_pal_a + u_pal_b * cos(6.28318 * (u_pal_c * t + u_pal_d));
}`;
