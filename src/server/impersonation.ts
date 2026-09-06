import type { JWT } from 'next-auth/jwt';
import { prisma } from '../runtime';

// Admin "view as" — lets a superadmin drive the whole app as another user, so
// the ACL layer can be exercised against real production data without knowing
// anyone's password (they are bcrypt hashes; there is nothing to read back).
//
// The swap happens inside the JWT: `id`/`isAdmin` become the TARGET user's,
// while the real admin is parked in `realId`/`realIsAdmin`/`realEmail`. That one
// move impersonates the entire app, because every ACL decision funnels through
// getAclContext() (src/lib/acl.ts), which reads only those two session values —
// and so does every write-attribution site (createdById/updatedById). No route,
// guard or component needs to know this feature exists.
//
// SECURITY: the payload is untrusted — any signed-in user can POST to
// /api/auth/session and reach this function. Authority is therefore read off the
// TOKEN, never the payload: `realIsAdmin` when already impersonating, `isAdmin`
// before it starts. A non-admin's request is ignored, so an impersonated
// (non-admin) session cannot hop onward to a third user — it can only go back
// to the admin who opened it.

interface ImpersonatePayload {
  // A user id to view as, or null to return to the real admin.
  impersonate: string | number | null;
}

function isImpersonatePayload(value: unknown): value is ImpersonatePayload {
  if (!value || typeof value !== 'object' || !('impersonate' in value)) return false;
  const target = (value as ImpersonatePayload).impersonate;
  return target === null || typeof target === 'string' || typeof target === 'number';
}

export async function applyImpersonation(token: JWT, payload: unknown): Promise<JWT> {
  // Session updates are a generic NextAuth channel; anything that isn't an
  // impersonation instruction passes straight through untouched.
  if (!isImpersonatePayload(payload)) return token;

  const realId = token.realId ?? String(token.id);
  const realIsAdmin = token.realIsAdmin ?? !!token.isAdmin;
  const realEmail = token.realEmail ?? (typeof token.email === 'string' ? token.email : null);
  if (!realIsAdmin) return token;

  // Exiting is "impersonate the real admin again", which keeps one code path.
  const wantedId = payload.impersonate === null ? realId : String(payload.impersonate);
  if (!/^\d+$/.test(wantedId)) return token;

  const target = await prisma.user.findUnique({
    where: { id: BigInt(wantedId) },
    select: { id: true, email: true, nickname: true, isAdmin: true },
  });
  if (!target) return token;

  const leaving = String(target.id) === realId;

  token.id = String(target.id);
  token.isAdmin = target.isAdmin;
  token.email = target.email;
  token.name = target.nickname ?? target.email;

  if (leaving) {
    delete token.realId;
    delete token.realIsAdmin;
    delete token.realEmail;
  } else {
    token.realId = realId;
    token.realIsAdmin = realIsAdmin;
    token.realEmail = realEmail;
  }

  // Writes made while impersonating are attributed to the TARGET user (that is
  // the point — it is what makes the test faithful), so this log line is the
  // only record of who was really at the keyboard. Keep it.
  console.log(
    `[impersonation] ${realEmail ?? realId} ${leaving ? 'exited — back as' : 'now viewing as'} ${target.email}`,
  );
  return token;
}
