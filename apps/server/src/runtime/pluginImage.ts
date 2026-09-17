import vm from "node:vm";
import sharp from "sharp";
import { config } from "../config/config.js";

// The JS image API is synchronous; decode/encode asynchronously around raw RGBA operations.
export class PluginImage {
  private readonly pixels: Buffer;

  constructor(
    readonly width: number,
    readonly height: number,
    pixels?: Buffer,
  ) {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height * 4 > config.maxImageBytes
    ) {
      throw new Error("Invalid or oversized image dimensions");
    }
    this.pixels = pixels ?? Buffer.alloc(width * height * 4);
  }

  static empty(width: number, height: number) {
    return new PluginImage(width, height);
  }

  private checkRange(x: number, y: number, width: number, height: number) {
    if (
      ![x, y, width, height].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > this.width ||
      y + height > this.height
    ) {
      throw new Error("Image range is out of bounds");
    }
  }

  copyRange(x: number, y: number, width: number, height: number) {
    this.checkRange(x, y, width, height);
    const result = PluginImage.empty(width, height);
    result.fillImageRangeAt(0, 0, this, x, y, width, height);
    return result;
  }

  copyAndRotate90() {
    const result = PluginImage.empty(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const from = (y * this.width + x) * 4;
        this.pixels.copy(
          result.pixels,
          (x * this.height + this.height - y - 1) * 4,
          from,
          from + 4,
        );
      }
    }
    return result;
  }

  fillImageAt(x: number, y: number, image: PluginImage) {
    this.fillImageRangeAt(x, y, image, 0, 0, image.width, image.height);
  }

  fillImageRangeAt(
    x: number,
    y: number,
    image: PluginImage,
    srcX: number,
    srcY: number,
    width: number,
    height: number,
  ) {
    this.checkRange(x, y, width, height);
    image.checkRange(srcX, srcY, width, height);
    for (let row = 0; row < height; row++) {
      const start = ((srcY + row) * image.width + srcX) * 4;
      image.pixels.copy(this.pixels, ((y + row) * this.width + x) * 4, start, start + width * 4);
    }
  }

  encode() {
    return sharp(this.pixels, { raw: { width: this.width, height: this.height, channels: 4 } })
      .png()
      .toBuffer();
  }
}

export async function modifyImageWithScript(
  data: Buffer,
  script: string,
  globals: Record<string, unknown>,
) {
  const decoded = await sharp(data, { limitInputPixels: Math.floor(config.maxImageBytes / 4) })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const input = new PluginImage(decoded.info.width, decoded.info.height, decoded.data);
  const context = vm.createContext({ ...globals, Image: PluginImage, image: input });
  const result = vm.runInContext(`${script}\n;modifyImage(image);`, context, {
    timeout: config.pluginCallTimeoutMs,
  });
  if (!(result instanceof PluginImage))
    throw new Error("Invalid modifyImage result: expected Image");
  return result.encode();
}
