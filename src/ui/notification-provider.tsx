'use client';

import { useNotificationProvider as useAntdNotificationProvider } from '@refinedev/antd';
import type { NotificationProvider } from '@refinedev/core';

// Refine builds every mutation-error toast out of two pieces (see useCreate in
// @refinedev/core):
//
//   message      "There was an error creating kol-product-request (status code: 400)"
//   description  err.message  -> our API's own reason, via data-provider's httpError
//
// antd renders `message` as the TITLE and `description` underneath. So the
// heading was the machine's sentence and the human one sat below it — which is
// backwards when the reason is already something a person can act on ("That
// booking is set aside for Affiliate, but Cinintya Citra is KOL."). Andre,
// 2026-09-04: "i dont want to see code 400 ... no machine info in the user ui".
//
// So when the title is Refine's boilerplate, the reason is PROMOTED into it and
// the boilerplate is dropped entirely. A business rule refusing a save is the
// app working, and it should not be dressed up as a system fault.
//
// Only Refine's own wording is matched, so a toast we raise ourselves is left
// exactly as it is — and non-error toasts (including the undoable 'progress'
// one, whose description is a React element) never match.
const REFINE_BOILERPLATE = /^There was an error .*\(status code: .*\)\.?$/;

// Used only when Refine's boilerplate arrives with NO reason attached — a
// network failure, or a route that returned a bare status. Saying "couldn't
// save" is still more use than a status code.
const NO_REASON = "That didn't save. Please try again.";

const isBoilerplate = (v: unknown): v is string =>
  typeof v === 'string' && REFINE_BOILERPLATE.test(v.trim());

export function useAppNotificationProvider(): NotificationProvider {
  const base = useAntdNotificationProvider();
  return {
    ...base,
    open: (params) => {
      if (isBoilerplate(params.message)) {
        const reason =
          typeof params.description === 'string' && params.description.trim()
            ? params.description.trim()
            : NO_REASON;
        return base.open({ ...params, message: reason, description: undefined });
      }
      // The mirror case, kept from the first pass at this: some hooks put the
      // boilerplate in the description instead. Drop it and leave the title.
      return base.open({
        ...params,
        description: isBoilerplate(params.description) ? undefined : params.description,
      });
    },
  };
}
