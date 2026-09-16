import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { getDb, type Db } from "../db/client";
import { currentUserFromRequest, type CurrentUser } from "../auth/current-user";
import { AppError } from "./errors";

/**
 * Route handler wrapper: resolves the database and the session, validates the body and query with zod,
 * enforces the CSRF header on mutations, and maps errors to the shared error envelope.
 * Handlers stay thin adapters over `server/modules/*` services.
 */
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "playbook-manager";

type Ctx<TBody, TQuery, TAuth extends boolean> = {
  req: Request;
  db: Db;
  user: TAuth extends true ? CurrentUser : CurrentUser | null;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
};

type Options<TBody, TQuery, TAuth extends boolean> = {
  auth?: TAuth;
  body?: ZodType<TBody>;
  query?: ZodType<TQuery>;
  csrf?: boolean;
};

type NextCtx = { params: Promise<Record<string, string>> } | { params: Record<string, string> } | undefined;

export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } },
      { status: err.status },
    );
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: "validation_failed", message: "Check the highlighted fields", details: err.issues } },
      { status: 422 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every `id`-shaped path parameter in this app is a UUID. Checking it here means a malformed one
 * answers "not found" instead of reaching the database and surfacing as a 500 with a driver error.
 */
function assertIdParams(params: Record<string, string>): void {
  for (const [key, value] of Object.entries(params)) {
    if ((key === "id" || key.endsWith("Id")) && !UUID.test(value)) throw new AppError("not_found", "Resource not found");
  }
}

export function defineRoute<TBody = undefined, TQuery = undefined, TAuth extends boolean = true>(
  options: Options<TBody, TQuery, TAuth>,
  handler: (ctx: Ctx<TBody, TQuery, TAuth>) => Promise<Response>,
) {
  const requireAuth = options.auth ?? true;
  return async (req: Request, nextCtx?: NextCtx): Promise<Response> => {
    try {
      const db = await getDb();
      const user = await currentUserFromRequest(db, req);
      if (requireAuth && !user) throw new AppError("unauthenticated", "Sign in to continue");

      const method = req.method.toUpperCase();
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (mutating && (options.csrf ?? true) && req.headers.get(CSRF_HEADER) !== CSRF_VALUE) {
        throw new AppError("forbidden", "Missing request header");
      }

      let body = undefined as TBody;
      if (options.body) {
        let raw: unknown = undefined;
        const text = await req.text();
        if (text) {
          try {
            raw = JSON.parse(text);
          } catch {
            throw new AppError("validation_failed", "Body must be valid JSON");
          }
        }
        body = options.body.parse(raw ?? {});
      }

      let query = undefined as TQuery;
      if (options.query) {
        const url = new URL(req.url);
        query = options.query.parse(Object.fromEntries(url.searchParams.entries()));
      }

      const rawParams = nextCtx?.params ? await nextCtx.params : {};
      assertIdParams(rawParams);
      return await handler({ req, db, user: user as Ctx<TBody, TQuery, TAuth>["user"], body, query, params: rawParams });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
