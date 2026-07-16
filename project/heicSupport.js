const VENDOR_SCRIPT_SRC = new URL("./vendor/heic2any.min.js", import.meta.url).href;

const HEIC_EXTENSIONS = ["heic", "heif"];
const HEIC_MIME_TYPES = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
];

export function isHeicFile(file) {
  const name = file.name || "";
  const ext = name.split(".").pop().toLowerCase();
  if (HEIC_EXTENSIONS.includes(ext)) return true;
  if (file.type && HEIC_MIME_TYPES.includes(file.type.toLowerCase())) return true;
  return false;
}

let scriptLoadingPromise = null;

function loadHeic2anyScript() {
  if (typeof globalThis.heic2any === "function") {
    return Promise.resolve();
  }
  if (!scriptLoadingPromise) {
    scriptLoadingPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${VENDOR_SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Не удалось загрузить heic2any.min.js")));
        return;
      }
      const script = document.createElement("script");
      script.src = VENDOR_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Не удалось загрузить heic2any.min.js"));
      document.head.appendChild(script);
    });
  }
  return scriptLoadingPromise;
}

export async function convertHeicToJpeg(file) {
  await loadHeic2anyScript();
  if (typeof globalThis.heic2any !== "function") {
    throw new Error("Библиотека heic2any загрузилась некорректно");
  }

  const result = await globalThis.heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });

  const blob = Array.isArray(result) ? result[0] : result;

  const originalName = file.name || "image.heic";
  const newName = originalName.replace(/\.(heic|heif)$/i, "") + ".jpg";

  return new File([blob], newName, { type: "image/jpeg" });
}
