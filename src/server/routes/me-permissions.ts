import { NextResponse } from 'next/server';
import { auth, namingBrandIdsForUsers } from '../../runtime';
import { getAclContext, viewableKeys, fieldRestrictionMap, fieldDenyMap, actionMap } from '../acl';
import { capabilitiesFor } from '../capabilities';

/**
 * Effective permissions for the current user.
 *
 * Lives in the ENGINE because every app needs it identically and the engine's
 * own client hook (lib/use-permissions) fetches it by a fixed path. An app wires
 * it up with a one-line route:
 *
 *   // src/app/api/me/permissions/route.ts
 *   export { GET } from '@lumilab/engine/server/routes/me-permissions';
 *
 * Forgetting it is not silent-but-harmless: the hook 404s on every page load,
 * which is how it was found here — the browser check flagged the 404 while every
 * page still returned 200.
 *
 * `view` carries resource keys AND capability keys, feeding AppSider's nav
 * filtering; `actions` lets ListEngine hide Edit/Delete/Add; `fields` drives
 * per-field form hiding.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getAclContext(session);
  const userId = session.user?.id ? String(session.user.id) : null;

  // Capabilities come from named lists in app settings, not from roles.
  const capabilities = await capabilitiesFor(userId, ctx.isAdmin);
  // Empty unless the app supplied naming hooks to configureEngine().
  const namingBrandIds = userId ? (await namingBrandIdsForUsers([userId])).map(String) : [];

  if (ctx.isAdmin) {
    // An admin still gets the explicit list: once a capability's list is NAMED,
    // being an admin grants nothing extra, so `isAdmin: true` alone would lie
    // for a capability whose list does not include them.
    return NextResponse.json({ isAdmin: true, view: capabilities, fields: {}, fieldsDeny: {}, actions: {}, namingBrandIds });
  }
  return NextResponse.json({
    isAdmin: false,
    view: [...new Set([...viewableKeys(ctx), ...capabilities])],
    fields: fieldRestrictionMap(ctx),
    fieldsDeny: fieldDenyMap(ctx),
    actions: actionMap(ctx),
    namingBrandIds,
  });
}
