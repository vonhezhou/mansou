import type { components } from "./api.generated.js";

// Public HTTP types derive from the YAML contract; domain ports live in @mansou/core.
export type SourceSummary = components["schemas"]["SourceSummary"];
export type Comic = components["schemas"]["Comic"];
export type ComicDetails = components["schemas"]["ComicDetails"];
export type EpisodePages = components["schemas"]["EpisodePages"];
export type DownloadTask = components["schemas"]["DownloadTask"];
export type ApiError = components["schemas"]["ApiError"];
export { openApiDocument } from "./openapi.generated.js";
export type { paths, components, operations } from "./api.generated.js";
