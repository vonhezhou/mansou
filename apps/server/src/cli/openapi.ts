import { writeFile } from "node:fs/promises";
import { openApiDocument } from "../routes/openapi.js";

const output = process.argv[2] ?? "openapi.json";
await writeFile(output, `${JSON.stringify(openApiDocument, null, 2)}\n`, "utf8");
console.log(output);
