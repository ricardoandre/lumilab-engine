import type { DataProvider, HttpError } from '@refinedev/core';

const jsonHeaders = { 'Content-Type': 'application/json' };

// Refine's error notification renders `error.message` and `error.statusCode`.
// A bare `new Error('Failed to create samples')` has no statusCode — that's
// where "(status code: undefined)" came from — and it threw away the reason
// the API actually gave (e.g. 400 `{ error: 'name is required' }`). Read the
// JSON body so the toast says what went wrong.
//
// This message now stands ALONE in the toast: notification-provider.tsx drops
// Refine's generic "(status code: N)" second line, because a business rule
// refusing a save is not a system fault. So the fallback — used only when the
// API returned no reason of its own — has to be a complete sentence and carry
// the status itself, rather than leaning on that dropped line.
async function httpError(res: Response, verb: string, what: string): Promise<HttpError> {
  const body = await res.json().catch(() => null);
  const reason = body?.error || body?.message;
  const err = new Error(
    reason || `Couldn't ${verb} ${what}. The server returned ${res.status}${res.status >= 500 ? ' — try again in a moment.' : '.'}`,
  ) as Error & HttpError;
  err.statusCode = res.status;
  return err;
}

// "kol-product-requests" -> "kol product request": a slug is a route, not
// something to show a person mid-sentence.
const human = (resource: string) => resource.replace(/-/g, ' ').replace(/s$/, '');

export const dataProvider: DataProvider = {
  getApiUrl: () => '/api',

  getList: async ({ resource, pagination, sorters, filters }) => {
    const params = new URLSearchParams();
    params.set('page', String(pagination?.currentPage ?? 1));
    params.set('pageSize', String(pagination?.pageSize ?? 10));
    if (sorters && sorters.length > 0) {
      params.set('sortField', sorters[0].field);
      params.set('sortOrder', sorters[0].order);
    }
    if (filters && filters.length > 0) {
      params.set('filters', JSON.stringify(filters));
    }
    const res = await fetch(`/api/${resource}?${params.toString()}`);
    if (!res.ok) throw await httpError(res, 'load', `the ${human(resource)} list`);
    const json = await res.json();
    return { data: json.data, total: json.total };
  },

  getOne: async ({ resource, id }) => {
    const res = await fetch(`/api/${resource}/${id}`);
    if (!res.ok) throw await httpError(res, 'load', `this ${human(resource)}`);
    const data = await res.json();
    return { data };
  },

  create: async ({ resource, variables }) => {
    const res = await fetch(`/api/${resource}`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(variables),
    });
    if (!res.ok) throw await httpError(res, 'create', `this ${human(resource)}`);
    const data = await res.json();
    return { data };
  },

  update: async ({ resource, id, variables }) => {
    const res = await fetch(`/api/${resource}/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify(variables),
    });
    if (!res.ok) throw await httpError(res, 'save', `this ${human(resource)}`);
    const data = await res.json();
    return { data };
  },

  deleteOne: async ({ resource, id }) => {
    const res = await fetch(`/api/${resource}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw await httpError(res, 'delete', `this ${human(resource)}`);
    const data = await res.json().catch(() => ({}));
    return { data };
  },
};
