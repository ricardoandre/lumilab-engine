'use client';

// ONE delete confirmation for the whole app.
//
// The ListEngine's detail drawer and the standalone EntityDrawer both offer
// Delete, and both must ask the same question the same way — so the dialog
// lives here rather than once per surface. `content` may be a function that
// resolves first (ResourceConfig.deleteContent), for a delete whose reach has
// to be looked up before it can be described.

import type { ReactNode } from 'react';
import type { App } from 'antd';

type Modal = ReturnType<typeof App.useApp>['modal'];
type Message = ReturnType<typeof App.useApp>['message'];

export async function confirmDelete(opts: {
  modal: Modal;
  message: Message;
  title: string;
  // A plain node, or a thunk resolved BEFORE the dialog opens — so the warning
  // is on screen the first time the user reads it, never appearing a beat later
  // under a cursor already on its way to the Delete button.
  content: ReactNode | (() => Promise<ReactNode>);
  onDelete: () => Promise<unknown>;
  onDone?: () => void;
}): Promise<void> {
  let content: ReactNode;
  if (typeof opts.content === 'function') {
    try {
      content = await opts.content();
    } catch {
      // A confirm that silently omits its warning is worse than no confirm.
      opts.message.error('Could not check what this delete affects.');
      return;
    }
  } else {
    content = opts.content;
  }

  opts.modal.confirm({
    title: opts.title,
    width: 460,
    content,
    okText: 'Delete',
    okButtonProps: { danger: true },
    onOk: () =>
      opts
        .onDelete()
        .then(() => {
          opts.message.success('Deleted.');
          opts.onDone?.();
        })
        .catch((e) => opts.message.error('Delete failed: ' + (e?.message || String(e)))),
  });
}
