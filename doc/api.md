# API 与客户端生成

OpenAPI 文档地址：

```text
GET /api/v1/openapi.json
```

导出到文件：

```bash
pnpm --filter @venera/server openapi openapi.json
```

生成 TypeScript 客户端示例：

```bash
npx openapi-typescript openapi.json -o api-types.ts
npx @hey-api/openapi-ts -i openapi.json -o generated-client
```

如果启用了 `VENERA_ACCESS_TOKEN`，普通 API 使用：

```text
Authorization: Bearer <token>
```

图片和 SSE 这类浏览器无法设置自定义请求头的场景，也支持：

```text
?access_token=<token>
```
