import { COLOR_MODES } from "./color-modes.js";
import { COLOR_SCHEMES } from "./color-scheme.js";
import { generateComplexEquation } from "./equation.js";
import { drawNewtonFractal } from "./newton-fractal.js";

/** Hashes are kept small so shared links stay readable. */
const HASH_RANGE = 1_000_000;

const randomHash = () => Math.floor(Math.random() * HASH_RANGE);

/** Reads `?hash=` from the URL, or null when it is missing or not a number. */
function hashFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("hash");
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isSafeInteger(value) ? Math.abs(value) : null;
}

/** Absolute link to the fractal for `hash`. */
function shareUrl(hash: number) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ hash: String(hash) }).toString();
  url.hash = "";
  return url.toString();
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Clipboard API needs a secure context; fall back to a hidden selection.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Copying to the clipboard was rejected");
}

(() => {
  const canvas: HTMLCanvasElement = document.getElementById(
    "canvas",
  ) as HTMLCanvasElement;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  // preserveDrawingBuffer keeps the rendered frame readable by toBlob(),
  // which the download button relies on.
  const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true })!;
  if (!gl) {
    console.error("WebGL2 is not supported in this browser.");
    return;
  }

  const hashValue: HTMLDivElement = document.getElementById(
    "hash-value",
  )! as HTMLDivElement;
  const colorValue: HTMLDivElement = document.getElementById(
    "color-value",
  )! as HTMLDivElement;
  const modeValue: HTMLDivElement = document.getElementById(
    "mode-value",
  )! as HTMLDivElement;
  const equationValue: HTMLDivElement = document.getElementById(
    "equation-value",
  )! as HTMLDivElement;
  const regenerateButton: HTMLButtonElement = document.getElementById(
    "regenerate",
  )! as HTMLButtonElement;
  const shareButton: HTMLButtonElement = document.getElementById(
    "share",
  )! as HTMLButtonElement;
  const downloadButton: HTMLButtonElement = document.getElementById(
    "download",
  )! as HTMLButtonElement;
  const stars: [
    HTMLDivElement,
    HTMLDivElement,
    HTMLDivElement,
    HTMLDivElement,
    HTMLDivElement,
  ] = [
    document.getElementById("star-1")! as HTMLDivElement,
    document.getElementById("star-2")! as HTMLDivElement,
    document.getElementById("star-3")! as HTMLDivElement,
    document.getElementById("star-4")! as HTMLDivElement,
    document.getElementById("star-5")! as HTMLDivElement,
  ];

  let currentHash = hashFromUrl() ?? randomHash();
  let disposeFractal: null | (() => void) = null;

  /**
   * @param {number} hash
   * @param {'replace'|'push'} [historyMode] how the address bar entry is updated;
   *   omit to leave history untouched (when the browser already navigated).
   */
  function render(hash: number, historyMode: "replace" | "push") {
    const { equation, sides, colorModeIndex, colorSchemeIndex } =
      generateComplexEquation(hash);
    const colorMode = COLOR_MODES[colorModeIndex];
    const colorScheme = COLOR_SCHEMES[colorSchemeIndex];

    console.log(`Hash: ${hash}`);
    console.log(`f(z)  = ${equation.math("z")}`);
    console.log(`GLSL f(z)  = ${equation.glsl("z")}`);
    console.log(`GLSL f'(z) = ${equation.glslDerivative("z")}`);
    console.log(
      `Zeros: ${equation
        .zeros()
        .map(
          ([re, im]: [number, number]) =>
            `${re.toFixed(2)}${im < 0 ? "-" : "+"}${Math.abs(im).toFixed(2)}i`,
        )
        .join(", ")}`,
    );
    console.log(
      `Plateau sides: ${sides < 3 ? "circle" : sides}, color mode: ${colorMode}`,
    );

    disposeFractal?.();
    disposeFractal = drawNewtonFractal(gl, {
      equation,
      colorScheme,
      sides,
      colorMode,
      scale: 3.0,
      cx: 0.0,
      cy: 0.0,
      radius: 0.02,
    });

    currentHash = hash;
    hashValue.textContent = String(hash);
    equationValue.textContent = equation.math("z");
    colorValue.textContent = colorScheme.name;
    modeValue.textContent = colorMode.name;
    // Keep the address bar in sync so a reload reproduces this fractal.
    if (historyMode === "push") {
      window.history.pushState({ hash }, "", shareUrl(hash));
    } else if (historyMode === "replace") {
      window.history.replaceState({ hash }, "", shareUrl(hash));
    }
  }

  regenerateButton.addEventListener("click", () =>
    render(randomHash(), "push"),
  );

  // Back/forward moves between the hashes visited in this tab.
  window.addEventListener("popstate", (event) => {
    const hash = event.state?.hash ?? hashFromUrl();
    if (hash !== null && hash !== currentHash) render(hash, "replace");
  });

  shareButton.addEventListener("click", async () => {
    await copyText(shareUrl(currentHash));
  });

  downloadButton.addEventListener("click", () => {
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fractal-${currentHash}.png`;
      link.click();
      // Revoking straight away can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  });

  for (const star of stars) {
    star.addEventListener('click', () => {
      fetch('https://fractal-hash-backend.mousetail.nl/submit', {
        method: 'POST',
        body: JSON.stringify({
          equation: equationValue.textContent,
          colors: colorValue.textContent,
          mode: modeValue.textContent,
          rating: +star.id.split('-')[1],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });
    })
  }

  render(currentHash, "replace");
})();
