import { once } from "node:events";
import { Writable } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { createDownloadSnapshotWriter } from "../src/routes/downloadSnapshotWriter.js";

const streams: Writable[] = [];
afterEach(() => {
  streams.splice(0).forEach((stream) => stream.destroy());
});
function setup() {
  const received: string[] = [];
  const releases: Array<() => void> = [];
  const stream = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      received.push(chunk.toString());
      releases.push(() => callback());
    },
  });
  streams.push(stream);
  const valid = vi.fn(() => !stream.destroyed && !stream.writableEnded);
  const writer = createDownloadSnapshotWriter(stream, valid);
  async function flush() {
    const drained = once(stream, "drain");
    releases.shift()!();
    await drained;
  }
  return { stream, writer, received, valid, flush };
}

it("bounds slow-client buffering and sends only the latest pending snapshot after drain", async () => {
  const { stream, writer, received, flush } = setup();
  const write = vi.spyOn(stream, "write");
  for (let index = 0; index < 100; index++) writer.send(`snapshot-${index}`);
  expect(write).toHaveBeenCalledOnce();
  expect(stream.writableLength).toBe(Buffer.byteLength("snapshot-0"));
  await flush();
  expect(received).toEqual(["snapshot-0", "snapshot-99"]);
  expect(write).toHaveBeenCalledTimes(2);
  await flush();
  expect(stream.writableLength).toBe(0);
  expect(write).toHaveBeenCalledTimes(2);
});

it("skips blocked heartbeats without replacing snapshots and resumes idle heartbeats", async () => {
  const { writer, received, flush } = setup();
  writer.send("first");
  writer.send("latest");
  writer.heartbeat();
  writer.heartbeat();
  await flush();
  expect(received).toEqual(["first", "latest"]);
  await flush();
  writer.heartbeat();
  expect(received).toEqual(["first", "latest", ": heartbeat\n\n"]);
  await flush();
});

it("rechecks authorization before writing a snapshot held during backpressure", async () => {
  const { writer, received, valid, flush } = setup();
  writer.send("first");
  writer.send("pending");
  valid.mockReturnValue(false);
  await flush();
  expect(received).toEqual(["first"]);
  expect(valid).toHaveBeenCalledTimes(3);
});

it("releases pending snapshots and the drain handler when the connection closes", async () => {
  const { stream, writer, received } = setup();
  writer.send("first");
  writer.send("pending");
  const closed = once(stream, "close");
  stream.destroy();
  await closed;
  expect(stream.listenerCount("drain")).toBe(0);
  stream.emit("drain");
  writer.send("after close");
  expect(received).toEqual(["first"]);
});

it("preserves every snapshot while the connection can keep up", () => {
  const received: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      received.push(chunk.toString());
      callback();
    },
  });
  streams.push(stream);
  const writer = createDownloadSnapshotWriter(stream, () => true);
  writer.send("first");
  writer.send("second");
  expect(received).toEqual(["first", "second"]);
});
