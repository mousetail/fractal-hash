import LoveTriangleImage from "./images/rick.png";
import DrosteImage from "./images/droste.png";
import HarbourImage from "./images/harbour.png";
import MountainImage from "./images/mountain.png";
import KeyboardImage from "./images/keyboard.png";
import BugsImage from "./images/bugs.png";
import WaterDamageImage from "./images/water-damage.png";

const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.src = src;
    image.onload = () => resolve(image);
    image.onerror = (e) => reject(e);
  });
};

export const images_promise: Promise<Record<string, HTMLImageElement>> =
  (async () => {
    const [
      loveTriangle,
      droste,
      harbour,
      mountain,
      keyboard,
      bugs,
      waterDamage,
    ] = await Promise.all([
      loadImage(LoveTriangleImage),
      loadImage(DrosteImage),
      loadImage(HarbourImage),
      loadImage(MountainImage),
      loadImage(KeyboardImage),
      loadImage(BugsImage),
      loadImage(WaterDamageImage),
    ]);
    return {
      love_triangle: loveTriangle,
      droste: droste,
      harbour: harbour,
      mountain: mountain,
      keyboard: keyboard,
      bugs: bugs,
      water_damage: waterDamage,
    };
  })();
