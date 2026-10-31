import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Application } from "../../src/application.js";

export const mockSourceFile = path.resolve("fixtures", "sources", "mock.js");

// 测试显式安装夹具并提供离线图片，产品启动和图片代理不包含 Mock 分支。
export async function installMockSource(context: Application) {
  await mkdir(context.paths.scripts, { recursive: true });
  await copyFile(mockSourceFile, path.join(context.paths.scripts, "mock.js"));
  const original = context.imageProxy.loadBytes.bind(context.imageProxy);
  context.imageProxy.loadBytes = async (input, useCache) => {
    if (input.sourceKey === "mock" && input.imageKey.startsWith("mock://")) {
      return {
        data: Buffer.from(mockSvg(input.imageKey)),
        contentType: "image/svg+xml; charset=utf-8",
        cached: false,
      };
    }
    return original(input, useCache);
  };
}

function mockSvg(label: string) {
  const safeLabel = label.replace(
    /[<>&]/g,
    (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]!,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="url(#bg)"/>
  <circle cx="740" cy="180" r="90" fill="#64748b" opacity="0.35"/>
  <text x="450" y="560" text-anchor="middle" font-family="Arial, sans-serif" font-size="54" fill="#f8fafc">Mansou</text>
  <text x="450" y="640" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#cbd5e1">${safeLabel}</text>
</svg>`;
}
