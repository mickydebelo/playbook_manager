import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listOrCreate, POST as create } from "@/app/api/playbooks/route";
import { GET as getOne, PATCH as patchOne, DELETE as archiveOne } from "@/app/api/playbooks/[id]/route";
import { PUT as putBrief } from "@/app/api/playbooks/[id]/brief/route";
import { POST as duplicate } from "@/app/api/playbooks/[id]/duplicate/route";
import { GET as me } from "@/app/api/me/route";
import { POST as devLogin } from "@/app/api/auth/dev-login/route";
import { playbookDetailSchema, playbookSummarySchema } from "@/shared/contracts";
import { apiRequest, createTestContext, destroyTestContext, disableUser, params, validBrief, type TestContext } from "../helpers/db";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await destroyTestContext(ctx);
});

describe("auth guards", () => {
  it("401 without a session", async () => {
    const res = await listOrCreate(await apiRequest("/api/playbooks"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in to continue" } });
  });
  it("403 on mutations without the CSRF header", async () => {
    const res = await create(await apiRequest("/api/playbooks", { method: "POST", body: validBrief, as: ctx.author, csrf: false }));
    expect(res.status).toBe(403);
  });
  it("dev-login sets a session cookie that /api/me accepts", async () => {
    const res = await devLogin(await apiRequest("/api/auth/dev-login", { method: "POST", body: { email: ctx.author.email } }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^pm_session=.+HttpOnly/);
    const meRes = await me(new Request("http://localhost:3000/api/me", { headers: { cookie: cookie.split(";")[0]! } }));
    expect((await meRes.json()).email).toBe(ctx.author.email);
  });
  it("disabled users are signed out even with a valid cookie", async () => {
    const res = await devLogin(await apiRequest("/api/auth/dev-login", { method: "POST", body: { email: ctx.author.email } }));
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    await disableUser(ctx, ctx.author.id);
    const meRes = await me(new Request("http://localhost:3000/api/me", { headers: { cookie } }));
    expect(meRes.status).toBe(401);
    await ctx.db.update((await import("@/server/db/schema")).users).set({ disabledAt: null });
  });
});

describe("/api/playbooks", () => {
  let id: string;

  it("422 with zod details when the brief is invalid", async () => {
    const res = await create(await apiRequest("/api/playbooks", { method: "POST", body: { ...validBrief, customerName: "", objective: "" }, as: ctx.author }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details.map((i: { path: string[] }) => i.path[0])).toEqual(expect.arrayContaining(["customerName", "objective"]));
  });

  it("422 when the body is not JSON", async () => {
    const req = new Request("http://localhost:3000/api/playbooks", { method: "POST", headers: { "x-requested-with": "playbook-manager", cookie: (await apiRequest("/", { as: ctx.author })).headers.get("cookie")! }, body: "{not json" });
    expect((await create(req)).status).toBe(422);
  });

  it("201 creates and returns a PlaybookDetail matching the contract", async () => {
    const res = await create(await apiRequest("/api/playbooks", { method: "POST", body: validBrief, as: ctx.author }));
    expect(res.status).toBe(201);
    const body = await res.json();
    const parsed = playbookDetailSchema.parse(body);
    id = parsed.id;
    expect(parsed.customer.name).toBe("Northwind Engineering");
  });

  it("GET list returns summaries and honours ?status=", async () => {
    const res = await listOrCreate(await apiRequest("/api/playbooks", { as: ctx.author }));
    expect(res.status).toBe(200);
    const list = (await res.json()) as unknown[];
    expect(list.map((p) => playbookSummarySchema.parse(p).id)).toContain(id);
    const none = await listOrCreate(await apiRequest("/api/playbooks?status=delivered", { as: ctx.author }));
    expect(await none.json()).toEqual([]);
    const bad = await listOrCreate(await apiRequest("/api/playbooks?status=bogus", { as: ctx.author }));
    expect(bad.status).toBe(422);
  });

  it("GET one: 200 for the owner, 403 for a stranger, 404 for an unknown id", async () => {
    expect((await getOne(await apiRequest(`/api/playbooks/${id}`, { as: ctx.author }), params({ id }))).status).toBe(200);
    expect((await getOne(await apiRequest(`/api/playbooks/${id}`, { as: ctx.outsider }), params({ id }))).status).toBe(403);
    const missing = "00000000-0000-0000-0000-000000000000";
    expect((await getOne(await apiRequest(`/api/playbooks/${missing}`, { as: ctx.author }), params({ id: missing }))).status).toBe(404);
  });

  it("PUT brief replaces the brief; PATCH moves the stage", async () => {
    const res = await putBrief(await apiRequest(`/api/playbooks/${id}/brief`, { method: "PUT", body: { ...validBrief, objective: "New objective", focusAreas: ["Governance"] }, as: ctx.author }), params({ id }));
    expect(res.status).toBe(200);
    const detail = playbookDetailSchema.parse(await res.json());
    expect(detail.brief.objective).toBe("New objective");
    expect(detail.brief.focusAreas).toEqual(["Governance"]);

    const staged = await patchOne(await apiRequest(`/api/playbooks/${id}`, { method: "PATCH", body: { stage: 2 }, as: ctx.author }), params({ id }));
    expect(playbookDetailSchema.parse(await staged.json()).stage).toBe(2);
    const empty = await patchOne(await apiRequest(`/api/playbooks/${id}`, { method: "PATCH", body: {}, as: ctx.author }), params({ id }));
    expect(empty.status).toBe(422);
  });

  it("POST duplicate → 201 copy; DELETE → 204 archive and the copy disappears from the default list", async () => {
    const dup = await duplicate(await apiRequest(`/api/playbooks/${id}/duplicate`, { method: "POST", as: ctx.author }), params({ id }));
    expect(dup.status).toBe(201);
    const copy = playbookDetailSchema.parse(await dup.json());
    expect(copy.title).toMatch(/^Copy of /);

    const del = await archiveOne(await apiRequest(`/api/playbooks/${copy.id}`, { method: "DELETE", as: ctx.author }), params({ id: copy.id }));
    expect(del.status).toBe(204);
    const list = (await (await listOrCreate(await apiRequest("/api/playbooks", { as: ctx.author }))).json()) as { id: string }[];
    expect(list.map((p) => p.id)).not.toContain(copy.id);
    const forbidden = await archiveOne(await apiRequest(`/api/playbooks/${id}`, { method: "DELETE", as: ctx.outsider }), params({ id }));
    expect(forbidden.status).toBe(403);
  });
});
