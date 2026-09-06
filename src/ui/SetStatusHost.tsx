'use client';

// The "Set status" dialog, mounted once globally so any list's quick action can
// open it (Andre, 2026-08-28: "add quick action besides edit quick action to
// set status"). See lib/set-status-bus.ts for why it works this way.

import { useEffect, useState } from 'react';
import { App, Modal, Select } from 'antd';
import { registerSetStatusHandler, type SetStatusRequest } from '../lib/set-status-bus';
import { getFieldOptions, type FieldOption } from '../lib/field-options-cache';
import { pillColor } from '../lib/pill-colors';

export function SetStatusHost() {
  const { message } = App.useApp();
  const [req, setReq] = useState<SetStatusRequest | null>(null);
  // Survives the close animation, so the header doesn't blank out mid-fade.
  const [title, setTitle] = useState('Set status');
  const [resolver, setResolver] = useState<((saved: boolean) => void) | null>(null);
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => registerSetStatusHandler((r) => {
    setReq(r);
    return new Promise<boolean>((resolve) => setResolver(() => resolve));
  }), []);

  useEffect(() => {
    if (!req) return;
    setTitle(`Set status — ${req.title}`);
    setPicked(req.currentOptionId ? String(req.currentOptionId) : null);
    // Module-cached + in-flight deduped, so opening this on row after row costs
    // one request in total.
    getFieldOptions(req.fieldKey).then(setOptions);
  }, [req]);

  function finish(saved: boolean) {
    resolver?.(saved);
    setResolver(null);
    setReq(null);
  }

  async function save() {
    if (!req) return;
    if (!picked || String(picked) === String(req.currentOptionId ?? '')) return finish(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/${req.resource}/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [req.field ?? 'statusOptionId']: picked }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      message.success('Status updated.');
      finish(true);
    } catch (e: any) {
      message.error('Update failed: ' + e.message);
      setSaving(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={!!req}
      title={title}
      onCancel={() => finish(false)}
      onOk={save}
      okText="Save"
      confirmLoading={saving}
      destroyOnHidden
    >
      <Select
        style={{ width: '100%', marginTop: 8 }}
        value={picked ?? undefined}
        placeholder="Select status..."
        onChange={(v) => setPicked(v)}
        options={options.map((o: any) => ({
          value: String(o.id),
          label: (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: pillColor(o.color).fg }} />
              {o.label}
            </span>
          ),
        }))}
      />
    </Modal>
  );
}
