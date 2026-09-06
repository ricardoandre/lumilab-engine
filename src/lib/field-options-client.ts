// Client-side FieldOption lookup by fieldKey+value — for a resource's
// savedFilters.getFilters() (runs in the browser), where the server-only
// resolveFieldOptionId (lib/field-options.ts, backed by Prisma directly)
// isn't usable. Ids are DB-generated and environment-specific; `value` is
// the stable code the schema comment on FieldOption promises won't change
// even if the option's label/color is edited later.
//
// Delegates to the shared field-options-cache so repeated saved-filter
// evaluations (each getFilters() call re-resolves the same key) share ONE
// request instead of one fetch each. Re-exported from here so existing
// importers don't have to change.
export { findFieldOptionId } from './field-options-cache';
