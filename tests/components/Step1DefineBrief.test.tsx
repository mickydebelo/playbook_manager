// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
  usePathname: () => "/playbooks/new",
}));

import { PlaybookWorkspace } from "@/features/playbooks/PlaybookWorkspace";
import type { PlaybookDetail, UserDto } from "@/shared/contracts";

const user: UserDto = { id: "11111111-1111-4111-8111-111111111111", name: "Micky Debelo", email: "micky.debelo@autodesk.com", avatarUrl: null, role: "admin" };

function mockFetch(handlers: Record<string, (init: RequestInit | undefined) => { status: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = `${init?.method ?? "GET"} ${url}`;
    const handler = handlers[key] ?? handlers[url];
    if (!handler) return new Response(JSON.stringify({ error: { code: "not_found", message: `no mock for ${key}` } }), { status: 404 });
    const { status, body } = handler(init);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
});

describe("Step 1 — Define brief (vertical slice)", () => {
  it("shows the design's validation message and disables the primary action until customer and objective are filled", async () => {
    mockFetch({});
    render(<PlaybookWorkspace initial={null} user={user} startStep={1} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Add a customer name and objective to continue.");
    const find = screen.getByRole("button", { name: /Find relevant knowledge/ });
    expect(find).toBeDisabled();
    expect(screen.getByText("0/500")).toBeInTheDocument();

    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Customer name"), "Northwind Engineering");
    await u.type(screen.getByLabelText("Objective"), "Adopt a connected platform.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(find).toBeEnabled();
    expect(screen.getByText("27/500")).toBeInTheDocument();
  });

  it("adds focus areas from suggestions and by typing, and can remove them", async () => {
    mockFetch({});
    render(<PlaybookWorkspace initial={null} user={user} startStep={1} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Business strategy" }));
    // the chosen suggestion disappears from suggestions and appears as a chip with a remove button
    expect(screen.queryByRole("button", { name: "Business strategy" })).toBeNull();
    expect(screen.getByText("Business strategy")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /Add focus areas/ }));
    await u.type(screen.getByPlaceholderText("Type a focus area, press Enter"), "Data governance{Enter}");
    expect(screen.getByText("Data governance")).toBeInTheDocument();
    await u.click(screen.getAllByRole("button", { name: "Remove" })[0]!);
    expect(screen.queryByText("Business strategy")).not.toBeNull(); // now back in suggestions
  });

  it("creates the playbook, runs retrieval, then moves to step 2 of the new playbook", async () => {
    const created = { id: "22222222-2222-4222-8222-222222222222", stage: 1, outline: [], brief: { objective: "", focusAreas: [], additionalContext: "", sources: [], updatedAt: new Date().toISOString() } };
    const { calls } = mockFetch({
      "POST /api/playbooks": () => ({ status: 201, body: created }),
      [`POST /api/playbooks/${created.id}/find-knowledge`]: () => ({ status: 202, body: { jobId: "job-1" } }),
      "GET /api/jobs/job-1": () => ({ status: 200, body: { id: "job-1", type: "find_knowledge", status: "succeeded", progress: null, error: null, result: {} } }),
      [`GET /api/playbooks/${created.id}`]: () => ({ status: 200, body: created }),
      [`PATCH /api/playbooks/${created.id}`]: () => ({ status: 200, body: { ...created, stage: 2 } }),
      "GET /api/knowledge": () => ({ status: 200, body: [] }),
    });
    render(<PlaybookWorkspace initial={null} user={user} startStep={1} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Customer name"), "Northwind Engineering");
    await u.selectOptions(screen.getByLabelText("Industry"), "D&M (Design & Manufacturing)");
    await u.click(screen.getByRole("button", { name: /Enterprise/ }));
    await u.type(screen.getByLabelText("Objective"), "Adopt a connected platform.");
    await u.click(screen.getByRole("button", { name: "Change management" }));
    await u.click(screen.getByRole("button", { name: /Find relevant knowledge/ }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/playbooks/${created.id}?step=2`), { timeout: 5000 });
    const post = calls.find((c) => c.init?.method === "POST")!;
    expect(post.url).toBe("/api/playbooks");
    expect(post.init?.headers).toMatchObject({ "x-requested-with": "playbook-manager" });
    expect(JSON.parse(String(post.init?.body))).toMatchObject({
      customerName: "Northwind Engineering",
      industry: "dm",
      sizeBand: "enterprise",
      objective: "Adopt a connected platform.",
      focusAreas: ["Change management"],
    });
    // retrieval runs before the redirect, and the stage is persisted so the page opens on step 2
    expect(calls.some((c) => c.url.endsWith("/find-knowledge"))).toBe(true);
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(true);
  });

  it("autosaves brief edits for an existing playbook with PUT and stays on the page", async () => {
    const id = "33333333-3333-4333-8333-333333333333";
    const detail: PlaybookDetail = {
      id, title: "Digital transformation playbook", status: "draft", stage: 1, version: 1, ownerId: user.id,
      customer: { id: "44444444-4444-4444-8444-444444444444", name: "Harbor & Vale", industry: "aeco", sizeBand: "medium", brandColor: null, logoAssetId: null },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      brief: { objective: "Stand up a CDE.", focusAreas: [], additionalContext: "", sources: [], updatedAt: new Date().toISOString() },
      outline: [], collaborators: [], permissions: { canEdit: true, canManage: true },
    };
    const { calls } = mockFetch({
      [`PUT /api/playbooks/${id}/brief`]: () => ({ status: 200, body: detail }),
      "GET /api/knowledge": () => ({ status: 200, body: [] }),
      [`GET /api/playbooks/${id}`]: () => ({ status: 200, body: detail }),
    });
    render(<PlaybookWorkspace initial={detail} user={user} startStep={1} />);
    expect(screen.getByLabelText("Customer name")).toHaveValue("Harbor & Vale");
    expect(screen.getByLabelText("Objective")).toHaveValue("Stand up a CDE.");

    const u = userEvent.setup();
    await u.type(screen.getByLabelText("Objective"), " Across all offices.");
    await waitFor(() => expect(calls.some((c) => c.init?.method === "PUT")).toBe(true), { timeout: 3000 });
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put.url).toBe(`/api/playbooks/${id}/brief`);
    expect(JSON.parse(String(put.init?.body)).objective).toBe("Stand up a CDE. Across all offices.");
    expect(replace).not.toHaveBeenCalled();
  });
});
