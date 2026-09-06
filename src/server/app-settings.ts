// Server-side read/write for the registered admin settings (see
// app-settings-registry.ts for the list and the invariants). Kept out of the
// registry itself because that module is imported by the client page and this
// one touches Prisma.
import { prisma } from '../runtime';
import {
  ALL_KNOBS, SETTINGS_SECTIONS, groupOfKey, knobByKey, validateKnobValue, valueTypeOf,
} from './app-settings-registry';

// Current value of every registered knob, falling back to the registry default
// for rows that were never saved.
export async function loadRegisteredSettings(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: ALL_KNOBS.map((k) => k.key) } } });
  // See the note in acl.ts: the injected client is structurally typed.
  const byKey = new Map((rows as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const out: Record<string, string> = {};
  ALL_KNOBS.forEach((k) => { out[k.key] = byKey.get(k.key) ?? k.fallback; });
  return out;
}

export async function loadSettingsUpdatedAt(): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ALL_KNOBS.map((k) => k.key) } },
    select: { key: true, updatedAt: true },
  });
  const out: Record<string, string> = {};
  (rows as { key: string; updatedAt: Date }[]).forEach((r) => { out[r.key] = r.updatedAt.toISOString(); });
  return out;
}

export class SettingsValidationError extends Error {}

// A patch, not a whole object: only the keys the admin actually changed are
// sent. Unregistered keys are refused outright rather than silently dropped —
// a typo'd key would otherwise look like a successful save.
export async function saveRegisteredSettings(patch: Record<string, string>): Promise<Record<string, string>> {
  const next: Record<string, string> = {};

  for (const [key, raw] of Object.entries(patch)) {
    const knob = knobByKey(key);
    if (!knob) throw new SettingsValidationError(`"${key}" is not an editable setting`);
    if (knob.equals) continue; // derived — never taken from the client
    const value = String(raw ?? '').trim();
    const err = validateKnobValue(knob, value);
    if (err) throw new SettingsValidationError(`${knob.label}: ${err}`);
    // Per-type, NOT "numberMap or else a number". Every knob used to be numeric,
    // so the else-branch quietly ran parseFloat over anything new: a userList
    // arrived as "[2,39]" and was stored as the string "NaN", so Andre's chosen
    // approvers vanished on save (2026-08-28). A type added to the registry has
    // to be added here too, which is why this is now a switch that names them.
    switch (knob.type) {
      case 'numberMap':
      case 'userList':
        next[key] = JSON.stringify(JSON.parse(value));
        break;
      default:
        next[key] = String(parseFloat(value));
    }
  }
  if (!Object.keys(next).length) throw new SettingsValidationError('No valid values to save');

  // Derived knobs follow their source. Applied AFTER the loop so it does not
  // matter whether the source was in this patch or already stored — either way
  // the pair cannot end up out of step.
  const stored = await loadRegisteredSettings();
  for (const knob of ALL_KNOBS) {
    if (!knob.equals) continue;
    const source = next[knob.equals] ?? stored[knob.equals];
    if (source != null && source !== (next[knob.key] ?? stored[knob.key])) next[knob.key] = source;
  }

  for (const [key, value] of Object.entries(next)) {
    const knob = knobByKey(key)!;
    const group = groupOfKey(key)!;
    const sortOrder = SETTINGS_SECTIONS.find((s) => s.group === group)!.knobs.findIndex((k) => k.key === key);
    await prisma.appSetting.upsert({
      where: { key },
      create: { group, key, label: knob.label, valueType: valueTypeOf(knob), value, sortOrder },
      update: { value, label: knob.label },
    });
  }

  return loadRegisteredSettings();
}
