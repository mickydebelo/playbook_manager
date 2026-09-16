"use client";
import type { UserDto } from "@/shared/contracts";
import { useWorkspace } from "@/features/workspace/useWorkspace";
import { KnowledgeLibrary } from "./KnowledgeLibrary";

/** Knowledge library page. Sources are prototype data until Phase 3 wires /api/knowledge. */
export function LibraryView({ user }: { user: UserDto }) {
  const v = useWorkspace({ initial: null, user });
  return <KnowledgeLibrary v={v} />;
}
