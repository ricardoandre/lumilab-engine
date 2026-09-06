'use client';

import { Create, Edit, useForm } from '@refinedev/antd';
import { Form, Row, Col, Spin } from 'antd';
import dayjs from 'dayjs';
import type { ResourceConfig } from '../lib/resource-config';
import { formFields } from '../lib/resource-config';
import { serializeFormDate } from '../lib/form-dates';
import { FormField } from './ResourceFormFields';

interface ResourceFormProps {
  config: ResourceConfig;
  mode: 'create' | 'edit' | 'clone';
  cloneId?: string;
}

export function ResourceForm({ config, mode, cloneId }: ResourceFormProps) {
  const { formProps, saveButtonProps, query } = useForm({
    resource: config.name,
    action: mode === 'clone' ? 'clone' : mode,
    id: mode === 'clone' ? cloneId : undefined,
  });
  const record: any = query?.data?.data;
  const Wrapper = mode === 'edit' ? Edit : Create;

  const fields = formFields(config, mode);
  const dateFields = fields.filter((f) => f.type === 'date' || f.type === 'datetime');
  const dateFieldNames = dateFields.map((f) => f.name);

  if ((mode === 'edit' || mode === 'clone') && (query?.isFetching || !record)) {
    return (
      <Wrapper saveButtonProps={saveButtonProps}>
        <Spin />
      </Wrapper>
    );
  }

  // Cloning a repeatableList field must drop each row's `id` — those ids
  // point at the SOURCE record's sub-table rows (e.g. product_material),
  // and submitting them as-is would update the original's rows instead of
  // creating fresh ones for the new record.
  const repeatableListFieldNames = fields.filter((f) => f.type === 'repeatableList' || f.type === 'measurementGrid').map((f) => f.name);
  const imageGalleryFields = fields.filter((f) => f.type === 'imageGallery');

  const initialValues =
    mode === 'edit' || mode === 'clone'
      ? {
          ...record,
          ...(mode === 'clone' ? { id: undefined, ...Object.fromEntries((config.excludeOnClone ?? []).map((name) => [name, undefined])) } : {}),
          ...Object.fromEntries(
            dateFieldNames.map((name) => [name, record[name] ? dayjs(record[name]) : undefined]),
          ),
          // imageGallery's form field name (e.g. "imageIds") never matches a
          // real record key — the record holds the join rows under a
          // different key (e.g. "images") — so it must be derived explicitly
          // rather than picked up by the `...record` spread above. Carried
          // over on clone too (same attachment, new join row — safe, since
          // Attachment rows can be referenced by more than one parent).
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
      : undefined;

  return (
    <Wrapper saveButtonProps={saveButtonProps}>
      <Form
        {...formProps}
        className="kano-form"
        layout="vertical"
        initialValues={initialValues}
        onFinish={(values: any) => {
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
          for (const f of fields) {
            if ((f.type === 'relation' || f.type === 'select' || f.type === 'date' || f.type === 'datetime') && converted[f.name] === undefined) {
              converted[f.name] = f.relation?.multiSelect ? [] : null;
            }
          }
          formProps.onFinish?.(converted);
        }}
      >
        {/* xs:24 stacks fields single-column on mobile; wider screens get a 2-up grid */}
        <Row gutter={16}>
          {fields.map((field) => (
            <Col key={field.name} xs={24} sm={field.type === 'textarea' || field.type === 'richtext' || field.type === 'image' || field.type === 'imageGallery' || field.type === 'repeatableList' || field.type === 'measurementGrid' || field.type === 'numberList' ? 24 : 12}>
              {/* `form` is what makes FieldConfig.onChange fire (the prefill
                  cascades) — without it this page silently dropped every one
                  of them, unlike the drawer. */}
              <FormField field={field} record={mode === 'create' ? undefined : record} form={formProps.form} mode={mode} />
            </Col>
          ))}
        </Row>
        {/* Same companion slot as the drawer — see ResourceConfig.formExtra. */}
        {config.formExtra?.({ record: mode === 'create' ? undefined : record, mode, id: mode === 'clone' ? cloneId : undefined, form: formProps.form })}
      </Form>
    </Wrapper>
  );
}
