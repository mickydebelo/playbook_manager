"use client";
import type { UserDto } from "@/shared/contracts";
import { useWorkspace } from "@/features/workspace/useWorkspace";
import { HelpScreen } from "./HelpScreen";

export function HelpView({ user }: { user: UserDto }) {
  const v = useWorkspace({ initial: null, user });
  return <HelpScreen v={v} />;
}
