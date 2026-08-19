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

/** Hashes are kept small so shared links stay readable. */
const HASH_RANGE = 1_000_000;

const randomHash = () => Math.floor(Math.random() * HASH_RANGE);

/** Reads `?hash=` from the URL, or null when it is missing or not a number. */
function hashFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('hash');
    const value = Number.parseInt(raw ?? '', 10);
    return Number.isSafeInteger(value) ? Math.abs(value) : null;
}

/** Absolute link to the fractal for `hash`. */
function shareUrl(hash) {
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({ hash: String(hash) }).toString();
    url.hash = '';
    return url.toString();
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    // Clipboard API needs a secure context; fall back to a hidden selection.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('Copying to the clipboard was rejected');
}

/** Briefly replaces a button's label to acknowledge an action. */
const flashTimers = new WeakMap();
function flash(button, message, duration = 1400) {
    clearTimeout(flashTimers.get(button));
    const label = (button.dataset.label ??= button.textContent);
    button.textContent = message;
    flashTimers.set(button, setTimeout(() => { button.textContent = label; }, duration));
}

(() => {
    const canvas = document.getElementById('canvas');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    // preserveDrawingBuffer keeps the rendered frame readable by toBlob(),
    // which the download button relies on.
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
    if (!gl) {
        console.error('WebGL2 is not supported in this browser.');
        return;
    }

    const hashValue = document.getElementById('hash-value');
    const equationValue = document.getElementById('equation-value');
    const regenerateButton = document.getElementById('regenerate');
    const shareButton = document.getElementById('share');
    const downloadButton = document.getElementById('download');

    let currentHash = hashFromUrl() ?? randomHash();
    let disposeFractal = null;

    /**
     * @param {number} hash
     * @param {'replace'|'push'} [historyMode] how the address bar entry is updated;
     *   omit to leave history untouched (when the browser already navigated).
     */
    function render(hash, historyMode) {
        const equation = generateComplexEquation(hash);
        const { zeros, sides, colorMode } = equation;
        console.log(`Hash: ${hash}`);
        console.log(`f(z)  = ${equation.mathForm}`);
        console.log(`GLSL f(z)  = ${equation.glslForm}`);
        console.log(`GLSL f'(z) = ${equation.derivativeGlslForm}`);
        console.log(`Zeros: ${zeros.map(([re, im]) => `${re.toFixed(2)}${im < 0 ? '-' : '+'}${Math.abs(im).toFixed(2)}i`).join(', ')}`);
        console.log(`Plateau sides: ${sides < 3 ? 'circle' : sides}, color mode: ${colorMode}`);

        const colorScheme = COLOR_SCHEMES[hash % COLOR_SCHEMES.length];
        console.log('Color scheme:', colorScheme.name);

        disposeFractal?.();
        disposeFractal = drawNewtonFractal(gl, equation, colorScheme, { sides, colorMode });

        currentHash = hash;
        hashValue.textContent = String(hash);
        equationValue.textContent = equation.mathForm;
        // Keep the address bar in sync so a reload reproduces this fractal.
        if (historyMode === 'push') window.history.pushState({ hash }, '', shareUrl(hash));
        else if (historyMode === 'replace') window.history.replaceState({ hash }, '', shareUrl(hash));
    }

    regenerateButton.addEventListener('click', () => render(randomHash(), 'push'));

    // Back/forward moves between the hashes visited in this tab.
    window.addEventListener('popstate', (event) => {
        const hash = event.state?.hash ?? hashFromUrl();
        if (hash !== null && hash !== currentHash) render(hash);
    });

    shareButton.addEventListener('click', async () => {
        try {
            await copyText(shareUrl(currentHash));
            flash(shareButton, 'Copied!');
        } catch (error) {
            console.error(error);
            flash(shareButton, 'Failed');
        }
    });

    downloadButton.addEventListener('click', () => {
        canvas.toBlob((blob) => {
            if (!blob) {
                flash(downloadButton, 'Failed');
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fractal-${currentHash}.png`;
            link.click();
            // Revoking straight away can cancel the download in some browsers.
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            flash(downloadButton, 'Saved!');
        }, 'image/png');
    });

    render(currentHash, 'replace');
})();
