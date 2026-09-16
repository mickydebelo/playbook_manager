import type { PlaybookDetail, PlaybookSummary } from "@/shared/contracts";
import type { Stage } from "@/shared/enums";
import type { CurrentUser } from "../../auth/current-user";
import { toCustomerDto } from "../customers/service";
import { canEdit, canManage } from "./access";
import type { CustomerRow, PlaybookAggregate, PlaybookRow } from "./repository";

export function toSummary(playbook: PlaybookRow, customer: CustomerRow): PlaybookSummary {
  return {
    id: playbook.id,
    title: playbook.title,
    status: playbook.status,
    stage: playbook.stage as Stage,
    version: playbook.version,
    ownerId: playbook.ownerId,
    customer: toCustomerDto(customer),
    createdAt: playbook.createdAt.toISOString(),
    updatedAt: playbook.updatedAt.toISOString(),
  };
}

export function toDetail(agg: PlaybookAggregate, user: CurrentUser): PlaybookDetail {
  const access = { ownerId: agg.playbook.ownerId, collaborators: agg.collaborators };
  const topLevel = agg.sections.filter((s) => !s.parentSectionId);
  return {
    ...toSummary(agg.playbook, agg.customer),
    brief: {
      objective: agg.brief.objective,
      focusAreas: agg.brief.focusAreas,
      additionalContext: agg.brief.additionalContext,
      sources: agg.sources.map((s) => ({ id: s.id, kind: s.kind, title: s.title, url: s.url })),
      updatedAt: agg.brief.updatedAt.toISOString(),
    },
    outline: agg.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      position: c.position,
      sections: topLevel
        .filter((s) => s.chapterId === c.id)
        .map((s) => ({ id: s.id, title: s.title, position: s.position, coverage: s.coverage, wordCount: s.wordCount, sourceCount: s.sourceCount })),
    })),
    collaborators: agg.collaborators.map((c) => ({ userId: c.userId, name: c.name, email: c.email, role: c.role })),
    permissions: { canEdit: canEdit(access, user), canManage: canManage(access, user) },
  };
}
