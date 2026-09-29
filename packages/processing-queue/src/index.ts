export type JobState = "queued" | "processing" | "done" | "failed" | "cancelled";

export interface Job<T, R> {
  id: string;
  payload: T;
  state: JobState;
  attempts: number;
  result?: R;
  error?: Error;
}

export interface QueueSnapshot {
  total: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
  cancelled: number;
  paused: boolean;
  finished: boolean;
}

export type Processor<T, R> = (payload: T, ctx: { signal: AbortSignal; attempt: number; id: string }) => Promise<R>;

export interface QueueOptions {
  concurrency?: number;
}

/**
 * Small in-memory job queue with a bounded worker pool. Jobs never throw into the caller:
 * a failure marks the job "failed" and the pool keeps going (retry re-queues it).
 */
export class JobQueue<T, R> {
  private jobs = new Map<string, Job<T, R>>();
  private order: string[] = [];
  private controllers = new Map<string, AbortController>();
  private running = 0;
  private paused = false;
  private listeners = new Set<(job: Job<T, R>, snapshot: QueueSnapshot) => void>();
  private idleWaiters: Array<() => void> = [];

  constructor(private processor: Processor<T, R>, private options: QueueOptions = {}) {}

  get concurrency(): number {
    return Math.max(1, this.options.concurrency ?? 2);
  }

  set concurrency(n: number) {
    this.options.concurrency = n;
    this.pump();
  }

  onChange(fn: (job: Job<T, R>, snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(id: string, payload: T): Job<T, R> {
    if (this.jobs.has(id)) throw new Error(`Job ${id} already exists`);
    const job: Job<T, R> = { id, payload, state: "queued", attempts: 0 };
    this.jobs.set(id, job);
    this.order.push(id);
    this.emit(job);
    this.pump();
    return job;
  }

  get(id: string): Job<T, R> | undefined {
    return this.jobs.get(id);
  }

  list(): Job<T, R>[] {
    return this.order.map((id) => this.jobs.get(id)!);
  }

  snapshot(): QueueSnapshot {
    const c = { queued: 0, processing: 0, done: 0, failed: 0, cancelled: 0 };
    for (const j of this.jobs.values()) c[j.state]++;
    return { total: this.jobs.size, ...c, paused: this.paused, finished: c.queued === 0 && c.processing === 0 };
  }

  pause(): void {
    this.paused = true;
    this.emitAll();
  }

  resume(): void {
    this.paused = false;
    this.emitAll();
    this.pump();
  }

  /** Cancel one job, or everything that hasn't finished. Running jobs are aborted via their signal. */
  cancel(id?: string): void {
    const targets = id ? [this.jobs.get(id)].filter(Boolean) : this.list();
    for (const job of targets as Job<T, R>[]) {
      if (job.state === "queued") {
        job.state = "cancelled";
        this.emit(job);
      } else if (job.state === "processing") {
        this.controllers.get(job.id)?.abort();
      }
    }
    this.resolveIdle();
  }

  /** Re-queue a failed/cancelled job. */
  retry(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || (job.state !== "failed" && job.state !== "cancelled")) return false;
    job.state = "queued";
    job.error = undefined;
    job.result = undefined;
    this.emit(job);
    this.pump();
    return true;
  }

  /** Run a finished (or failed/cancelled) job again, e.g. after its settings changed. Not allowed while it is processing. */
  requeue(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.state === "processing") return false;
    job.state = "queued";
    job.error = undefined;
    job.result = undefined;
    this.emit(job);
    this.pump();
    return true;
  }

  retryFailed(): number {
    let n = 0;
    for (const job of this.list()) if (job.state === "failed" && this.retry(job.id)) n++;
    return n;
  }

  /** Resolves once nothing is queued or running (ignores pause: a paused queue with work never idles). */
  onIdle(): Promise<void> {
    if (this.snapshot().finished) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (!this.paused && this.running < this.concurrency) {
      const next = this.order.map((id) => this.jobs.get(id)!).find((j) => j.state === "queued");
      if (!next) break;
      void this.run(next);
    }
    this.resolveIdle();
  }

  private async run(job: Job<T, R>): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    job.state = "processing";
    job.attempts++;
    this.running++;
    this.emit(job);
    try {
      const result = await this.processor(job.payload, { signal: controller.signal, attempt: job.attempts, id: job.id });
      if (controller.signal.aborted) {
        job.state = "cancelled";
      } else {
        job.result = result;
        job.state = "done";
      }
    } catch (err) {
      if (controller.signal.aborted) {
        job.state = "cancelled";
      } else {
        job.error = err instanceof Error ? err : new Error(String(err));
        job.state = "failed";
      }
    } finally {
      this.running--;
      this.controllers.delete(job.id);
      this.emit(job);
      this.pump();
    }
  }

  private emit(job: Job<T, R>): void {
    const snap = this.snapshot();
    for (const l of this.listeners) {
      try {
        l(job, snap);
      } catch {
        /* listeners must never break the queue */
      }
    }
  }

  private emitAll(): void {
    for (const job of this.list().slice(0, 1)) this.emit(job);
  }

  private resolveIdle(): void {
    if (this.snapshot().finished) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
  }
}
