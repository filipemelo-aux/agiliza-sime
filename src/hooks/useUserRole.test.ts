import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isAdmin: false, isModerator: false, isOperador: false, isConsultor: false,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state }));
import { useUserRole } from "./useUserRole";

describe("existing operational access limits", () => {
  it("allows operators to operate without administrative settings", () => {
    Object.assign(state, { isAdmin: false, isModerator: false, isOperador: true, isConsultor: false });
    expect(useUserRole()).toMatchObject({ hasAdminAccess: true, canEdit: true, canAccessSettings: false });
  });
  it("allows moderators to operate and manage settings", () => {
    Object.assign(state, { isAdmin: false, isModerator: true, isOperador: false, isConsultor: false });
    expect(useUserRole()).toMatchObject({ hasAdminAccess: true, canEdit: true, canAccessSettings: true });
  });
  it("keeps consultants read-only and outside administrative settings", () => {
    Object.assign(state, { isAdmin: false, isModerator: false, isOperador: false, isConsultor: true });
    expect(useUserRole()).toMatchObject({ hasAdminAccess: true, canEdit: false, canAccessSettings: false });
  });
  it("does not grant access to an unprovisioned account", () => {
    Object.assign(state, { isAdmin: false, isModerator: false, isOperador: false, isConsultor: false });
    expect(useUserRole()).toMatchObject({ hasAdminAccess: false, canEdit: false, canAccessSettings: false });
  });
});