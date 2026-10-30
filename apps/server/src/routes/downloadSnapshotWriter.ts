export function createDownloadSnapshotWriter(stream: NodeJS.WritableStream, valid: () => boolean) {
  let blocked = false;
  let pending: string | undefined;
  const send = (data: string) => {
    if (!valid()) {
      pending = undefined;
      return;
    }
    if (blocked) pending = data;
    else blocked = !stream.write(data);
  };
  const drain = () => {
    blocked = false;
    const latest = pending;
    pending = undefined;
    if (latest !== undefined) send(latest);
  };
  stream.on("drain", drain);
  stream.once("close", () => {
    pending = undefined;
    stream.off("drain", drain);
  });
  return {
    send,
    heartbeat() {
      if (!valid()) pending = undefined;
      // 心跳不能覆盖待发快照，也不能在背压期间继续扩充写缓冲。
      else if (!blocked) blocked = !stream.write(": heartbeat\n\n");
    },
  };
}
