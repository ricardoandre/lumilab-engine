// Bus so any resource config can open a "Set status" dialog from a row's quick
// actions, without the config module needing React context.
//
// Why a bus rather than Modal.confirm: this app runs React 19 with antd 5,
// where the STATIC Modal/message helpers silently do nothing (see
// ApproveHost's note and the model-naming bus). A rowAction is a plain
// function in a config module, so the dialog has to live in a mounted
// component holding the instance from App.useApp().
//
// Deliberately GENERIC — it takes the fieldKey and the PATCH target, so any
// FieldOption-backed status can reuse it instead of each resource growing its
// own copy (KOL Product Request and Product Booking both use it).

export interface SetStatusRequest {
  // Where to PATCH, e.g. "kol-product-requests" -> /api/kol-product-requests/<id>
  resource: string;
  id: string;
  // Shown in the dialog header, e.g. the product name.
  title: string;
  // FieldOption fieldKey whose options fill the picker, e.g. "kol_booking.status".
  fieldKey: string;
  // The record's current option id, pre-selected.
  currentOptionId?: string | null;
  // Body key to PATCH. Defaults to statusOptionId.
  field?: string;
}

let handler: ((req: SetStatusRequest) => Promise<boolean>) | null = null;

/** The host registers itself here. Last one mounted wins; unregisters on unmount. */
export function registerSetStatusHandler(fn: (req: SetStatusRequest) => Promise<boolean>): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

/** Resolves true when something was saved, so the caller can reload its list. */
export function openSetStatus(req: SetStatusRequest): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  return handler(req);
}
