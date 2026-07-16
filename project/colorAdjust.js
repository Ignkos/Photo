export function applyCorrections(
  data,
  { brightness = 0, contrast = 0, saturation = 0, pivot = 128 } = {},
  onProgress
) {
  const gamma = Math.pow(2, -brightness / 100);
  const contrastPivot = gamma !== 1 ? 255 * Math.pow(pivot / 255, gamma) : pivot;

  const contrastFactor = contrast * 2.55;
  const c = (259 * (contrastFactor + 255)) / (255 * (259 - contrastFactor));
  const s = 1 + saturation / 100;

  const shadowThreshold = 75;
  const applyShadowDenoise = gamma < 1;

  const totalPixels = data.length / 4;
  const reportEvery = Math.max(1, Math.floor(totalPixels / 20));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let bl = data[i + 2];

    if (applyShadowDenoise) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * bl;
      const darkWeight = lum < shadowThreshold ? 1 - lum / shadowThreshold : 0;
      const denoise = darkWeight * 0.85;
      if (denoise > 0) {
        r = lum + (r - lum) * (1 - denoise);
        g = lum + (g - lum) * (1 - denoise);
        bl = lum + (bl - lum) * (1 - denoise);
      }
    }

    if (gamma !== 1) {
      r = 255 * Math.pow(r / 255, gamma);
      g = 255 * Math.pow(g / 255, gamma);
      bl = 255 * Math.pow(bl / 255, gamma);
    }

    r = c * (r - contrastPivot) + contrastPivot;
    g = c * (g - contrastPivot) + contrastPivot;
    bl = c * (bl - contrastPivot) + contrastPivot;

    const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
    r = gray + (r - gray) * s;
    g = gray + (g - gray) * s;
    bl = gray + (bl - gray) * s;

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(bl);

    if (onProgress) {
      const pixelIndex = i / 4;
      if (pixelIndex % reportEvery === 0) {
        onProgress((pixelIndex / totalPixels) * 100);
      }
    }
  }

  if (onProgress) onProgress(100);
  return data;
}

function clamp(v) {
  const rounded = Math.round(v);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}
