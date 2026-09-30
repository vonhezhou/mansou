import { AppError } from "../../errors.js";

type Execution = { controller: AbortController; done: Promise<unknown> };

export class DownloadScheduler {
  private readonly active = new Map<string, Execution>();
  private stopped = false;
  private scheduled = false;
  constructor(
    private readonly limit: number,
    private readonly queued: () => string[],
    private readonly run: (id: string, signal: AbortSignal) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}
  get closing() {
    return this.stopped;
  }
  kick() {
    if (this.stopped || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.stopped) return;
      try {
        for (const id of this.queued()) {
          if (this.active.size >= this.limit) break;
          if (!this.active.has(id))
            void this.execute(id, (signal) => this.run(id, signal)).catch(this.onError);
        }
      } catch (error) {
        this.onError(error);
      }
    });
  }
  execute<T>(id: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.stopped) throw new AppError("APP_CLOSING", "Service is closing");
    if (this.active.has(id) || this.active.size >= this.limit) {
      throw new AppError("DOWNLOAD_BUSY", "Download execution is busy");
    }
    const controller = new AbortController();
    const execution: Execution = { controller, done: Promise.resolve() };
    this.active.set(id, execution);
    const done = Promise.resolve()
      .then(() => work(controller.signal))
      .finally(() => {
        if (this.active.get(id) === execution) this.active.delete(id);
        this.kick();
      });
    execution.done = done;
    return done;
  }
  stop(id: string) {
    this.active.get(id)?.controller.abort();
  }
  async wait(id: string) {
    await Promise.allSettled([this.active.get(id)?.done]);
  }
  async close() {
    this.stopped = true;
    for (const execution of this.active.values()) execution.controller.abort();
    await Promise.allSettled([...this.active.values()].map((execution) => execution.done));
  }
}
