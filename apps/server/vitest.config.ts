import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 集成测试会创建真实业务 Worker，避免文件间并行挤占其启动与执行资源。
    fileParallelism: false,
  },
});
