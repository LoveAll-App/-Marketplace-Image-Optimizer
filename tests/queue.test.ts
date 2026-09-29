import { describe, expect, it } from "vitest";
import { JobQueue } from "@moi/processing-queue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("JobQueue", () => {
  it("respects the concurrency limit and finishes everything", async () => {
    let active = 0, peak = 0;
    const q = new JobQueue<number, number>(async (n) => { active++; peak = Math.max(peak, active); await sleep(10); active--; return n * 2; }, { concurrency: 3 });
    for (let i = 0; i < 20; i++) q.add(String(i), i);
    await q.onIdle();
    expect(peak).toBeLessThanOrEqual(3);
    expect(q.snapshot()).toMatchObject({ total: 20, done: 20, failed: 0, finished: true });
    expect(q.get("7")?.result).toBe(14);
  });

  it("isolates failures and retries them", async () => {
    let attempts = 0;
    const q = new JobQueue<string, string>(async (s, { attempt }) => { if (s === "bad" && attempt === 1) { attempts++; throw new Error("boom"); } return s; }, { concurrency: 2 });
    ["a", "bad", "c"].forEach((s) => q.add(s, s));
    await q.onIdle();
    expect(q.snapshot()).toMatchObject({ done: 2, failed: 1 });
    expect(q.get("bad")?.error?.message).toBe("boom");
    expect(q.retryFailed()).toBe(1);
    await q.onIdle();
    expect(q.snapshot()).toMatchObject({ done: 3, failed: 0 });
    expect(attempts).toBe(1);
    expect(q.get("bad")?.attempts).toBe(2);
  });

  it("pauses and resumes", async () => {
    const q = new JobQueue<number, number>(async (n) => { await sleep(15); return n; }, { concurrency: 1 });
    q.pause();
    for (let i = 0; i < 4; i++) q.add(String(i), i);
    await sleep(40);
    expect(q.snapshot()).toMatchObject({ queued: 4, processing: 0, paused: true });
    q.resume();
    await q.onIdle();
    expect(q.snapshot().done).toBe(4);
  });

  it("cancels queued and running jobs", async () => {
    const q = new JobQueue<number, number>(async (n, { signal }) => { await new Promise<void>((res, rej) => { const t = setTimeout(res, 200); signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("aborted")); }); }); return n; }, { concurrency: 1 });
    for (let i = 0; i < 3; i++) q.add(String(i), i);
    await sleep(20);
    q.cancel();
    await q.onIdle();
    expect(q.snapshot()).toMatchObject({ cancelled: 3, done: 0, failed: 0 });
    expect(q.retry("1")).toBe(true);
    await q.onIdle();
    expect(q.get("1")?.state).toBe("done");
  });

  it("reports progress through listeners and survives a throwing listener", async () => {
    const q = new JobQueue<number, number>(async (n) => n, { concurrency: 2 });
    const seen: number[] = [];
    q.onChange(() => { throw new Error("listener bug"); });
    q.onChange((_j, s) => seen.push(s.done));
    for (let i = 0; i < 5; i++) q.add(String(i), i);
    await q.onIdle();
    expect(Math.max(...seen)).toBe(5);
  });

  it("scales to hundreds of jobs", async () => {
    const q = new JobQueue<number, number>(async (n) => n, { concurrency: 4 });
    for (let i = 0; i < 600; i++) q.add(String(i), i);
    await q.onIdle();
    expect(q.snapshot().done).toBe(600);
  });
});
