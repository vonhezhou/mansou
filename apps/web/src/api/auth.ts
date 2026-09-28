import type { components } from "@venera/contracts";
import { api } from "./client.js";
export type AuthSession = components["schemas"]["AuthSession"];
export const authApi = {
  session: () => api<AuthSession>("/auth/session"),
  login: (input: components["schemas"]["LoginRequest"]) =>
    api<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => api("/auth/logout", { method: "POST" }),
  changePassword: (input: components["schemas"]["ChangePasswordRequest"]) =>
    api("/auth/password", { method: "PUT", body: JSON.stringify(input) }),
};
