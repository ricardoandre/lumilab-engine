// Syncs a plain join table (parentId, childId — no extra columns) against the
// id array a multiSelect relation field submits. Diffs by the child id rather
// than the join row's own id: there is nothing else on the row to "update", a
// link either exists or it doesn't. `undefined` means "field not submitted" —
// leave the links alone; an empty array means "unlink everything".

type JoinDelegate = {
  findMany: (...args: any[]) => Promise<any[]>;
  deleteMany: (...args: any[]) => Promise<any>;
  create: (...args: any[]) => Promise<any>;
};

export async function syncLinkTable(
  delegate: JoinDelegate,
  parentIdField: string,
  parentId: bigint,
  childIdField: string,
  ids: (string | number | bigint)[] | undefined,
) {
  if (ids === undefined) return;
  const desired = new Set(ids.filter((v) => v != null && v !== '').map(String));

  const existing = await delegate.findMany({
    where: { [parentIdField]: parentId },
    select: { id: true, [childIdField]: true },
  });

  const toDeleteIds = existing.filter((e: any) => !desired.has(String(e[childIdField]))).map((e: any) => e.id);
  if (toDeleteIds.length) await delegate.deleteMany({ where: { id: { in: toDeleteIds } } });

  const already = new Set(existing.map((e: any) => String(e[childIdField])));
  for (const id of desired) {
    if (already.has(id)) continue;
    await delegate.create({ data: { [parentIdField]: parentId, [childIdField]: BigInt(id) } });
  }
}
