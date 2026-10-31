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

it("源级和请求级同名请求头按大小写无关覆盖，不能发送逗号拼接的重复值", () => {
  const request = buildRequest(
    source(
      {
        body: "q={{key}}",
        headers: {
          "user-agent": "custom",
          "content-type": "application/x-www-form-urlencoded",
          "x-token": "new",
        },
      },
      JSON.stringify({ "X-Token": "old", "Content-Type": "application/json" }),
    ),
    "凡人",
    1,
  );
  const headers = new Headers(request.headers);
  expect(headers.get("user-agent")).toBe("custom");
  expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
  expect(headers.get("x-token")).toBe("new");
});

it.each(["text/plain", "application/xml"])("显式原始请求体不使用表单编码：%s", (contentType) => {
  const request = buildRequest(
    source({ headers: { "Content-Type": contentType }, body: "正文={{key}}" }),
    "凡人",
    1,
  );
  expect(Buffer.from(request.body!).toString()).toBe("正文=凡人");
});

it("明确声明纯文本的花括号 body 不能被误判为 JSON", () => {
  const request = buildRequest(
    source({ headers: { "Content-Type": "text/plain" }, body: "{关键词={{key}}}" }),
    "凡人",
    1,
  );
  expect(Buffer.from(request.body!).toString()).toBe("{关键词=凡人}");
});

it("GBK 表单中的静态中文字段与关键词同样编码，已有百分号编码不重复转义", () => {
  const request = buildRequest(
    source({ charset: "gbk", body: "q={{key}}&类型=玄幻&old=%B7%B2&plus=a+b&raw=%" }),
    "凡人",
    1,
  );
  expect(Buffer.from(request.body!).toString()).toBe(
    "q=%B7%B2%C8%CB&%C0%E0%D0%CD=%D0%FE%BB%C3&old=%B7%B2&plus=a+b&raw=%25",
  );
});

it("GBK 查询参数中的静态中文不能被 URL 自动转成 UTF-8", () => {
  const request = buildRequest(
    { ...source({}), searchUrl: '/search?q={{key}}&kind=玄幻,{charset:"gbk"}' },
    "凡人",
    1,
  );
  expect(request.url).toBe("https://books.test/search?q=%B7%B2%C8%CB&kind=%D0%FE%BB%C3");
});

it.each(["bad name", "X-Query"])("非法请求头在构造请求时明确失败：%s", (name) => {
  expect(() =>
    buildRequest(source({ headers: { [name]: "{{key}}" } }), "x\r\nInjected: true", 1),
  ).toThrow(/请求头/);
});
