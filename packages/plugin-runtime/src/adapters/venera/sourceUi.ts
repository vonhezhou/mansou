import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { SourceUiEvent } from "@mansou/core";
import { PluginRuntimeError } from "../../errors.js";

type Button = { text: string; callback?: () => unknown };
type Scope = {
  events: SourceUiEvent[];
  pending: Set<Promise<unknown>>;
  dialogs: string[];
  open: boolean;
};

export class SourceUi {
  private readonly scope = new AsyncLocalStorage<Scope>();
  private readonly dialogs = new Map<string, { buttons: Button[]; expires: number }>();
  constructor(private readonly translate: (text: string) => string) {}

  message(value: unknown) {
    const message = this.translate(String(value));
    const scope = this.scope.getStore();
    if (scope?.open) scope.events.push({ type: "message", message });
    else console.info(message);
  }

  dialog(title: unknown, message: unknown, buttons: Button[] = []) {
    const scope = this.scope.getStore();
    if (!scope?.open) {
      console.info(String(title), String(message));
      return;
    }
    this.prune();
    if (this.dialogs.size >= 32) throw new Error("Too many pending source dialogs");
    const id = randomUUID();
    const choices = buttons.length ? buttons : [{ text: "Close" }];
    this.dialogs.set(id, { buttons: choices, expires: Date.now() + 5 * 60_000 });
    scope.dialogs.push(id);
    scope.events.push({
      type: "dialog",
      id,
      title: this.translate(String(title)),
      message: this.translate(String(message)),
      buttons: choices.map((button) => this.translate(String(button.text))),
    });
  }

  async capture(task: () => unknown): Promise<SourceUiEvent[]> {
    const scope: Scope = { events: [], pending: new Set(), dialogs: [], open: true };
    return this.scope.run(scope, async () => {
      try {
        await task();
        // 一些源回调启动网络任务后不返回 Promise，等待其消息及后续弹窗。
        while (scope.pending.size) {
          await Promise.allSettled([...scope.pending]);
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        return scope.events;
      } catch (error) {
        for (const id of scope.dialogs) this.dialogs.delete(id);
        throw error;
      } finally {
        scope.open = false;
      }
    });
  }

  respond(id: string, buttonIndex: number | null) {
    this.prune();
    const dialog = this.dialogs.get(id);
    if (!dialog)
      throw new PluginRuntimeError("SOURCE_INTERACTION_EXPIRED", "操作已过期，请重新执行源操作。");
    if (
      buttonIndex !== null &&
      (!Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex >= dialog.buttons.length)
    )
      throw new PluginRuntimeError("SOURCE_SETTINGS_INVALID", "无效的源操作选项");
    // 先消费令牌，避免双击或重试重复执行同一个回调。
    this.dialogs.delete(id);
    return this.capture(() =>
      buttonIndex === null ? undefined : dialog.buttons[buttonIndex].callback?.(),
    );
  }

  track<T>(promise: Promise<T>): Promise<T> {
    const scope = this.scope.getStore();
    if (scope?.open) {
      scope.pending.add(promise);
      const done = () => {
        scope.pending.delete(promise);
      };
      void promise.then(done, done);
    }
    return promise;
  }

  observeResponse(response: Response) {
    for (const method of ["text", "json", "arrayBuffer", "blob", "formData"] as const) {
      const read = response[method].bind(response);
      Object.defineProperty(response, method, {
        value: (...args: unknown[]) => this.track(Reflect.apply(read, response, args)),
      });
    }
    return response;
  }

  private prune() {
    for (const [id, dialog] of this.dialogs)
      if (dialog.expires <= Date.now()) this.dialogs.delete(id);
  }
}
