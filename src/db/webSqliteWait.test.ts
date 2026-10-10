/**
 * @jest-environment node
 */
import path from 'path';
import { Worker as ThreadWorker } from 'worker_threads';

// expo-sqlite's package exports hide its web sources, so load the file by path.
const { invokeWorkerSync } = require(
  path.join(path.dirname(require.resolve('expo-sqlite/package.json')), 'web', 'WorkerChannel'),
) as { invokeWorkerSync: (worker: Worker, type: string, data: unknown) => unknown };

// On web, every synchronous SQLite call busy-waits on the main thread for the SQLite worker to answer.
// Stock expo-sqlite gives up after a fixed number of spins, which is only a few tens of milliseconds,
// so an ordinary write that commits slowly to browser storage threw "Sync operation timeout".
// patches/expo-sqlite+57.0.4.patch makes the wait a wall-clock deadline instead.

// The old spin budget measured 16 ms in plain Node, about 30 ms in Chromium and about 210 ms under Jest.
const ANSWER_AFTER_MS = 1000;

/** A stand-in for the SQLite worker: answers each sync message from another thread, after a delay. */
function slowWorker(answer: unknown): Worker {
  const source = `
    const { parentPort } = require('worker_threads');
    parentPort.on('message', ({ lockBuffer, resultBuffer, json, delayMs }) => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      const bytes = new TextEncoder().encode(json);
      new Uint32Array(resultBuffer, 0, 1)[0] = bytes.length;
      new Uint8Array(resultBuffer).set(bytes, 4);
      const lock = new Int32Array(lockBuffer);
      Atomics.store(lock, 0, 2);
      Atomics.notify(lock, 0);
    });
  `;
  const thread = new ThreadWorker(source, { eval: true });
  threads.push(thread);
  return {
    postMessage: (message: { lockBuffer: SharedArrayBuffer; resultBuffer: SharedArrayBuffer }) =>
      thread.postMessage({
        lockBuffer: message.lockBuffer,
        resultBuffer: message.resultBuffer,
        json: JSON.stringify({ result: answer }),
        delayMs: ANSWER_AFTER_MS,
      }),
  } as unknown as Worker;
}

const threads: ThreadWorker[] = [];

afterEach(async () => {
  await Promise.all(threads.splice(0).map((thread) => thread.terminate()));
});

test('a sync call waits for a worker that takes longer than the old spin budget', async () => {
  const worker = slowWorker({ changes: 1, lastInsertRowId: 7 });
  // Let the thread start before the main thread starts spinning.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  const started = Date.now();
  const result = invokeWorkerSync(worker, 'run', {});

  expect(result).toEqual({ changes: 1, lastInsertRowId: 7 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(ANSWER_AFTER_MS - 20);
  warn.mockRestore();
});
