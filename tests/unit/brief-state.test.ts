import { describe, expect, it } from "vitest";
import { briefFromDetail, briefToInput, emptyBrief } from "@/features/workspace/brief-state";
import type { PlaybookDetail } from "@/shared/contracts";

const LOGO_ID = "11111111-1111-4111-8111-111111111111";

function detailWithLogo(logoAssetId: string | null): PlaybookDetail {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Digital transformation playbook",
    status: "draft",
    stage: 1,
    version: 1,
    ownerId: "33333333-3333-4333-8333-333333333333",
    customer: { id: "44444444-4444-4444-8444-444444444444", name: "Harbor & Vale", industry: "aeco", sizeBand: "medium", brandColor: null, logoAssetId },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    brief: { objective: "Stand up a CDE.", focusAreas: [], additionalContext: "", sources: [], updatedAt: new Date().toISOString() },
    outline: [],
  } as unknown as PlaybookDetail;
}

describe("brief-state logo round-trip", () => {
  it("reads the customer logo asset id from the detail", () => {
    expect(briefFromDetail(detailWithLogo(LOGO_ID)).logoAssetId).toBe(LOGO_ID);
    expect(briefFromDetail(detailWithLogo(null)).logoAssetId).toBeNull();
  });

  it("sends the chosen logo asset id back in the brief input", () => {
    expect(briefToInput({ ...emptyBrief(), customer: "Harbor & Vale", objective: "x", logoAssetId: LOGO_ID }).logoAssetId).toBe(LOGO_ID);
    expect(briefToInput({ ...emptyBrief(), customer: "Harbor & Vale", objective: "x" }).logoAssetId).toBeNull();
  });
});
