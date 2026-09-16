"use client";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shell/Toast";
import { TEMPLATE_KIND_LABELS, type TemplateKind } from "@/shared/enums";
import type { WorkspaceVals } from "@/features/workspace/types";
import { TemplatesScreen } from "./TemplatesScreen";

export type TemplateCard = { id: string; kind: TemplateKind; title: string; description: string; sectionCount: number; usageCount: number; hasImage: boolean };

/** Templates page: seeded templates from the database, mapped to the design's card values. "Use template" starts Step 1 with the template applied. */
export function TemplatesView({ templates }: { templates: TemplateCard[] }) {
  const router = useRouter();
  const toast = useToast();
  const dark = (kind: TemplateKind) => kind === "recommended" || kind === "short_form";
  const v = {
    templates: templates.map((t) => ({
      id: t.id,
      kind: TEMPLATE_KIND_LABELS[t.kind],
      title: t.title,
      desc: t.description,
      sections: t.sectionCount,
      uses: t.usageCount,
      bg: dark(t.kind) ? "var(--adsk-black)" : "var(--warm-slate-100)",
      fg: dark(t.kind) ? "var(--adsk-white)" : "var(--adsk-black)",
      hasImage: t.hasImage,
      use: () => {
        toast.show(`Template "${t.title}" applied to the outline`);
        router.push(`/playbooks/new?template=${t.id}`);
      },
    })),
  } as unknown as WorkspaceVals;
  return <TemplatesScreen v={v} />;
}
