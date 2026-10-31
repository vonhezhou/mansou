import { expect, it } from "vitest";
import iconv from "iconv-lite";
import { buildRequest } from "../src/request.js";
import type { BookSource } from "../src/types.js";

function source(options: object, header?: string): BookSource {
  return {
    bookSourceName: "请求夹具",
    bookSourceUrl: "https://books.test",
    searchUrl: `/search,${JSON.stringify({ method: "POST", ...options })}`,
    header,
  };
}

it.each([undefined, "application/json", "application/vnd.book+json"])(
  "JSON 字符串 body 保留中文并安全插入引号、换行和模板字面量：%s",
  (contentType) => {
    const key = '凡人"\\\n&{{page}}';
    const request = buildRequest(
      source({
        body: '{"q":"{{key}}","page":{{page}},"nested":["{{key}}"]}',
        ...(contentType ? { headers: { "content-type": contentType } } : {}),
      }),
      key,
      2,
    );
    expect(JSON.parse(Buffer.from(request.body!).toString())).toEqual({
      q: key,
      page: 2,
      nested: [key],
    });
    expect(
      Object.entries(request.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1],
    ).toContain(contentType ?? "application/json");
  },
);

it("JSON 字符串数组 body 以指定编码发送，源级请求头同样生效", () => {
  const request = buildRequest(
    source(
      { body: '["{{key}}"]', charset: "gbk" },
      JSON.stringify({ "Content-Type": "application/json" }),
    ),
    "凡人",
    1,
  );
  expect(JSON.parse(iconv.decode(Buffer.from(request.body!), "gbk"))).toEqual(["凡人"]);
});

it("声明 JSON 的非法 body 不能降级成表单发送", () => {
  expect(() =>
    buildRequest(
      source({ headers: { "Content-Type": "application/json" }, body: "{bad}" }),
      "凡人",
      1,
    ),
  ).toThrow(/JSON/);
});

it("JSON 字符串中的脚本表达式仍明确拒绝", () => {
  expect(() => buildRequest(source({ body: '{"q":"{{java.ajax()}}"}' }), "凡人", 1)).toThrow(
    /不执行 JS/,
  );
});

it("普通表单继续编码关键词，不能因 JSON 支持改变表单契约", () => {
  const request = buildRequest(source({ body: "q={{key}}&page={{page}}" }), "凡人&x", 2);
  expect(Buffer.from(request.body!).toString()).toBe("q=%E5%87%A1%E4%BA%BA%26x&page=2");
  expect(request.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
});
