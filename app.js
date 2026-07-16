import { taskQueue, TaskStatus } from "./taskQueue.js";
import { isHeicFile, convertHeicToJpeg } from "./heicSupport.js";

const ALLOWED_EXT = ["jpg", "jpeg", "png", "bmp", "heic", "heif"];
const MAX_MEGAPIXELS = 15;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const browseBtn = document.getElementById("browseBtn");
const previewSection = document.getElementById("previewSection");
const previewImgBefore = document.getElementById("previewImgBefore");
const previewImgAfter = document.getElementById("previewImgAfter");
const statusSection = document.getElementById("statusSection");
const statusText = document.getElementById("statusText");
const progressFill = document.getElementById("progressFill");
const cancelBtn = document.getElementById("cancelBtn");
const downloadBtn = document.getElementById("downloadBtn");
const clearBtn = document.getElementById("clearBtn");

const metaName = document.getElementById("metaName");
const metaType = document.getElementById("metaType");
const metaSize = document.getElementById("metaSize");
const metaRes = document.getElementById("metaRes");
const metaMp = document.getElementById("metaMp");
const metaWarning = document.getElementById("metaWarning");

let srcUrl = null;
let resultUrl = null;
let taskId = null;
let baseName = "image";
let reqToken = 0;

const STATUS_LABELS = {
  [TaskStatus.QUEUED]: "В очереди",
  [TaskStatus.PROCESSING]: "Обработка",
  [TaskStatus.DONE]: "Готово",
  [TaskStatus.ERROR]: "Ошибка",
  [TaskStatus.ABORTED]: "Прервано",
};

browseBtn.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => {
  if (e.target === browseBtn) return;
  fileInput.click();
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);

["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

clearBtn.addEventListener("click", resetUI);

cancelBtn.addEventListener("click", () => {
  if (!taskId) return;
  taskQueue.abortTask(taskId);
});

downloadBtn.addEventListener("click", () => {
  if (!taskId) return;
  let blob;
  try {
    blob = taskQueue.getTaskResult(taskId);
  } catch {
    return;
  }
  const ext = (blob.type && blob.type.split("/")[1]) || "jpg";
  const a = document.createElement("a");
  a.href = resultUrl ?? URL.createObjectURL(blob);
  a.download = `${baseName}_enhanced.${ext === "jpeg" ? "jpg" : ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

taskQueue.addEventListener("statuschange", (e) => {
  const { taskId: id, status, progress, appliedParams } = e.detail;
  if (id !== taskId) return;
  renderStatus(status, progress);

  if (status === TaskStatus.DONE) {
    const blob = taskQueue.getTaskResult(id);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    previewImgAfter.src = resultUrl;
    downloadBtn.hidden = false;

    if (appliedParams) {
      const fmt = (v) => (v >= 0 ? `+${v.toFixed(0)}` : v.toFixed(0));
      statusText.textContent +=
        ` · Как изменилось: яркость ${fmt(appliedParams.brightness)}, ` +
        `контраст ${fmt(appliedParams.contrast)}, насыщенность ${fmt(appliedParams.saturation)}`;
    }
  } else if (status === TaskStatus.ERROR) {
    statusText.textContent += ` (обработка не выполнена, справа показан исходник)`;
  }
});

function getExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function renderStatus(status, progress) {
  const label = STATUS_LABELS[status] ?? status;
  statusText.textContent = `${label}${
    status === TaskStatus.PROCESSING || status === TaskStatus.QUEUED
      ? ` — ${progress}%`
      : ""
  }`;

  const isActive = status === TaskStatus.QUEUED || status === TaskStatus.PROCESSING;
  cancelBtn.hidden = !isActive;
  downloadBtn.hidden = status !== TaskStatus.DONE;

  progressFill.style.width = `${status === TaskStatus.DONE ? 100 : progress}%`;
  progressFill.classList.toggle("done", status === TaskStatus.DONE);
  progressFill.classList.toggle(
    "error",
    status === TaskStatus.ERROR || status === TaskStatus.ABORTED
  );
}

async function handleFile(file) {
  const ext = getExtension(file.name);

  if (!ALLOWED_EXT.includes(ext)) {
    alert(`Формат .${ext} не поддерживается. Допустимо: JPG, PNG, HEIC, BMP.`);
    return;
  }

  const token = ++reqToken;

  metaName.textContent = file.name;
  metaType.textContent = ext.toUpperCase();
  metaSize.textContent = formatBytes(file.size);
  metaWarning.hidden = true;
  previewImgBefore.removeAttribute("src");
  previewImgAfter.removeAttribute("src");
  previewSection.hidden = false;
  statusSection.hidden = false;
  cancelBtn.hidden = true;
  downloadBtn.hidden = true;
  progressFill.style.width = "0%";
  progressFill.classList.remove("done", "error");
  baseName = file.name.replace(/\.[^.]+$/, "") || "image";

  let workingFile = file;

  if (isHeicFile(file)) {
    statusText.textContent = "Конвертация HEIC…";
    try {
      workingFile = await convertHeicToJpeg(file);
    } catch (err) {
      if (token !== reqToken) return;
      statusText.textContent = `Не удалось декодировать HEIC: ${err.message}`;
      return;
    }
    if (token !== reqToken) return;
  }

  if (srcUrl) URL.revokeObjectURL(srcUrl);
  srcUrl = URL.createObjectURL(workingFile);

  previewImgBefore.onload = () => {
    const { naturalWidth: w, naturalHeight: h } = previewImgBefore;
    const mp = (w * h) / 1_000_000;
    metaRes.textContent = `${w} × ${h} px`;
    metaMp.textContent = `${mp.toFixed(1)} Мпк`;
    if (mp > MAX_MEGAPIXELS) {
      metaWarning.hidden = false;
      metaWarning.textContent = `Превышен лимит ${MAX_MEGAPIXELS} Мпк — изображение будет уменьшено перед обработкой.`;
    }
  };
  previewImgBefore.src = srcUrl;
  previewImgAfter.src = srcUrl;

  submitFile(workingFile);
}

function submitFile(file) {
  taskId = taskQueue.submitTask(file);
  const { status, progress } = taskQueue.getTaskStatus(taskId);
  renderStatus(status, progress);
}

function resetUI() {
  reqToken++;
  if (taskId) {
    taskQueue.abortTask(taskId);
    taskId = null;
  }
  if (srcUrl) URL.revokeObjectURL(srcUrl);
  srcUrl = null;
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  previewImgBefore.removeAttribute("src");
  previewImgAfter.removeAttribute("src");
  fileInput.value = "";
  previewSection.hidden = true;
  statusSection.hidden = true;
  metaWarning.hidden = true;
  metaName.textContent = "—";
  metaType.textContent = "—";
  metaSize.textContent = "—";
  metaRes.textContent = "—";
  metaMp.textContent = "—";
  progressFill.style.width = "0%";
  progressFill.classList.remove("done", "error");
  cancelBtn.hidden = true;
  downloadBtn.hidden = true;
}
