import type { components } from "@venera/contracts";
import { api } from "./client.js";
export type AuthSession = components["schemas"]["AuthSession"];
export type ApiToken = components["schemas"]["ApiToken"];
export const authApi = {
  tokens: () => api<ApiToken[]>("/auth/tokens"),
  createToken: (input: components["schemas"]["CreateApiTokenRequest"]) =>
    api<components["schemas"]["CreateApiTokenResult"]>("/auth/tokens", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  revokeToken: (id: string) => api("/auth/tokens/" + encodeURIComponent(id), { method: "DELETE" }),
  session: () => api<AuthSession>("/auth/session"),
  login: (input: components["schemas"]["LoginRequest"]) =>
    api<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => api("/auth/logout", { method: "POST" }),
  changePassword: (input: components["schemas"]["ChangePasswordRequest"]) =>
    api("/auth/password", { method: "PUT", body: JSON.stringify(input) }),
};
