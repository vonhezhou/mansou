import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import { SourceError } from "./types.js";

function unsupported(rule: string): never {
  throw new SourceError("UNSUPPORTED_RULE", `当前不支持规则：${rule.slice(0, 120)}`);
}

// 分隔符只在括号和引号之外生效，避免切断 CSS 属性值。
export function splitRule(rule: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let i = 0; i < rule.length; i++) {
    const c = rule[i]!;
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "[" || c === "(") depth++;
    if (c === "]" || c === ")") depth--;
    if (depth === 0 && rule.startsWith(separator, i)) {
      parts.push(rule.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  if (quote || depth !== 0) unsupported(rule);
  return [...parts, rule.slice(start)];
}

type Selection = Cheerio<AnyNode>;
const validator = load("<div></div>");
const blockTags =
  "address,article,aside,blockquote,br,caption,dd,details,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,summary,table,tbody,td,tfoot,th,thead,tr,ul";

function textValue($: CheerioAPI, item: Selection, own = false): string {
  if (item.is("script,style")) return "";
  const clone = item.clone();
  clone.find("script,style").remove();
  if (own)
    clone.children().each((_, child) => {
      if ($(child).is(blockTags)) $(child).replaceWith(" ");
      else $(child).remove();
    });
  else clone.find(blockTags).before(" ").after(" ");
  return clone.text().replace(/\s+/g, " ").trim();
}

function ruleParts(rule: string): {
  base: string;
  regex?: RegExp;
  replacement: string;
  first: boolean;
} {
  if (/(@(?:js|webjs|xpath|json|put|get):|<js>|\{\{|^\s*(?:\$|\/\/)|\bjava\.)/i.test(rule))
    unsupported(rule);
  const parts = rule.split("##");
  if (parts.length > 4 || (parts[3] !== undefined && parts[3] !== "#")) unsupported(rule);
  let pattern = parts[1];
  let flags = "g";
  if (pattern?.startsWith("(?i)")) {
    pattern = pattern.slice(4);
    flags += "i";
  }
  // 当前仅支持与 JavaScript 一致的常用正则，拒绝 Java 专有语法。
  if (pattern && /\\[pPQEAzZ]|\(\?[a-z-]+[):]/.test(pattern)) unsupported(rule);
  if (parts[2]?.includes("\\")) unsupported(rule);
  let regex: RegExp | undefined;
  try {
    if (pattern) regex = new RegExp(pattern, flags);
  } catch {
    unsupported(rule);
  }
  return {
    base: parts[0]!,
    regex,
    replacement: (parts[2] ?? "").replace(/\$0/g, () => "$&"),
    first: parts[3] === "#",
  };
}

function composition(rule: string): { operator: string; parts: string[] } {
  const combinations = ["||", "&&", "%%"]
    .map((operator) => ({ operator, parts: splitRule(rule, operator) }))
    .filter(({ parts }) => parts.length > 1);
  // Legado 按首次出现的运算符分割；其余运算符会落入选择器，不假定布尔表达式优先级。
  if (combinations.length > 1) unsupported(rule);
  return combinations[0] ?? { operator: "&&", parts: [rule] };
}

function combine<T>(rule: string, read: (branch: string) => T[]): T[] {
  const { operator, parts } = composition(rule);
  const lists: T[][] = [];
  for (const part of parts) {
    if (!part.trim()) continue;
    const items = read(part);
    if (!items.length) continue;
    if (operator === "||") return items;
    lists.push(items);
  }
  if (operator !== "%%") return lists.flat();
  const result: T[] = [];
  for (let index = 0; index < (lists[0]?.length ?? 0); index++)
    for (const list of lists) if (index < list.length) result.push(list[index]!);
  return result;
}

function selectorSegment(segment: string): {
  css: string;
  indexes?: string;
  exclude: boolean;
  bracket: boolean;
  ownText?: string;
  children?: boolean;
} {
  let css = segment.trim();
  let indexes: string | undefined;
  let exclude = false;
  let bracket = false;
  const indexed = /^(.*?)\[(!?)([-\d:,\s]+)\]$/.exec(css);
  const legacy = /^(.*?)([.!])(-?\d+(?::-?\d+)*)$/.exec(css);
  if (indexed) {
    css = indexed[1]!;
    indexes = indexed[3]!;
    exclude = indexed[2] === "!";
    bracket = true;
  } else if (legacy) {
    css = legacy[1]!;
    indexes = legacy[3]!;
    exclude = legacy[2] === "!";
  }
  if (css.startsWith("class.")) css = `.${css.slice(6).trim().split(/\s+/).join(".")}`;
  else if (css.startsWith("id.")) css = `#${css.slice(3)}`;
  else if (css.startsWith("tag.")) css = css.slice(4);
  if (!css && indexes) css = "children";
  if (!css) unsupported(segment);
  const children = css === "children";
  if (children) css = "*";
  const ownText = css.startsWith("text.") ? css.slice(5) : undefined;
  if (ownText !== undefined) css = "*";
  if (indexes && bracket)
    for (const token of indexes.split(",")) {
      if (!/^\s*-?\d+\s*$|^\s*-?\d*\s*:\s*-?\d*\s*(?::\s*[1-9]\d*\s*)?$/.test(token))
        unsupported(segment);
    }
  return { css, indexes, exclude, bracket, ownText, children };
}

function indexedSelection(
  nodes: AnyNode[],
  indexes: string,
  exclude: boolean,
  bracket: boolean,
): AnyNode[] {
  if (!nodes.length) return [];
  const selected = new Set<number>();
  const normal = (n: number) => (n < 0 ? nodes.length + n : n);
  for (const token of indexes.split(bracket ? "," : ":")) {
    if (bracket && token.includes(":")) {
      const [a, b, c] = token.split(":").map((s) => s.trim());
      let start = normal(a ? Number(a) : 0);
      let end = normal(b ? Number(b) : -1);
      if ((start < 0 && end < 0) || (start >= nodes.length && end >= nodes.length)) continue;
      start = Math.max(0, Math.min(nodes.length - 1, start));
      end = Math.max(0, Math.min(nodes.length - 1, end));
      const step = Number(c || 1) * (end >= start ? 1 : -1);
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) selected.add(i);
    } else {
      const index = normal(Number(token));
      if (index >= 0 && index < nodes.length) selected.add(index);
    }
  }
  return exclude ? nodes.filter((_, i) => !selected.has(i)) : [...selected].map((i) => nodes[i]!);
}

export function validateRule(rule: string, mode: "elements" | "string" = "elements"): void {
  if (!rule) return;
  const parsed = ruleParts(rule);
  if (mode === "elements" && parsed.regex) unsupported(rule);
  for (const combined of composition(parsed.base).parts) {
    if (!combined.trim()) continue;
    const segments = paths(combined);
    if (mode === "string") {
      const terminal = segments.pop();
      if (terminal && !/^[\w:-]+$/.test(terminal)) unsupported(rule);
    }
    for (const segment of segments) {
      const css = /^\s*@css:/i.test(parsed.base) ? segment : selectorSegment(segment).css;
      try {
        validator.root().find(css);
      } catch {
        unsupported(rule);
      }
    }
  }
}

function select($: CheerioAPI, root: Selection, segments: string[], literalCss = false): Selection {
  let current = root;
  for (const segment of segments) {
    const { css, indexes, exclude, bracket, ownText, children } = literalCss
      ? {
          css: segment,
          indexes: undefined,
          exclude: false,
          bracket: false,
          ownText: undefined,
          children: false,
        }
      : selectorSegment(segment);
    const next: AnyNode[] = [];
    current.each((_, node) => {
      // Jsoup 允许当前节点本身匹配；保留显式索引顺序，不通过 add() 重排。
      let found: AnyNode[] = children
        ? $(node).children().toArray()
        : [...$(node).filter(css).toArray(), ...$(node).find(css).toArray()];
      if (ownText !== undefined)
        found = found.filter((n) =>
          textValue($, $(n), true).toLowerCase().includes(ownText.toLowerCase()),
        );
      if (indexes) found = indexedSelection(found, indexes, exclude, bracket);
      next.push(...found);
    });
    current = $(next);
  }
  return current;
}

function paths(rule: string): string[] {
  return splitRule(rule.replace(/^\s*@css:/i, ""), "@").filter(Boolean);
}

export class HtmlRules {
  readonly $: CheerioAPI;
  constructor(html: string) {
    this.$ = load(html);
  }

  elements(rule: string, root: Selection = this.$.root()): Selection {
    validateRule(rule);
    return this.$(
      combine(rule, (branch) =>
        select(this.$, root, paths(branch), /^\s*@css:/i.test(rule)).toArray(),
      ),
    );
  }

  replace(rule: string, value: string): string {
    validateRule(rule, "string");
    const parsed = ruleParts(rule);
    if (parsed.base.trim()) unsupported(rule);
    if (!parsed.regex) return value;
    if (!parsed.first) return value.replace(parsed.regex, parsed.replacement);
    const match = parsed.regex.exec(value);
    return match
      ? match[0].replace(
          new RegExp(parsed.regex.source, parsed.regex.flags.replace("g", "")),
          parsed.replacement,
        )
      : "";
  }

  string(rule: string | undefined, node: AnyNode): string {
    if (!rule) return "";
    validateRule(rule, "string");
    const parsed = ruleParts(rule);
    const values = combine(parsed.base, (branch) => {
      const values: string[] = [];
      const segments = paths(branch);
      const terminal = segments.pop() ?? "text";
      const selection = select(this.$, this.$(node), segments, /^\s*@css:/i.test(parsed.base));
      selection.each((_, element) => {
        const item = this.$(element);
        let value: string;
        if (terminal === "text") value = textValue(this.$, item);
        else if (terminal === "all") value = this.$.html(item);
        else if (terminal === "html") {
          const clone = item.clone();
          clone.find("script,style").remove();
          value = this.$.html(clone);
        } else if (terminal === "textNodes" || terminal === "ownText") {
          const texts = item
            .contents()
            .toArray()
            .filter((n) => n.type === "text")
            .map((n) => this.$(n).text());
          value =
            terminal === "textNodes"
              ? texts
                  .map((t) => t.trim())
                  .filter(Boolean)
                  .join("\n")
              : textValue(this.$, item, true);
        } else {
          if (!/^[\w:-]+$/.test(terminal)) unsupported(rule);
          value = item.attr(terminal) ?? "";
        }
        value = value.trim();
        if (value) values.push(value);
      });
      return values;
    });
    if (values.length) {
      const value = values.join("\n");
      if (!parsed.regex) return value;
      if (!parsed.first) return value.replace(parsed.regex, parsed.replacement);
      const match = parsed.regex.exec(value);
      return match
        ? match[0].replace(
            new RegExp(parsed.regex.source, parsed.regex.flags.replace("g", "")),
            parsed.replacement,
          )
        : "";
    }
    return "";
  }
}
