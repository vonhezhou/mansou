export type PluginErrorCode =
  | "SOURCE_CAPABILITY_UNSUPPORTED"
  | "SOURCE_SETTINGS_INVALID"
  | "SOURCE_LOGIN_FAILED"
  | "SOURCE_ACCESS_RESTRICTED"
  | "PLUGIN_API_MISSING"
  | "PLUGIN_TIMEOUT"
  | "PLUGIN_NETWORK_ERROR"
  | "PLUGIN_SOURCE_ERROR"
  | "SOURCE_NOT_LOADED"
  | "IMAGE_REJECTED";

export class PluginRuntimeError extends Error {
  get statusCode() {
    return this.code === "SOURCE_ACCESS_RESTRICTED"
      ? 403
      : this.code === "SOURCE_SETTINGS_INVALID"
        ? 400
        : this.code === "SOURCE_LOGIN_FAILED"
          ? 422
          : this.code === "SOURCE_CAPABILITY_UNSUPPORTED"
            ? 400
            : 500;
  }
  constructor(
    public readonly code: PluginErrorCode,
    message: string,
    public readonly sourceKey?: string,
    public readonly operation?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PluginRuntimeError";
  }
}

export function classifyPluginError(error: unknown, sourceKey?: string, operation?: string) {
  if (error instanceof PluginRuntimeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not defined") || message.includes("is not a function")) {
    return new PluginRuntimeError("PLUGIN_API_MISSING", message, sourceKey, operation, error);
  }
  if (message.includes("timed out")) {
    return new PluginRuntimeError("PLUGIN_TIMEOUT", message, sourceKey, operation, error);
  }
  if (
    message.includes("fetch failed") ||
    message.includes("aborted") ||
    message.includes("ECONN")
  ) {
    return new PluginRuntimeError("PLUGIN_NETWORK_ERROR", message, sourceKey, operation, error);
  }
  if (
    message.includes("403") ||
    message.includes("404") ||
    message.includes("Unsupported image protocol")
  ) {
    return new PluginRuntimeError("IMAGE_REJECTED", message, sourceKey, operation, error);
  }
  return new PluginRuntimeError("PLUGIN_SOURCE_ERROR", message, sourceKey, operation, error);
}
