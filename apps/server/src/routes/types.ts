import type { Application } from "../application.js";
export type RouteContext = Pick<
  Application,
  "auth" | "repository" | "sources" | "search" | "imageProxy" | "downloads"
>;
