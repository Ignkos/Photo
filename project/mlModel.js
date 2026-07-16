let weightsPromise = null;

function loadWeights() {
  if (!weightsPromise) {
    const url = new URL("./mlWeights.json", import.meta.url);
    weightsPromise = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Не удалось загрузить веса модели (HTTP ${r.status})`);
      return r.json();
    });
  }
  return weightsPromise;
}

function relu(v) {
  return v.map((x) => Math.max(0, x));
}

function tanh(v) {
  return v.map((x) => Math.tanh(x));
}

function denseForward(input, kernel, bias) {
  const outDim = bias.length;
  const out = new Array(outDim).fill(0);
  for (let o = 0; o < outDim; o++) {
    let sum = bias[o];
    for (let i = 0; i < input.length; i++) sum += input[i] * kernel[i][o];
    out[o] = sum;
  }
  return out;
}

export function extractFeatures(imageData) {
  const { data } = imageData;
  const n = data.length / 4;
  if (n === 0) return { meanLum: 128, stdLum: 0, meanSat: 0 };

  let sumLum = 0;
  let sumSat = 0;
  const lums = new Float32Array(n);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    lums[p] = lum;
    sumLum += lum;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    sumSat += sat;
  }

  const meanLum = sumLum / n;
  let sumSq = 0;
  for (let p = 0; p < n; p++) {
    const d = lums[p] - meanLum;
    sumSq += d * d;
  }
  const stdLum = Math.sqrt(sumSq / n);
  const meanSat = (sumSat / n) * 100;

  return { meanLum, stdLum, meanSat };
}

export async function predictParams(features) {
  const w = await loadWeights();
  const input = [
    features.meanLum / 255,
    features.stdLum / 128,
    features.meanSat / 100,
  ];

  let x = relu(denseForward(input, w.w1, w.b1));
  x = relu(denseForward(x, w.w2, w.b2));
  x = tanh(denseForward(x, w.w3, w.b3));

  const [scaleB, scaleC, scaleS] = w.meta?.outputScales ?? [35, 35, 80];
  const brightness = x[0] * scaleB;
  const contrast = x[1] * scaleC;
  const saturation = x[2] * scaleS;
  return { brightness, contrast, saturation };
}
