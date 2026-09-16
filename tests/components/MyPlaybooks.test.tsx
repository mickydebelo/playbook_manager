// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/playbooks" }));

import { formatUpdated, MyPlaybooks, stageLabel } from "@/features/playbooks/MyPlaybooks";
import type { PlaybookSummary } from "@/shared/contracts";

const customer = { id: "c1", name: "Northwind Engineering", industry: "aeco", sizeBand: "large", brandColor: null, logoAssetId: null } as const;
const base = { version: 1, ownerId: "u1", createdAt: "2026-09-01T09:00:00Z", updatedAt: "2026-09-01T09:00:00Z" };
const rows: PlaybookSummary[] = [
  { ...base, id: "p1", title: "Digital transformation playbook", status: "draft", stage: 3, customer },
  { ...base, id: "p2", title: "Common data environment rollout", status: "in_review", stage: 4, customer: { ...customer, id: "c2", name: "Harbor & Vale" } },
  { ...base, id: "p3", title: "Design automation adoption", status: "delivered", stage: 4, customer: { ...customer, id: "c3", name: "Meridian Manufacturing", industry: "dm" } },
];

describe("MyPlaybooks", () => {
  it("renders rows with customer · industry, status badge and stage label", () => {
    render(<MyPlaybooks initial={rows} />);
    expect(screen.getByText("3 playbooks · pick up where you left off.")).toBeInTheDocument();
    expect(screen.getByText("Northwind Engineering · AECO")).toBeInTheDocument();
    expect(screen.getByText("Meridian Manufacturing · D&M")).toBeInTheDocument();
    expect(screen.getAllByText("In review")).toHaveLength(2); // filter chip + badge
    expect(screen.getByText("Edit & create")).toBeInTheDocument();
    expect(screen.getAllByText("Delivered")).toHaveLength(3); // filter chip + badge + stage column
  });

  it("filters by status and shows the empty state", async () => {
    render(<MyPlaybooks initial={rows} />);
    const u = userEvent.setup();
    await u.click(screen.getByRole("button", { name: "Delivered", pressed: false }));
    expect(screen.queryByText("Digital transformation playbook")).toBeNull();
    expect(screen.getByText("Design automation adoption")).toBeInTheDocument();
    render(<MyPlaybooks initial={[]} />);
    expect(screen.getByText("No playbooks in this view.")).toBeInTheDocument();
  });

  it("opens a playbook at its current stage", async () => {
    render(<MyPlaybooks initial={rows} />);
    await userEvent.setup().click(screen.getByText("Digital transformation playbook"));
    expect(push).toHaveBeenCalledWith("/playbooks/p1?step=3");
  });

  it("formats updated timestamps like the design", () => {
    const now = new Date("2026-09-16T18:00:00");
    expect(formatUpdated(new Date("2026-09-16T09:40:00").toISOString(), now)).toBe("Today, 09:40");
    expect(formatUpdated(new Date("2026-09-15T22:00:00").toISOString(), now)).toBe("Yesterday");
    expect(formatUpdated(new Date("2026-09-03T10:00:00").toISOString(), now)).toBe("3 Sept 2026");
    expect(stageLabel(rows[2]!)).toBe("Delivered");
    expect(stageLabel(rows[0]!)).toBe("Edit & create");
  });
});
