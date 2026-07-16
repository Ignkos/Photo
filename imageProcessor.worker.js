import { applyCorrections } from "./colorAdjust.js";
import { extractFeatures, predictParams } from "./mlModel.js";

const MAX_MEGAPIXELS = 15;

self.onmessage = async (e) => {
  const { taskId, file, params } = e.data;
  try {
    await processImage(taskId, file, params ?? {});
  } catch (err) {
    self.postMessage({ taskId, type: "error", message: err?.message ?? String(err) });
  }
};

async function processImage(taskId, file, explicitParams) {
  postProgress(taskId, 5);

  let bitmap = await createImageBitmap(file);
  postProgress(taskId, 15);

  const mp = (bitmap.width * bitmap.height) / 1_000_000;
  if (mp > MAX_MEGAPIXELS) {
    const scale = Math.sqrt(MAX_MEGAPIXELS / mp);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const resizeCanvas = new OffscreenCanvas(w, h);
    const resizeCtx = resizeCanvas.getContext("2d");
    resizeCtx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    bitmap = await createImageBitmap(resizeCanvas);
  }
  postProgress(taskId, 25);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  postProgress(taskId, 35);

  const features = extractFeatures(imageData);
  const predicted = await predictParams(features);
  const params = { pivot: features.meanLum, ...predicted, ...explicitParams };
  postProgress(taskId, 45);

  applyCorrections(imageData.data, params, (chunkProgress) => {
    postProgress(taskId, 45 + Math.round((chunkProgress / 100) * 40));
  });

  ctx.putImageData(imageData, 0, 0);
  postProgress(taskId, 90);

  const outType = file.type && file.type.startsWith("image/") ? file.type : "image/png";
  const blob = await canvas.convertToBlob({ type: outType, quality: 0.92 });
  postProgress(taskId, 100);

  self.postMessage({ taskId, type: "done", blob, appliedParams: params });
}

function postProgress(taskId, progress) {
  self.postMessage({ taskId, type: "progress", progress });
}
