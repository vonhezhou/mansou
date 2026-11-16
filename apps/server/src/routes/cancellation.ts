import type { FastifyReply } from "fastify";

export async function withCancellation<T>(
  reply: FastifyReply,
  work: (signal: AbortSignal) => Promise<T>,
) {
  const controller = new AbortController();
  const cancel = () => {
    if (!reply.raw.writableFinished) controller.abort();
  };
  reply.raw.on("close", cancel);
  try {
    return await work(controller.signal);
  } finally {
    controller.abort();
    reply.raw.off("close", cancel);
  }
}
