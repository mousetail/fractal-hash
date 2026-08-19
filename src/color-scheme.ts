export type ColorScheme = {
  name: string;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
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
  },
  {
    name: "fire",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 0.7, 0.4],
    d: [0.0, 0.15, 0.2],
  },
  {
    name: "ocean",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.1, 0.2],
  },
  {
    name: "sunset",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [2.0, 1.0, 0.0],
    d: [0.5, 0.2, 0.25],
  },
  {
    name: "neon",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 0.5, 0.5],
    d: [0.8, 0.9, 0.3],
  },
  {
    name: "deep-space",
    a: [0.2, 0.1, 0.3],
    b: [0.5, 0.5, 0.5],
    c: [1.0, 1.0, 1.0],
    d: [0.0, 0.25, 0.5],
  },
  {
    name: "gold",
    a: [0.8, 0.6, 0.2],
    b: [0.4, 0.3, 0.1],
    c: [0.5, 0.5, 0.5],
    d: [0.0, 0.1, 0.2],
  },
  {
    name: "acid",
    a: [0.5, 0.5, 0.5],
    b: [0.5, 0.5, 0.5],
    c: [0.5, 1.0, 0.667],
    d: [0.0, 0.0, 0.333],
  },
];
