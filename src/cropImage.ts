import Canvas from "canvas";
const sizeOf = require("buffer-image-size");

// crop image whitespace:
export async function cropImage(image: Buffer | string) {
  const { width, height } = sizeOf(image);
  const img = await Canvas.loadImage(image);

  const canvas = Canvas.createCanvas(width, height);
  const context = canvas.getContext("2d");

  context.drawImage(img, 0, 0);

  const data = context.getImageData(0, 0, width, height).data;

  const top = scanY(true);
  const bottom = scanY(false);
  const left = scanX(true);
  const right = scanX(false);

  if (top === null || bottom === null || left === null || right === null) {
    console.error("image is empty");
    return canvas.toDataURL();
  }

  const new_width = right - left;
  const new_height = bottom - top;

  canvas.width = new_width;
  canvas.height = new_height;

  context.drawImage(
    img,
    left,
    top,
    new_width,
    new_height,
    0,
    0,
    new_width,
    new_height
  );

  return canvas.toDataURL();

  // get pixel RGB data:
  function getRGB(x: number, y: number) {
    return {
      red: data[(width * y + x) * 4],
      green: data[(width * y + x) * 4 + 1],
      blue: data[(width * y + x) * 4 + 2],
    };
  }

  // check if pixel is a color other than white:
  function isColor(rgb: { red: number; green: number; blue: number }) {
    return rgb.red == 255 && rgb.green == 255 && rgb.blue == 255;
  }

  // scan top and bottom edges of image:
  function scanY(top: boolean) {
    var offset = top ? 1 : -1;

    for (var y = top ? 0 : height - 1; top ? y < height : y > -1; y += offset) {
      for (var x = 0; x < width; x++) {
        if (!isColor(getRGB(x, y))) {
          return y;
        }
      }
    }

    return null;
  }

  // scan left and right edges of image:
  function scanX(left: boolean) {
    const offset = left ? 1 : -1;

    for (let x = left ? 0 : width - 1; left ? x < width : x > -1; x += offset) {
      for (let y = 0; y < height; y++) {
        if (!isColor(getRGB(x, y))) {
          return x;
        }
      }
    }

    return null;
  }
}
