import type { SourceProvider } from "@venera/core";
import type { RuntimeOptions } from "../options.js";
import { loadVenera } from "./venera/load.js";
export async function loadProvider(
  filePath: string,
  options: RuntimeOptions,
): Promise<{ provider: SourceProvider; close(): Promise<void> }> {
  return loadVenera(filePath, options);
}
