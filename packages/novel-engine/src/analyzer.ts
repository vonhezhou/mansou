import { JSONPath } from "jsonpath-plus";
import { DOMParser } from "@xmldom/xmldom";
import xpath from "xpath";
import JSON5 from "json5";
import { HtmlRules, validateRule as validateHtmlRule, combine, splitRule } from "./rules.js";
import { SourceScript, scriptCode } from "./script.js";
import { SourceError } from "./types.js";
import type { AnyNode } from "domhandler";

// JSONPath 会缓存求值回调，不能让该回调闭包持有某个书源的 QuickJS 上下文。
const filterScripts = new WeakMap<object, SourceScript>();
function evaluateFilter(code: string, context: object): unknown {
  const script = filterScripts.get(context);
  if (!script) throw new SourceError("SOURCE_ERROR", "JSONPath 脚本上下文已释放");
  return script.evaluate(code, context as Record<string, unknown>);
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
function isHtmlNode(value: unknown): value is AnyNode {
  return Boolean(value && typeof value === "object" && "type" in value && "parent" in value);
}
function isXmlNode(value: unknown): value is Node {
  return Boolean(value && typeof value === "object" && !isHtmlNode(value) && "nodeType" in value);
}
function mode(rule: string, input?: unknown) {
  if (/^@xpath:|^\/|^\.\//i.test(rule)) return "xpath";
  if (/^@json:|^\$/i.test(rule)) return "json";
  if (
    !/^@css:/i.test(rule) &&
    input !== undefined &&
    !isHtmlNode(input) &&
    !isXmlNode(input) &&
    jsonValue(input) !== undefined
  )
    return "json";
  return "html";
}

/** 导入阶段只检查语法，不执行脚本、登录或网络请求。 */
export function validateSourceRule(rule: string, kind: "elements" | "string" = "elements") {
  if (!rule) return;
  if (/@webjs:|java\.(?:webView|startBrowser)/i.test(rule))
    throw new SourceError("UNSUPPORTED_RULE", "不支持浏览器规则");
  if (scriptCode(rule) !== undefined || /@js:|\{\{|@(?:put|get):/i.test(rule)) return;
  const parts = rule.split("##"),
    base = parts[0]!;
  if (parts.length > 1) {
    if (kind === "elements")
      throw new SourceError("UNSUPPORTED_RULE", "列表规则不支持文本正则替换");
    new HtmlRules("").replace(`##${parts.slice(1).join("##")}`, "");
  }
  if (mode(base) === "xpath") {
    try {
      xpath.parse(base.replace(/^@xpath:/i, ""));
    } catch {
      throw new SourceError("UNSUPPORTED_RULE", "XPath 语法错误");
    }
    return;
  }
  if (mode(base) === "json") {
    if (!base.replace(/^@json:/i, "").trim())
      throw new SourceError("UNSUPPORTED_RULE", "JSONPath 不能为空");
    return;
  }
  validateHtmlRule(rule, kind);
}

export class SourceRules {
  readonly html: HtmlRules;
  readonly root: unknown;
  private xml?: Document;
  constructor(
    readonly content: unknown,
    private readonly script?: SourceScript,
    readonly baseUrl = "",
  ) {
    this.html = new HtmlRules(typeof content === "string" ? content : "");
    this.root = jsonValue(content) !== undefined ? content : this.html.$.root()[0]!;
    if (script)
      script.analyze = (kind, rule, input) => {
        const analyzer = new SourceRules(input, script, baseUrl);
        if (kind === "rule.string") return analyzer.string(rule, analyzer.root);
        if (kind === "rule.list") return analyzer.strings(rule, analyzer.root);
        return analyzer.elements(rule, analyzer.root).map((row) => analyzer.serializable(row));
      };
  }
  private serializable(value: unknown): unknown {
    return isHtmlNode(value) ? this.html.$.html(value) : isXmlNode(value) ? String(value) : value;
  }
  private value(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (isHtmlNode(value)) return this.html.string("text", value);
    if (isXmlNode(value))
      return value.nodeType === 2 ? (value.nodeValue ?? "") : (value.textContent ?? "");
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  private evaluate(code: string, input: unknown): unknown {
    if (!this.script) throw new SourceError("UNSUPPORTED_RULE", "JS 规则需要书源脚本上下文");
    return this.script.evaluate(code, {
      result: input === this.root ? this.content : this.serializable(input),
      baseUrl: this.baseUrl,
    });
  }
  private prepare(rule: string, input: unknown): string {
    rule = rule.replace(/@put:(\{[^}]*\})/gi, (_, raw: string) => {
      if (!this.script) throw new SourceError("UNSUPPORTED_RULE", "变量规则需要书源上下文");
      const fields = JSON5.parse(raw) as Record<string, string>;
      for (const [key, value] of Object.entries(fields)) {
        const result = this.string(value, input);
        this.script.putVariable(key, result);
      }
      return "";
    });
    return rule.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression: string) =>
      this.value(this.evaluate(expression, input)),
    );
  }
  replace(rule: string, input: string): string {
    const code = scriptCode(rule);
    if (code !== undefined) return this.value(this.evaluate(code, input));
    return this.html.replace(this.prepare(rule, input), input);
  }
  strings(rule: string, input: unknown = this.root): string[] {
    if (mode(rule, input) === "html" && scriptCode(rule) === undefined && !rule.includes("@js:")) {
      const parts = this.prepare(rule, input).split("##");
      return combine(parts[0]!, (branch) => {
        const path = splitRule(branch.replace(/^@css:/i, ""), "@").filter(Boolean);
        const terminal = path.pop() ?? "text";
        const selector = path.join("@");
        const rows = selector
          ? this.elements(`${/^@css:/i.test(rule) ? "@css:" : ""}${selector}`, input)
          : [input];
        return rows
          .map((row) => {
            const value = this.html.string(terminal, row as AnyNode);
            return parts.length > 1
              ? this.html.replace(`##${parts.slice(1).join("##")}`, value)
              : value;
          })
          .filter(Boolean);
      });
    }
    return this.elements(rule, input)
      .map((row) => this.value(row))
      .filter(Boolean);
  }
  elements(rule: string, input: unknown = this.root): unknown[] {
    rule = this.prepare(rule, input);
    const code = scriptCode(rule);
    if (code !== undefined) {
      const result = this.evaluate(code, input);
      return result === undefined || result === null
        ? []
        : Array.isArray(result)
          ? result
          : [result];
    }
    const pipeline = rule.indexOf("@js:");
    if (pipeline > 0) {
      const result = this.evaluate(
        rule.slice(pipeline + 4),
        this.string(rule.slice(0, pipeline), input),
      );
      return Array.isArray(result) ? result : result == null ? [] : [result];
    }
    const base = rule.split("##")[0]!;
    const type = mode(base, input);
    if (type === "html") {
      const node = isHtmlNode(input)
        ? input
        : new HtmlRules(String(this.serializable(input) ?? "")).$.root()[0]!;
      return this.html.elements(base, this.html.$(node)).toArray();
    }
    return combine(base, (branch) => {
      if (type === "json") {
        const data = jsonValue(input);
        if (data === undefined) throw new SourceError("PARSE_MISMATCH", "响应不是有效 JSON");
        let path = branch.replace(/^@json:/i, "").trim();
        if (!path.startsWith("$")) path = path.startsWith("[") ? `$${path}` : `$.${path}`;
        const sandbox = {};
        if (this.script) filterScripts.set(sandbox, this.script);
        try {
          return (
            JSONPath({
              path,
              json: data as object,
              wrap: true,
              sandbox,
              eval: this.script ? evaluateFilter : false,
            }) as unknown[]
          ).flat();
        } catch (error) {
          if (error instanceof SourceError) throw error;
          throw new SourceError(
            "PARSE_MISMATCH",
            `JSONPath 解析失败：${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          filterScripts.delete(sandbox);
        }
      }
      if (!this.xml && !isXmlNode(input)) {
        const raw = typeof this.content === "string" ? this.content : "";
        if (/<!ENTITY|<!DOCTYPE[^>]+(?:SYSTEM|PUBLIC)/i.test(raw))
          throw new SourceError("UNSUPPORTED_RULE", "不支持外部 XML 实体");
        this.xml = new DOMParser({
          onError: (level, message) => {
            if (level === "fatalError") throw new Error(message);
          },
        }).parseFromString(
          /^\s*<\?xml/.test(raw) ? raw : this.html.$.xml(),
          "application/xml",
        ) as unknown as Document;
      }
      try {
        const result = xpath.select(
          branch.replace(/^@xpath:/i, ""),
          isXmlNode(input) ? input : this.xml!,
        );
        return Array.isArray(result) ? result : result === null ? [] : [result];
      } catch {
        throw new SourceError("PARSE_MISMATCH", "XPath 解析失败");
      }
    });
  }
  string(rule: string | undefined, input: unknown = this.root): string {
    if (!rule) return "";
    const get = /^@get:\{([^}]+)\}$/i.exec(rule);
    if (get) return this.script?.getVariable(get[1]!) ?? "";
    rule = this.prepare(rule, input);
    if (mode(rule, input) === "html" && scriptCode(rule) === undefined && !rule.includes("@js:"))
      return this.html.string(
        rule,
        isHtmlNode(input)
          ? input
          : new HtmlRules(String(this.serializable(input) ?? "")).$.root()[0]!,
      );
    const parts = scriptCode(rule) !== undefined ? [rule] : rule.split("##");
    let value = this.elements(parts[0]!, input)
      .map((item) => this.value(item))
      .filter(Boolean)
      .join("\n");
    if (parts.length > 1) value = this.html.replace(`##${parts.slice(1).join("##")}`, value);
    return value;
  }
  empty(input: unknown): boolean {
    if (!isHtmlNode(input)) return false;
    const element = this.html.$(input);
    return !element.text().trim() && !element.children().length && !element.attr("href");
  }
}
