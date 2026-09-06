'use client';

// Generic create/edit form rendered inside a Drawer over the list
// (ListEngine-driven resources), instead of navigating to a separate
// /create or /edit/[id] page. Reuses the exact same FormField rendering as
// the full-page ResourceForm — only the chrome differs (DrawerShell +
// Save/Cancel footer instead of refine's Create/Edit page wrapper).

import { useForm } from '@refinedev/antd';
import { App, Form, Row, Col, Button } from 'antd';
import dayjs from 'dayjs';
import type { ResourceConfig, FieldConfig } from '../lib/resource-config';
import { formFields, aclWriteKeyOf } from '../lib/resource-config';
import { serializeFormDate } from '../lib/form-dates';
import { FormField } from './ResourceFormFields';
import { DrawerShell } from './DrawerShell';
import { FormSections } from './FormSections';
import { usePermissions, writableFieldSet, blockedFieldSet, canAction } from '../lib/use-permissions';
import { useDirtyClose } from '../lib/use-dirty-close';

// Fixed widths per size — pick based on how many fields the form has (a
// Task-sized form fits 'medium'; a form with only 2-3 fields can use
// 'small'; a form as dense as Sample's own hand-built drawer would want
// 'large'). Configured per-resource via ResourceConfig.formDrawerSize.
const DRAWER_WIDTH: Record<NonNullable<ResourceConfig['formDrawerSize']>, number> = {
  small: 420,
  medium: 560,
  large: 760,
};

export function ResourceFormDrawer({
  config,
  mode,
  id,
  open,
  onClose,
  onSaved,
  headerExtra,
  createInitialValues,
  title,
}: {
  config: ResourceConfig;
  mode: 'create' | 'edit' | 'clone';
  id?: string | number;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Optional node rendered above the form (e.g. the Raw Material / Material
  // Details segmented chooser on the merged Material create drawer).
  headerExtra?: React.ReactNode;
  // Prefill for create mode — e.g. a new variant pre-linked to its raw
  // material ("Add variant" on a fabric group).
  createInitialValues?: Record<string, any>;
  title?: string;
}) {
  // Context-bound, not antd's static message: under React 19 + antd 5 the
  // static helpers can no-op (the same defect that killed static Modal.confirm
  // — see color-mapping-offer-bus). Handed to afterSave so a resource can
  // report what its save actually did without owning a bus for one toast.
  const { message } = App.useApp();
  const { formProps, saveButtonProps, query } = useForm({
    resource: config.name,
    action: mode === 'clone' ? 'clone' : mode,
    id: mode === 'edit' || mode === 'clone' ? id : undefined,
    redirect: false,
    onMutationSuccess: (data: any) => {
      onSaved();
      // Post-save offer (see ResourceConfig.afterSave). Deliberately after
      // onSaved and never awaited — the record is already written; this is a
      // follow-up question, not part of saving it.
      config.afterSave?.({ record: data?.data ?? data, mode, message });
    },
  });
  const record: any = query?.data?.data;
  const form = formProps.form;

  const fields = formFields(config, mode);
  // Phase 2 field-level: hide fields this user's role isn't allowed to write.
  // writableFieldSet returns null for admins, or when perms haven't loaded, or
  // when this resource/action has no field restriction — so visibleFields ===
  // fields for the common case (a no-op for almost every user/resource).
  const { perm } = usePermissions();
  const writeAction = mode === 'edit' ? 'update' : 'create';
  const writable = writableFieldSet(perm, config.name, writeAction);
  const blocked = blockedFieldSet(perm, config.name, writeAction);
  // An override-granted edit has NO RolePermission row, so writableFieldSet
  // finds no allowlist and would read as "unrestricted". The override says which
  // fields it permits; the server enforces the same list.
  const overrideFields =
    mode === 'edit' && !canAction(perm, aclWriteKeyOf(config), 'update')
      ? config.editOverride?.(record, perm) ?? null
      : null;
  const allowed = overrideFields ? new Set(overrideFields) : null;
  const visibleFields = fields.filter(
    (f) => (writable ? writable.has(f.name) : true) && !blocked.has(f.name) && (!allowed || allowed.has(f.name)),
  );

  const dateFields = visibleFields.filter((f) => f.type === 'date' || f.type === 'datetime');
  const dateFieldNames = dateFields.map((f) => f.name);
  const imageGalleryFields = visibleFields.filter((f) => f.type === 'imageGallery');
  // Cloning a repeatableList/measurementGrid field must drop each row's
  // `id` — those point at the SOURCE record's sub-table rows, and
  // submitting them as-is would update the original instead of creating
  // fresh rows for the new record. Mirrors ResourceForm's own clone mode.
  const repeatableListFieldNames = visibleFields.filter((f) => f.type === 'repeatableList' || f.type === 'measurementGrid').map((f) => f.name);

  const loading = (mode === 'edit' || mode === 'clone') && (query?.isFetching || !record);

  const initialValues =
    (mode === 'edit' || mode === 'clone') && record
      ? {
          ...record,
          ...(mode === 'clone' ? { id: undefined, ...Object.fromEntries((config.excludeOnClone ?? []).map((name) => [name, undefined])) } : {}),
          ...Object.fromEntries(dateFieldNames.map((name) => [name, record[name] ? dayjs(record[name]) : undefined])),
          ...Object.fromEntries(
            imageGalleryFields.map((f) => [
              f.name,
              (record[f.imageGallery!.itemsField] ?? []).map((item: any) => ({
                attachmentId: item.attachmentId,
                url: f.imageGallery!.urlOf(item),
              })),
            ]),
          ),
          ...(mode === 'clone'
            ? Object.fromEntries(
                repeatableListFieldNames.map((name) => [name, (record[name] ?? []).map((row: any) => ({ ...row, id: undefined }))]),
              )
            : {}),
        }
      : mode === 'create'
        ? createInitialValues
        : undefined;

  // Clicking the mask / pressing ESC asks first when anything has been typed;
  // Cancel and the header × stay instant. antd only marks a field touched on
  // user input, so an untouched form still closes with no prompt.
  const dismiss = useDirtyClose(onClose, () => !!form?.isFieldsTouched());

  const footer = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <Button onClick={onClose}>Cancel</Button>
      <Button type="primary" {...saveButtonProps}>
        {mode === 'edit' ? 'Save changes' : mode === 'clone' ? 'Create duplicate' : 'Create'}
      </Button>
    </div>
  );

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      onDismiss={dismiss}
      title={title ?? (mode === 'edit' ? `Edit ${config.label}` : mode === 'clone' ? `Duplicate ${config.label}` : `New ${config.label}`)}
      accentColor="#26344b"
      width={DRAWER_WIDTH[config.formDrawerSize ?? 'medium']}
      placement="right"
      loading={loading}
      footer={footer}
    >
      {headerExtra}
      <Form
        {...formProps}
        className="kano-form"
        layout="vertical"
        initialValues={initialValues}
        onFinish={async (values: any) => {
          const converted = { ...values };
          for (const f of dateFields) {
            if (converted[f.name]) converted[f.name] = serializeFormDate(converted[f.name], f.type === 'date');
          }
          // A cleared Select/DatePicker (allowClear) lands in `values` as
          // `undefined`, not `null` — and JSON.stringify silently drops
          // undefined keys, so the field never reaches the API at all and
          // the "clear" appears to do nothing. Relation/select/date fields
          // specifically need an explicit null to actually send the clear.
          // A multiSelect relation clears to an empty ARRAY, not null — its
          // API side reads the array as "these are all the linked children".
          for (const f of visibleFields) {
            if ((f.type === 'relation' || f.type === 'select' || f.type === 'date' || f.type === 'datetime') && converted[f.name] === undefined) {
              converted[f.name] = f.relation?.multiSelect ? [] : null;
            }
          }
          // Pre-save hook (see ResourceConfig.beforeSave). Runs on the
          // CONVERTED values — what would actually be sent — and can change
          // them or cancel the save outright by returning null.
          const approved = config.beforeSave ? await config.beforeSave({ values: converted, record, mode }) : converted;
          if (!approved) return; // cancelled — drawer stays open on the form
          formProps.onFinish?.(approved);
        }}
      >
        {/* Drawer widths (420-760px) are narrower than a full page — always
            single-column, unlike ResourceForm's 2-up grid on wide screens. */}
        {config.formSections?.length ? (
          <FormSections
            resetKey={mode === 'create' ? undefined : id}
            sections={config.formSections.flatMap((s) => {
              // Create-only trim: sections flagged hideOnCreate (Variants,
              // Comments, Pricing, Remarks for Sample) don't render on create,
              // so the create form matches the leaner old create drawer.
              if (mode === 'create' && s.hideOnCreate) return [];
              // A section can carry fields, a custom render (Sample's images /
              // Variants grid / Comments), or BOTH — fields first, then render.
              const vis = (s.fields ?? [])
                .map((name) => visibleFields.find((f) => f.name === name))
                .filter((f): f is FieldConfig => !!f);
              // Under an EDIT OVERRIDE the permission is a list of FIELDS, so
              // only fields may render. A section's custom panel — Product's
              // Variant grid and Measurement picker — is not a field and was
              // surviving the filter below, which drops a section only when it
              // has neither visible fields NOR a panel. Dina could therefore
              // reach variants and measurements from a naming edit (Andre,
              // 2026-08-30: "not on variant and measurement").
              const custom = s.render && !overrideFields ? s.render({ record, mode, id, form }) : null;
              // Drop a pure-field section the user can't write any field of.
              if (!vis.length && !custom) return [];
              return [{
                key: s.key,
                title: s.title,
                accent: s.accent,
                note: s.note,
                content: (
                  <>
                    {s.renderTop && custom}
                    {vis.length > 0 && (
                      <Row gutter={16}>
                        {vis.map((field) => (
                          <Col key={field.name} xs={24} sm={field.halfWidth ? 12 : 24}>
                            <FormField field={field} record={mode === 'create' ? undefined : record} form={form} createInitialValues={mode === 'create' ? createInitialValues : undefined} mode={mode} />
                          </Col>
                        ))}
                      </Row>
                    )}
                    {!s.renderTop && custom}
                  </>
                ),
              }];
            })}
          />
        ) : (
          <Row gutter={16}>
            {visibleFields.map((field) => (
              <Col key={field.name} xs={24} sm={field.halfWidth ? 12 : 24}>
                <FormField field={field} record={mode === 'create' ? undefined : record} form={form} createInitialValues={mode === 'create' ? createInitialValues : undefined} mode={mode} />
              </Col>
            ))}
          </Row>
        )}
        {/* Companion panel below the fields — inside the <Form>, so anything it
            renders in a Form.Item is submitted with the rest. See formExtra. */}
        {config.formExtra?.({ record: mode === 'create' ? undefined : record, mode, id, form })}
      </Form>
    </DrawerShell>
  );
}
