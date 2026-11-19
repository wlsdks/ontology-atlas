import { writeFileSync } from "node:fs";

/**
 * The download page's pictures are WebP: a 2672×1720 app capture is a third to a half of its PNG
 * (planning.ko 618 KB → 342 KB at 0.9), and at 1:1 the text differs from the PNG by at most 14 of
 * 255 per channel. Encoded by the Chromium that shot the picture, so the capture scripts need no
 * image library; a blank page has no content security policy to refuse the data URL.
 */
const WEBP_QUALITY = 0.9;

export async function writeWebp(browser, png, file, quality = WEBP_QUALITY) {
  const page = await browser.newPage();
  try {
    const url = await page.evaluate(
      async ([data, q]) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        return canvas.toDataURL("image/webp", q);
      },
      [png.toString("base64"), quality],
    );
    if (!url.startsWith("data:image/webp;base64,")) throw new Error("this Chromium cannot encode WebP");
    writeFileSync(file, Buffer.from(url.slice(url.indexOf(",") + 1), "base64"));
  } finally {
    await page.close();
  }
  return file;
}
