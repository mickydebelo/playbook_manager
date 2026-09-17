// @vitest-environment happy-dom
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const PB_ID = "22222222-2222-4222-8222-222222222222";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => `/playbooks/${PB_ID}`,
}));

import { PlaybookWorkspace } from "@/features/playbooks/PlaybookWorkspace";
import type { PlaybookDetail, UserDto } from "@/shared/contracts";

const CH_ID = "33333333-3333-4333-8333-333333333333";
const SEC_ID = "44444444-4444-4444-8444-444444444444";
const CUST_ID = "55555555-5555-4555-8555-555555555555";

const user: UserDto = { id: "11111111-1111-4111-8111-111111111111", name: "Micky Debelo", email: "micky.debelo@autodesk.com", avatarUrl: null, role: "admin" };

function detailWith(outline: PlaybookDetail["outline"]): PlaybookDetail {
  const now = new Date().toISOString();
  return {
    id: PB_ID,
    title: "Northwind playbook",
    status: "draft",
    stage: 2,
    version: 1,
    ownerId: user.id,
    customer: { id: CUST_ID, name: "Northwind Engineering", industry: "aeco", sizeBand: "large", brandColor: null, logoAssetId: null },
    createdAt: now,
    updatedAt: now,
    brief: { objective: "Adopt a connected platform.", focusAreas: ["Governance"], additionalContext: "", sources: [], updatedAt: now },
    outline,
    collaborators: [],
    permissions: { canEdit: true, canManage: true },
  };
}

/** What the job writes while the user is being redirected to the new playbook's own URL. */
const FILLED = detailWith([
  {
    id: CH_ID,
    title: "Executive summary",
    position: 0,
    sections: [{ id: SEC_ID, title: "Overview and objectives", position: 0, coverage: "thin", wordCount: 0, sourceCount: 2 }],
  },
]);

function mockFetch(handlers: Record<string, (init: RequestInit | undefined) => { status: number; body: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      const handler = handlers[`${init?.method ?? "GET"} ${url}`] ?? handlers[url];
      if (!handler) return new Response(JSON.stringify({ error: { code: "not_found", message: `no mock for ${url}` } }), { status: 404 });
      const { status, body } = handler(init);
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }),
  );
  return { calls };
}

beforeEach(() => {
  replace.mockReset();
});

describe("workspace reattach probe", () => {
  /**
   * Creating a playbook from scratch kicks retrieval and then redirects to the playbook's own URL,
   * which remounts the workspace with whatever the server had at that moment — usually an outline
   * the job has not written yet. Only the reattach probe can recover, and React's Strict Mode (on
   * by default with the app router) runs mount → cleanup → mount in development. The probe used to
   * claim its once-per-playbook guard on the first pass, get cancelled by the teardown, and leave
   * the second pass to bail out — so step 2 showed an empty structure with no progress at all.
   */
  it("attaches to retrieval already in flight and fills step 2, under Strict Mode's double effect", async () => {
    let jobPolls = 0;
    mockFetch({
      [`GET /api/playbooks/${PB_ID}/jobs?type=find_knowledge`]: () => ({
        status: 200,
        body: { id: "job-1", type: "find_knowledge", status: "running", progress: { done: 0, total: 1, label: "Proposing a structure" }, error: null, result: null },
      }),
      [`GET /api/playbooks/${PB_ID}/jobs?type=create_draft`]: () => ({ status: 200, body: null }),
      // Running on the first poll so the progress state is observable, then done.
      "GET /api/jobs/job-1": () => ({
        status: 200,
        body: { id: "job-1", type: "find_knowledge", status: ++jobPolls > 1 ? "succeeded" : "running", progress: null, error: null, result: {} },
      }),
      [`GET /api/playbooks/${PB_ID}`]: () => ({ status: 200, body: FILLED }),
      [`GET /api/sections/${SEC_ID}/knowledge`]: () => ({ status: 200, body: [] }),
      "GET /api/knowledge": () => ({ status: 200, body: [] }),
    });

    // The mount the redirect produces: step 2, but the outline is still empty.
    render(
      <StrictMode>
        <PlaybookWorkspace initial={detailWith([])} user={user} startStep={2} />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByText("Finding relevant knowledge…")).toBeInTheDocument());
    // The structure panel numbers each row, so the title reads "1 Executive summary".
    await waitFor(() => expect(screen.getByText(/Executive summary/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText("Finding relevant knowledge…")).toBeNull();
  });
});
