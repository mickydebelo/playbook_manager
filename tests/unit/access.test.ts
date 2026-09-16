import { describe, expect, it } from "vitest";
import { canEdit, canManage, canRead } from "@/server/modules/playbooks/access";
import type { UserDto } from "@/shared/contracts";

const u = (id: string, role: UserDto["role"] = "author"): UserDto => ({ id, name: id, email: `${id}@x`, avatarUrl: null, role });
const pb = { ownerId: "owner", collaborators: [{ userId: "rev", role: "reviewer" as const }, { userId: "ed", role: "editor" as const }] };

describe("playbook access rules", () => {
  it("owner can read, edit and manage", () => {
    expect([canRead(pb, u("owner")), canEdit(pb, u("owner")), canManage(pb, u("owner"))]).toEqual([true, true, true]);
  });
  it("reviewer can only read", () => {
    expect([canRead(pb, u("rev")), canEdit(pb, u("rev")), canManage(pb, u("rev"))]).toEqual([true, false, false]);
  });
  it("editor can read and edit but not manage", () => {
    expect([canRead(pb, u("ed")), canEdit(pb, u("ed")), canManage(pb, u("ed"))]).toEqual([true, true, false]);
  });
  it("strangers get nothing; admins get everything", () => {
    expect(canRead(pb, u("nobody"))).toBe(false);
    expect([canRead(pb, u("root", "admin")), canEdit(pb, u("root", "admin")), canManage(pb, u("root", "admin"))]).toEqual([true, true, true]);
  });
});
