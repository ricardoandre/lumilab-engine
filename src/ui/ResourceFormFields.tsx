'use client';

// Field-rendering logic shared by ResourceForm (full-page create/edit) and
// ResourceFormDrawer (same forms, opened in a Drawer over the list instead
// of navigating away) — one FieldConfig -> input mapping, used by both.

import { useEffect, useState } from 'react';
import { AutoComplete, Button, Divider, Form, Input, InputNumber, Select, DatePicker, Switch } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import type { FieldConfig } from '../lib/resource-config';
import { useRelationSelect } from '../lib/use-relation-select';
import { useCreatableOptions } from '../lib/use-creatable-options';
import { ImageUploadField } from './ImageUploadField';
import { ImageGalleryField } from './ImageGalleryField';
import { RepeatableListField } from './RepeatableListField';
import { NumberListField } from './NumberListField';
import { MeasurementGridField } from './MeasurementGridField';
import { RichTextEditor } from './RichTextEditor';
import { uploadAttachment } from '../lib/attachment-upload';
import { minFormDate, maxFormDate } from '../lib/form-dates';

export function FormField({ field, record, form, createInitialValues, mode }: FormFieldProps) {
  // field.addon renders UNDER the normal field (see FieldConfig.addon) — a
  // slot for per-resource live lookups and offers, so the engine doesn't grow
  // a special case per behaviour. Needs the form to write into, so it's only
  // rendered when one is present.
  if (!field.addon || !form) return <FormFieldInput field={field} record={record} form={form} createInitialValues={createInitialValues} mode={mode} />;
  return (
    <>
      <FormFieldInput field={field} record={record} form={form} createInitialValues={createInitialValues} mode={mode} />
      {field.addon({ form, record, mode: mode ?? (record === undefined ? 'create' : 'edit') })}
    </>
  );
}

interface FormFieldProps {
  field: FieldConfig;
  record?: any;
  form?: FormInstance;
  createInitialValues?: Record<string, any>;
  mode?: 'create' | 'edit' | 'clone';
}

// field.labelAction renders a trigger at the right end of the label row (see
// FieldConfig.labelAction). The label lives inside antd's <label>, which is
// bound to the input — so a click in here would ALSO activate the field and
// drop a Select dropdown behind whatever the trigger opened. preventDefault on
// the wrapper kills that activation without touching the trigger's own handler.
function labelNode(field: FieldConfig, form: FormInstance | undefined, record: any, mode: 'create' | 'edit' | 'clone') {
  if (!field.labelAction || !form) return field.label;
  const action = field.labelAction({ form, record, mode });
  if (!action) return field.label;
  return (
    <span className="kano-label-action-row">
      {field.label}
      <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>{action}</span>
    </span>
  );
}

function FormFieldInput({ field, record, form, createInitialValues, mode }: FormFieldProps) {
  const rules = field.required ? [{ required: true }] : [];
  const label = labelNode(field, form, record, mode ?? (record === undefined ? 'create' : 'edit'));
  // field.labelHelp renders as antd's Form.Item `tooltip` — a "?" icon next to
  // the LABEL, content on hover. Distinct from `extra` (static text always
  // shown under the field) and from `addon` (a live panel under the field):
  // this is for help you only want when you go looking for it. The node is
  // built here but antd only mounts it on first hover, so a component inside
  // it doesn't fetch until the icon is actually hovered.
  const tooltip = field.labelHelp
    ? field.labelHelp({ form, record, mode: record === undefined ? 'create' : 'edit' })
    : undefined;
  // Only on a from-scratch create (both callers pass record: undefined for
  // mode 'create' only — clone/edit always pass the record, whose values come
  // through the Form's initialValues instead).
  // A function default is evaluated per render of the create form, not once at
  // module load — see FieldConfig.defaultValue (Fabric In's "today").
  const initial =
    record === undefined
      ? typeof field.defaultValue === 'function'
        ? (field.defaultValue as () => unknown)()
        : field.defaultValue
      : undefined;

  if (field.type === 'relation') {
    // On create there's no `record`, so a PREFILLED relation (createInitialValues,
    // e.g. "+ Link Product" filling Main Fabric / Sample Variant from a sample
    // variant) has nothing to resolve its label from and renders as a raw id.
    // Feed the prefilled id in as the picker's current value so useRelationSelect
    // fetches its label the same way edit mode does. Deliberately NOT merged into
    // `record` above — that would suppress field.defaultValue on create.
    return (
      <RelationFormField
        field={field}
        label={label}
        rules={rules}
        currentValue={record?.[field.name] ?? createInitialValues?.[field.name] ?? undefined}
        form={form}
      />
    );
  }

  if (field.type === 'repeatableList') {
    return (
      <Form.Item label={label} name={field.name} rules={rules} extra={field.extra} tooltip={tooltip}>
        <RepeatableListField config={field.repeatableList!} />
      </Form.Item>
    );
  }

  if (field.type === 'measurementGrid') {
    return (
      <Form.Item label={label} name={field.name} rules={rules} extra={field.extra} tooltip={tooltip}>
        <MeasurementGridField config={field.measurementGrid!} />
      </Form.Item>
    );
  }

  if (field.type === 'numberList') {
    return (
      <Form.Item label={label} name={field.name} rules={rules} extra={field.extra} tooltip={tooltip}>
        <NumberListField config={field.numberList!} />
      </Form.Item>
    );
  }

  if (field.type === 'image') {
    const relatedKey = field.name.replace(/Id$/, '');
    const initialUrl = record?.[relatedKey]?.storageKey ? `/api/files/${record[relatedKey].storageKey}` : undefined;
    return (
      <Form.Item label={label} name={field.name} rules={rules} extra={field.extra} tooltip={tooltip}>
        <ImageUploadField initialUrl={initialUrl} />
      </Form.Item>
    );
  }

  if (field.type === 'imageGallery') {
    const { addLabel } = field.imageGallery!;
    return (
      <Form.Item label={label} name={field.name} rules={rules} extra={field.extra} tooltip={tooltip}>
        <ImageGalleryField addLabel={addLabel} />
      </Form.Item>
    );
  }

  return (
    <Form.Item
      label={label}
      name={field.name}
      rules={rules}
      extra={field.extra}
      tooltip={tooltip}
      initialValue={initial}
      valuePropName={field.type === 'boolean' ? 'checked' : 'value'}
    >
      {renderInput(field, form)}
    </Form.Item>
  );
}

function RelationFormField({ field, label, rules, currentValue, form }: { field: FieldConfig; label: React.ReactNode; rules: object[]; currentValue?: string | number | null | (string | number)[]; form?: FormInstance }) {
  // Without a defaultValue, a value outside the picker's loaded options page
  // shows as a raw id instead of its label — see useRelationSelect for that
  // and for how typing searches the options.
  // `?? undefined` matters: useSelect fires a get-by-id even for a null
  // defaultValue, which 500s the route's BigInt(id).
  const multiSelect = !!field.relation?.multiSelect;
  // Follow the field's LIVE value, not just the one it mounted with: a value
  // written programmatically (material-details' code prefill, Product
  // Measurement's name -> Products fill) is never in the picker's loaded
  // options page, so without re-resolving it the Select renders raw ids.
  // Falls back to the mount-time value for the render before the watch reports.
  const watched = Form.useWatch(field.name, form);
  const live = watched ?? currentValue;
  // A multiSelect field's value is an id ARRAY; an empty one must stay
  // undefined so useSelect doesn't fire a pointless get-by-id batch.
  const defaultValue = multiSelect
    ? (Array.isArray(live) && live.length ? live : undefined)
    : (Array.isArray(live) ? undefined : (live ?? undefined));
  // A picker whose options depend on another field (RelationConfig.dependsOn) —
  // watched live so choosing a product immediately narrows the bookings offered.
  // Hooks cannot be called in a loop, so the watched values come from the form
  // instance on each render rather than from N useWatch calls.
  const dependsOn = field.relation?.dependsOn;
  // A SELECTOR, not a field name: it re-renders when any watched dependency
  // changes and stays quiet for every other keystroke in the form. Watching
  // only dependsOn[0] would silently ignore a second dependency.
  const depWatch = Form.useWatch(
    (values: any) => (dependsOn ? dependsOn.map((n) => values?.[n]).join('|') : ''),
    form,
  );
  const depValues: Record<string, any> = {};
  if (dependsOn && form) for (const n of dependsOn) depValues[n] = form.getFieldValue(n);
  const depFilters = field.relation?.filtersFor ? field.relation.filtersFor(depValues) : undefined;
  // null from filtersFor = the dependency is unanswered, so offer nothing.
  const depBlocked = depFilters === null;

  const selectProps = useRelationSelect(field.relation, {
    defaultValue,
    extraFilters: depFilters ?? undefined,
    disabled: depBlocked,
  });

  // Add-a-missing-option from inside the picker (RelationConfig.allowCreate) —
  // the same affordance the repeatable-list row picker has, so a vocabulary
  // like KOL's tags can grow without a trip to the Field Options screen.
  const creatable = useCreatableOptions(field.relation);
  const [newLabel, setNewLabel] = useState('');
  const allowCreate = field.relation?.allowCreate;

  // The created option is selected straight away — adding it and then having to
  // find it again in the list is the friction this removes.
  async function addOption() {
    const id = await creatable.create(newLabel);
    if (!id || !form) return;
    setNewLabel('');
    const current = form.getFieldValue(field.name);
    const next = multiSelect ? [...(Array.isArray(current) ? current : []), id] : id;
    form.setFieldValue(field.name, next);
    field.onChange?.(next, form);
  }

  void depWatch; // read only so the picker re-renders when its dependency changes

  return (
    <Form.Item label={label} name={field.name} rules={rules} extra={field.extra}>
      <Select
        {...selectProps}
        {...(multiSelect ? { mode: 'multiple' as const } : {})}
        {...(allowCreate ? { options: [...(selectProps.options ?? []), ...creatable.extra] } : {})}
        {...(depBlocked ? { disabled: true, placeholder: field.relation?.dependsOnHint } : {})}
        allowClear
        placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}...`}
        popupRender={
          allowCreate
            ? (menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: '6px 0' }} />
                  <div style={{ display: 'flex', gap: 6, padding: '0 8px 6px' }}>
                    <Input
                      size="small"
                      value={newLabel}
                      placeholder={allowCreate.placeholder ?? 'Add new...'}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      onPressEnter={addOption}
                    />
                    <Button size="small" type="text" icon={<PlusOutlined />} loading={creatable.busy} onClick={addOption}>
                      Add
                    </Button>
                  </div>
                </>
              )
            : undefined
        }
        onChange={(value, option) => {
          selectProps.onChange?.(value, option as any);
          if (form) field.onChange?.(value, form);
        }}
      />
    </Form.Item>
  );
}

// field.onChange (a cascading side effect, e.g. auto-filling other fields)
// fires alongside antd's own name-bound value tracking — Form.Item composes
// a child's own onChange with its internal one rather than replacing it, so
// this doesn't interfere with the field's normal value binding.
function renderInput(field: FieldConfig, form?: FormInstance) {
  const fire = (value: any) => { if (form) field.onChange?.(value, form); };
  // FieldConfig.disabled — shown, greyed, unwritable. Every branch below takes
  // it, so a config can make any field read-only context without the form
  // having to drop it.
  const off = !!field.disabled;
  switch (field.type) {
    case 'textarea':
      return <Input.TextArea rows={4} disabled={off} placeholder={field.placeholder} onChange={(e) => fire(e.target.value)} />;
    case 'richtext':
      return (
        <RichTextEditor
          readOnly={off}
          placeholder={field.placeholder}
          // Passing the uploader is what draws the image button — see
          // FieldConfig.allowImages. The URL comes back from /api/attachments
          // and goes into the HTML as a plain <img src>, which the read side's
          // DOMPurify keeps.
          onUploadImage={field.allowImages ? (file) => uploadAttachment(file).then((att) => att.url) : undefined}
        />
      );
    case 'number':
      return <InputNumber style={{ width: '100%' }} disabled={off} placeholder={field.placeholder} onChange={fire} />;
    // minDate/maxDate bound TYPED input as well as the calendar — the year is
    // otherwise unbounded, and `20226-07-28` round-trips through dayjs into a
    // MySQL 1292 and a 500. See form-dates.ts.
    case 'date':
      return (
        <DatePicker
          style={{ width: '100%' }}
          disabled={off}
          minDate={minFormDate()}
          maxDate={maxFormDate()}
          onChange={fire}
        />
      );
    case 'datetime':
      return (
        <DatePicker
          style={{ width: '100%' }}
          disabled={off}
          showTime
          minDate={minFormDate()}
          maxDate={maxFormDate()}
          onChange={fire}
        />
      );
    case 'select':
      return <Select options={field.options} disabled={off} allowClear placeholder={field.placeholder ?? `Select ${field.label.toLowerCase()}...`} onChange={fire} />;
    case 'autocomplete':
      return <AutocompleteInput field={field} disabled={off} onValue={fire} />;
    case 'boolean':
      return <Switch disabled={off} onChange={fire} />;
    default:
      return <Input disabled={off} placeholder={field.placeholder} onChange={(e) => fire(e.target.value)} />;
  }
}

// type: 'autocomplete' — a plain text box that also suggests values already in
// use (Product's Model). Free text is always allowed: the value is whatever is
// typed, and the list only exists to stop the same model being spelled three
// ways. Options load once on mount from the field's own cached source.
//
// Filtering is client-side over the WHOLE loaded list — the source returns
// every distinct value in one go (Product has ~1.2k models, ~40 KB), so
// there's no per-keystroke request and no debounce to get wrong.
//
// `maxOptions` caps only what is RENDERED, applied AFTER the filter. Capping
// the source list instead is a bug that hides most of the data: the list
// arrives ordered by usage, so a top-50 slice meant a model used 4 times
// (A46Mahesvara, ranked ~250th) could never be found by typing its name, even
// though it was in the payload (Andre, 2026-08-19: "model not yet populated").
function AutocompleteInput({
  field,
  onValue,
  value,
  onChange,
  disabled,
}: {
  field: FieldConfig;
  onValue: (v: any) => void;
  // FieldConfig.disabled — shown, greyed, unwritable. Without this the box
  // stayed fully editable even when the config said otherwise.
  disabled?: boolean;
  // Supplied by the enclosing Form.Item, which controls this input.
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [all, setAll] = useState<{ value: string; hint?: string }[]>([]);
  // What the user has typed into the box, tracked separately from the form
  // value so the list narrows as they type.
  const [search, setSearch] = useState('');
  const maxOptions = field.autocomplete?.maxOptions ?? 50;
  const source = field.autocomplete?.source;

  useEffect(() => {
    let live = true;
    source?.()
      .then((rows) => { if (live) setAll(rows); })
      .catch(() => {}); // suggestions are a convenience — a failed load just means plain text
    return () => { live = false; };
  }, [source]);

  const needle = search.trim().toLowerCase();
  const options = all
    // Substring match, not antd's default prefix match — "Agra" should find
    // "A17Agra", where the useful part of the name is at the END.
    .filter((r) => !needle || r.value.toLowerCase().includes(needle))
    .slice(0, maxOptions)
    .map((r) => ({
      value: r.value,
      label: r.hint
        ? (
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{r.value}</span>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{r.hint}</span>
          </span>
        )
        : undefined,
    }));

  return (
    <AutoComplete
      value={value}
      options={options}
      disabled={disabled}
      style={{ width: '100%' }}
      placeholder={field.placeholder}
      // Filtering is done above, against the full list — antd must not filter
      // the already-filtered slice again by its own prefix rule.
      filterOption={false}
      onSearch={setSearch}
      onChange={(v) => { setSearch(v ?? ''); onChange?.(v); onValue(v); }}
    />
  );
}
