import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { auth, db } from '../../runtime';

/**
 * List and create users. Admin only — creating a login is the most powerful
 * thing anyone can do in an app, so it never rides on ordinary resource
 * permissions.
 *
 * Wire it up with:
 *   export { GET, POST } from '@lumilab/engine/server/routes/users';
 */
async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!session.user.isAdmin) return { error: NextResponse.json({ error: 'Admins only.' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const users = await db().user.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json({
    data: users.map((u: any) => ({
      id: String(u.id),
      email: u.email,
      nickname: u.nickname,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString().slice(0, 10),
    })),
  });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const nickname = String(body.nickname ?? '').trim();
  const password = String(body.password ?? '');
  const isAdmin = body.isAdmin === true;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (await db().user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 400 });
  }

  const user = await db().user.create({
    data: {
      email,
      // Defaults to the part before the @ rather than a hardcoded name: a seed
      // script that hardcoded one duly labelled the second user with the first
      // user's name.
      nickname: nickname || email.split('@')[0],
      passwordHash: await bcrypt.hash(password, 10),
      isAdmin,
    },
  });
  return NextResponse.json({ id: String(user.id), email: user.email });
}
