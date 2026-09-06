import { NextResponse } from 'next/server';

// Turning Prisma's write failures into an answer the person at the screen can
// act on.
//
// A unique-constraint collision (P2002) is a normal thing for a user to do —
// typing a product code that already exists, say. Left alone it escapes the
// route handler as an unhandled throw, Next answers a bare 500, and the form
// shows "Failed to update products 3726" with no hint of what is wrong. That
// is exactly what /api/products answered on 2026-08-27 (`product_code_key`),
// and it is why the client error report existed at all.
//
// Not a blanket error swallower: anything that is NOT a constraint the user can
// resolve returns null and keeps throwing, so a real bug still surfaces as a
// 500 and still lands in the error report.

interface PrismaWriteError {
  code?: string;
  message?: string;
  meta?: { target?: unknown; modelName?: unknown };
}

// `product_code_key` -> "code"; `product_sample_variant_id_key` -> "sample
// variant". The model name comes off the front and the index suffix off the
// back, leaving the column the user actually typed into.
function readableTarget(err: PrismaWriteError): string | null {
  const target = err.meta?.target;
  if (Array.isArray(target) && target.length) return target.map(String).join(' + ');
  const raw = typeof target === 'string' ? target : /constraint: `([^`]+)`/.exec(err.message ?? '')?.[1];
  if (!raw) return null;
  const model = typeof err.meta?.modelName === 'string' ? err.meta.modelName : '';
  const prefix = model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const name = raw
    .replace(/_(key|unique|idx)$/, '')
    .replace(prefix ? new RegExp(`^${prefix}_`) : /^$/, '')
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .trim();
  return name || null;
}

export function uniqueConstraintResponse(err: unknown): NextResponse | null {
  const e = err as PrismaWriteError | null;
  if (!e || e.code !== 'P2002') return null;
  const what = readableTarget(e);
  return NextResponse.json(
    { error: what ? `Another record already has this ${what}. It has to be unique.` : 'Another record already has this value. It has to be unique.' },
    { status: 409 },
  );
}
