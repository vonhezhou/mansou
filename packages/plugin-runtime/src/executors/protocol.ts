import type { SourceProvider, SourceMetadata } from "@mansou/core";
export type Operation = keyof SourceProvider;
export type Arguments<K extends Operation> = Parameters<SourceProvider[K]>;
export type Result<K extends Operation> = Awaited<ReturnType<SourceProvider[K]>>;
const operationManifest = {
  metadata: true,
  search: true,
  comicDetails: true,
  comicPages: true,
  loadImageBytes: true,
  settings: true,
  updateSettings: true,
  resetSettings: true,
  invokeSetting: true,
  respondToDialog: true,
  auth: true,
  login: true,
  logout: true,
  cookies: true,
  importCookies: true,
  clearCookies: true,
} satisfies Record<Operation, true>;
export const operations: ReadonlySet<string> = new Set(Object.keys(operationManifest));
export interface Executor {
  readonly metadata: SourceMetadata;
  call<K extends Operation>(method: K, args: Arguments<K>): Promise<Result<K>>;
  close(): Promise<void>;
  diagnostics(): Record<string, unknown>;
}
export function dispatch<K extends Operation>(
  provider: SourceProvider,
  method: K,
  args: Arguments<K>,
): Promise<Result<K>> {
  if (!operations.has(method)) throw new Error(`Unknown source operation: ${method}`);
  const operation = provider[method] as (...args: Arguments<K>) => Promise<Result<K>>;
  return operation.apply(provider, args);
}
