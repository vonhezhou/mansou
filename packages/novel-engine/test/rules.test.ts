import { expect, it } from "vitest";
import { HtmlRules, validateRule } from "../src/rules.js";

it("children 仅选择直接子元素，索引按各父节点计算", () => {
  const parser = new HtmlRules(
    '<div class="row"><a>A</a><section><a>B</a></section></div><div class="row"><a>C</a><section><a>D</a></section></div>',
  );
  expect(parser.elements(".row@children").length).toBe(4);
  expect(parser.elements(".row@children.0").text()).toBe("AC");
  expect(parser.elements(".row@[0]").text()).toBe("AC");
  expect(parser.string("children[-1]@text", parser.$(".row")[0]!)).toBe("B");
});

it("all 返回完整 HTML，html 去掉脚本，二者不修改原 DOM", () => {
  const parser = new HtmlRules("<div><p>正文</p><script>data()</script><style>.x{}</style></div>");
  const root = parser.$("div")[0]!;
  expect(parser.string("all", root)).toContain("<script>data()</script>");
  expect(parser.string("html", root)).not.toContain("<script>");
  expect(parser.string("all", root)).toContain("<style>");
  expect(parser.$("script").length).toBe(1);
});

it("text 保留块与换行之间的词边界，行内元素不额外分词", () => {
  const parser = new HtmlRules(
    "<div>甲<br>乙<p>丙</p>丁<span>戊</span>己<script>bad()</script><style>bad</style></div>",
  );
  expect(parser.string("text", parser.$("div")[0]!)).toBe("甲 乙 丙 丁戊己");
});

it("ownText 保留 br 与块元素的间隔但排除子元素文字", () => {
  const parser = new HtmlRules("<div>甲<br>乙<p>子元素</p>丙<span>子元素</span>丁</div>");
  expect(parser.string("ownText", parser.$("div")[0]!)).toBe("甲 乙 丙丁");
});

it("CSS 前缀大小写无关，CSS 模式不误用旧式 tag/class 选择语义", () => {
  const parser = new HtmlRules('<tag class="div">CSS</tag><div>legacy</div>');
  expect(parser.elements("@CSS:tag.div").text()).toBe("CSS");
  expect(parser.elements("tag.div").text()).toBe("legacy");
  expect(parser.string("@Css:tag.div@text", parser.$.root()[0]!)).toBe("CSS");
});

it("CSS 模式对回退分支同样生效，属性中的分隔符不被拆开", () => {
  const parser = new HtmlRules('<tag class="span" title="a@b||c">CSS</tag><span>legacy</span>');
  expect(parser.elements('@css:.missing||tag.span[title="a@b||c"]').text()).toBe("CSS");
  expect(parser.string("@css:.missing@text||tag.span@text", parser.$.root()[0]!)).toBe("CSS");
});

it("children、all 等规则在导入校验与执行阶段保持一致", () => {
  expect(() => validateRule("children[!0]", "elements")).not.toThrow();
  expect(() => validateRule("children@all", "string")).not.toThrow();
});

it("交错组合 %% 保留节点顺序，按首个非空分支长度交错", () => {
  const parser = new HtmlRules("<div><a>A</a><a>C</a><b>B</b><b>D</b><b>E</b></div>");
  expect(parser.elements(".missing%%a%%b").text()).toBe("ABCD");
  expect(parser.string("a@text%%b@text", parser.$("div")[0]!)).toBe("A\nB\nC\nD");
});

it("交错字符串以每个元素为单位，不能拆散 textNodes 的内部换行", () => {
  const parser = new HtmlRules(
    "<div><a>甲<span>忽略</span>乙</a><a>丙</a><b>一</b><b>二</b></div>",
  );
  expect(parser.string("a@textNodes%%b@text", parser.$("div")[0]!)).toBe("甲\n乙\n一\n丙\n二");
});

it("交错组合兼容 CSS 模式，属性中的 %% 作为字面值处理", () => {
  const parser = new HtmlRules('<tag class="a" title="%%">A</tag><tag class="b">B</tag>');
  expect(parser.elements('@CSS:tag.a[title="%%"]%%tag.b').text()).toBe("AB");
});

it("不同组合运算符混用时明确拒绝，不能自创优先级后静默解析", () => {
  expect(() => validateRule("a&&b||c")).toThrow(/不支持规则/);
});

it("直接选择脚本或样式提取 text 时不返回代码", () => {
  const parser = new HtmlRules("<script>bad()</script><style>bad</style>");
  expect(parser.string("script@text", parser.$.root()[0]!)).toBe("");
});
