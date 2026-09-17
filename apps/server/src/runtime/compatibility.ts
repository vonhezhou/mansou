export const runtimeCompatibility = [
  {
    area: "ComicSource",
    api: "settings snapshot / translate / isLogged / minAppVersion",
    status: "implemented",
  },
  {
    area: "Image",
    api: "config onResponse / onLoadFailed / modifyImage script",
    status: "implemented",
  },
  { area: "Runtime", api: "compute (worker)", status: "implemented" },
  { area: "Network", api: "fetchBytes", status: "implemented" },
  { area: "Network", api: "sendRequest", status: "implemented" },
  { area: "Network", api: "get/post/put/delete/patch", status: "implemented" },
  { area: "Network", api: "cookies", status: "implemented" },
  { area: "Convert", api: "md5/sha1/sha256/sha512", status: "implemented" },
  { area: "Convert", api: "hmac/hmacString", status: "implemented" },
  {
    area: "Convert",
    api: "AES ECB/CBC/CFB/OFB encrypt/decrypt (no padding)",
    status: "implemented",
  },
  {
    area: "Convert",
    api: "RSA decrypt",
    status: "partial",
    note: "Depends on Node privateDecrypt key format support.",
  },
  { area: "Html", api: "HtmlDocument query APIs", status: "implemented" },
  { area: "Html", api: "HtmlElement nodes/parent/siblings", status: "implemented" },
  {
    area: "UI",
    api: "dialogs/login/webview",
    status: "missing",
    note: "Requires a browser interaction protocol.",
  },
  {
    area: "Sandbox",
    api: "isolated runtime",
    status: "partial",
    note: "Current adapter still uses Node vm; stronger isolation remains under evaluation.",
  },
] as const;
