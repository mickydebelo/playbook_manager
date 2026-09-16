import type { CurrentUser } from "../../auth/current-user";
import { forbidden } from "../../http/errors";
import type { CollabRole } from "@/shared/enums";

export type AccessContext = {
  ownerId: string;
  collaborators: { userId: string; role: CollabRole }[];
};

/**
 * Object-level authorisation for playbooks (docs/02-architecture.md §3):
 * owner and admin can do everything; editor collaborators can read and edit; reviewers can read (and comment).
 */
export function canRead(pb: AccessContext, user: CurrentUser): boolean {
  return user.role === "admin" || pb.ownerId === user.id || pb.collaborators.some((c) => c.userId === user.id);
}

export function canEdit(pb: AccessContext, user: CurrentUser): boolean {
  return (
    user.role === "admin" ||
    pb.ownerId === user.id ||
    pb.collaborators.some((c) => c.userId === user.id && c.role === "editor")
  );
}

/** Status changes, sharing, archiving, exporting: owner or admin only. */
export function canManage(pb: AccessContext, user: CurrentUser): boolean {
  return user.role === "admin" || pb.ownerId === user.id;
}

export function assertCanRead(pb: AccessContext, user: CurrentUser): void {
  if (!canRead(pb, user)) throw forbidden();
}
export function assertCanEdit(pb: AccessContext, user: CurrentUser): void {
  if (!canEdit(pb, user)) throw forbidden("Only the owner or an editor can change this playbook");
}
export function assertCanManage(pb: AccessContext, user: CurrentUser): void {
  if (!canManage(pb, user)) throw forbidden("Only the owner can do that");
}
