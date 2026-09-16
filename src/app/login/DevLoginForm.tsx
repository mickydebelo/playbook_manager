"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ds";
import { api, ApiClientError } from "@/lib/api-client";
import { sx } from "@/lib/ui/sx";
import type { UserDto } from "@/shared/contracts";

/** Development-only sign-in: pick a seeded user. Never rendered when AUTH_PROVIDER=oidc or in production. */
export function DevLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<UserDto[]>("/api/auth/dev-users").then((list) => {
      setUsers(list);
      if (list[0]) setEmail(list[0].email);
    }).catch(() => setError("Run `npm run db:seed` to create development users."));
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/dev-login", { email });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} style={sx("display:flex;flex-direction:column;gap:16px")}>
      <label style={sx("display:flex;flex-direction:column;gap:6px;font:var(--text-label)")}>
        Development user
        <select value={email} onChange={(e) => setEmail(e.target.value)} style={sx("height:44px;padding:0 14px;border:1px solid var(--slate-200);border-radius:var(--radius-md);font:var(--text-body);background:var(--adsk-white)")}>
          {users.map((u) => (
            <option key={u.id} value={u.email}>{u.name} · {u.role}</option>
          ))}
        </select>
      </label>
      {error ? <span role="alert" style={sx("font:var(--text-body-sm);color:var(--dusk-700)")}>{error}</span> : null}
      <Button type="submit" variant="primary" size="lg" disabled={busy || !email} style={{ justifyContent: "center" }}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <span style={sx("font:var(--text-caption);color:var(--slate)")}>Development sign-in. Production uses corporate SSO (OpenID Connect).</span>
    </form>
  );
}
