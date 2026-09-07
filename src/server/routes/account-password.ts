import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth, db } from '../../runtime';

/**
 * Change the signed-in user's password.
 *
 * In the ENGINE because every app needs it identically and none should have to
 * remember it: the first app built on this engine shipped without a way to
 * change a password at all, and Andre had to ask for it. A standard feature that
 * each app must reinvent is a standard feature only in name.
 *
 * Wire it up with a one-line route:
 *   export { POST } from '@lumilab/engine/server/routes/account-password';
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Both current and new password are required.' }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters.' }, { status: 400 });
  }

  const user = await db().user.findUnique({ where: { id: BigInt(session.user.id) } });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // The CURRENT password is required even though the session already proves who
  // this is: a session left open on a shared machine would otherwise be a
  // permanent account takeover, and this is the one endpoint that grants that.
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: 'Current password is wrong.' }, { status: 400 });
  }

  await db().user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  return NextResponse.json({ ok: true });
}
