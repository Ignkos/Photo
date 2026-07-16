export const TaskStatus = Object.freeze({
  QUEUED: "queued",
  PROCESSING: "processing",
  DONE: "done",
  ERROR: "error",
  ABORTED: "aborted",
});

const MAX_PROCESSING_MS = 30_000;

class ImageTaskQueue extends EventTarget {
  #tasks = new Map();

  submitTask(file, params = {}) {
    if (!(file instanceof Blob)) {
      throw new TypeError("submitTask: file должен быть File или Blob");
    }
    const id = this.#generateId();
    const task = {
      id,
      status: TaskStatus.QUEUED,
      progress: 0,
      file,
      params,
      result: null,
      appliedParams: null,
      error: null,
      aborted: false,
      worker: null,
      timeoutId: null,
    };
    this.#tasks.set(id, task);
    this.#emitStatus(task);
    queueMicrotask(() => this.#run(task));
    return id;
  }

  getTaskStatus(id) {
    const task = this.#requireTask(id);
    return { status: task.status, progress: task.progress };
  }

  abortTask(id) {
    const task = this.#requireTask(id);
    const finished = [TaskStatus.DONE, TaskStatus.ERROR, TaskStatus.ABORTED];
    if (finished.includes(task.status)) return false;
    task.aborted = true;
    task.status = TaskStatus.ABORTED;
    this.#cleanupWorker(task);
    this.#emitStatus(task);
    return true;
  }

  getTaskResult(id) {
    const task = this.#requireTask(id);
    if (task.status !== TaskStatus.DONE) {
      throw new Error(`Задача ${id} ещё не готова (текущий статус: ${task.status})`);
    }
    return task.result;
  }

  #requireTask(id) {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`Неизвестный taskId: ${id}`);
    return task;
  }

  #generateId() {
    return crypto.randomUUID();
  }

  #emitStatus(task) {
    this.dispatchEvent(
      new CustomEvent("statuschange", {
        detail: {
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          appliedParams: task.appliedParams,
        },
      })
    );
  }

  #cleanupWorker(task) {
    if (task.worker) {
      task.worker.terminate();
      task.worker = null;
    }
    if (task.timeoutId) {
      clearTimeout(task.timeoutId);
      task.timeoutId = null;
    }
  }

  #run(task) {
    if (task.aborted) return;
    task.status = TaskStatus.PROCESSING;
    this.#emitStatus(task);

    const worker = new Worker(new URL("./imageProcessor.worker.js", import.meta.url), {
      type: "module",
    });
    task.worker = worker;

    task.timeoutId = setTimeout(() => {
      if (task.aborted || task.status === TaskStatus.DONE) return;
      task.status = TaskStatus.ERROR;
      task.error = `Превышено максимальное время обработки (${MAX_PROCESSING_MS / 1000} с)`;
      this.#cleanupWorker(task);
      this.#emitStatus(task);
    }, MAX_PROCESSING_MS);

    worker.onmessage = (e) => {
      if (task.aborted) return;
      const { type, progress, blob, message, appliedParams } = e.data;

      if (type === "progress") {
        task.progress = progress;
        this.#emitStatus(task);
      } else if (type === "done") {
        task.status = TaskStatus.DONE;
        task.progress = 100;
        task.result = blob;
        task.appliedParams = appliedParams ?? null;
        this.#cleanupWorker(task);
        this.#emitStatus(task);
      } else if (type === "error") {
        task.status = TaskStatus.ERROR;
        task.error = message;
        this.#cleanupWorker(task);
        this.#emitStatus(task);
      }
    };

    worker.onerror = (err) => {
      if (task.aborted || task.status === TaskStatus.DONE) return;
      task.status = TaskStatus.ERROR;
      task.error = err.message ?? "Неизвестная ошибка worker'а";
      this.#cleanupWorker(task);
      this.#emitStatus(task);
    };

    worker.postMessage({ taskId: task.id, file: task.file, params: task.params });
  }
}

export const taskQueue = new ImageTaskQueue();
