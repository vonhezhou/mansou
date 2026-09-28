import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";
import openapiTS, { astToString } from "openapi-typescript";
import { format } from "prettier";

const root = new URL("../", import.meta.url);
const document = parse(await readFile(new URL("openapi.yaml", root), "utf8"));
const banner = "// Generated from openapi.yaml. Do not edit.\n";
const outputs = {
  "src/api.generated.ts": banner + astToString(await openapiTS(document)),
  "src/openapi.generated.ts":
    banner + `export const openApiDocument = ${JSON.stringify(document)} as const;\n`,
};
for (const [file, source] of Object.entries(outputs)) {
  const content = await format(source, { parser: "typescript", printWidth: 100 });
  const url = new URL(file, root);
  if (process.argv.includes("--check")) {
    if ((await readFile(url, "utf8").catch(() => "")) !== content) {
      throw new Error(`${file} is stale; run pnpm --filter @venera/contracts generate`);
    }
  } else await writeFile(url, content);
}
