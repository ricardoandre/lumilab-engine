// The registry of ADMIN-EDITABLE app settings — the knobs that show on
// Admin › Settings, in the order they show.
//
// AppSetting also stores machine state (task_schedule.last_run_date, OAuth
// bookkeeping written by the TikTok callback). Those must never appear on a
// settings screen, which is why this page is driven by an explicit list rather
// than by "every row in app_setting". A key that is not registered here cannot
// be read or written through /api/app-settings.
//
// Shared by the page and the API route on purpose: the labels, the defaults and
// the invariants below are the same on both sides, so they cannot drift.

export type KnobType = 'number' | 'percent' | 'numberMap' | 'userList';

export interface Knob {
  key: string;
  label: string;
  help?: string;
  type: KnobType;
  /** Used when the row has never been saved — must match the fallback in the
   *  code that reads the setting, or the screen lies about what is in force. */
  fallback: string;
  /** Forced equal to another knob's value on save (server-enforced). Rendered
   *  read-only, since editing it would be a lie. */
  equals?: string;
  /** Refilled on the client, keeping its ratio to another knob, when that knob
   *  changes. Still free to edit by hand afterwards. */
  followsRatio?: string;
  /** numberMap only: the sub-keys to show when nothing is stored yet. NOT a
   *  closed set — the page renders the union of these and whatever keys the
   *  stored value actually has, because the code that consumes the map reads
   *  whatever keys are there (getSewingByDifficulty in the sample pricing
   *  route). Sandbox already carries a 5th difficulty level that prod does
   *  not; a fixed list here would have hidden it and left it uneditable. */
  mapKeys?: { key: string; label: string }[];
  suffix?: string;
  step?: number;
}

export interface SettingsSection {
  /** AppSetting.group written for every knob in the section. */
  group: string;
  title: string;
  /** Always "Used by <where these are read>." and nothing more — the standard
   *  second line of every section (Andre, 2026-08-24: the page was explaining
   *  itself at length instead of just saying where a number lands). Rationale
   *  for a knob belongs in its own `help`, or in a code comment, not here. */
  usedBy: string;
  knobs: Knob[];
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    group: 'shopee_ads',
    title: 'Shopee Ads policy',
    usedBy: 'Used by Shopee Ads → Tier Review.',
    knobs: [
      {
        key: 'shopee.blend_target_roas',
        label: 'Blend target ROAS',
        help: 'The ceiling ROAS target to be reached.',
        type: 'number',
        fallback: '10',
        step: 0.5,
      },
      {
        key: 'shopee.at_capacity_roas',
        label: 'At capacity — hold from',
        help: 'Between this and the target a listing is absorbing every rupiah it can at the price you are willing to pay. Hold the budget.',
        type: 'number',
        fallback: '8.5',
        followsRatio: 'shopee.blend_target_roas',
        step: 0.5,
      },
      {
        key: 'shopee.scale_gentle_roas',
        label: 'Room to scale ~20% from',
        help: 'Earning better than plan — the last rupiah still came back above target, so you bought too little. Always equal to the blend target: set below it, the review would tell you to add budget to listings that are already overspending.',
        type: 'number',
        fallback: '10',
        equals: 'shopee.blend_target_roas',
        step: 0.5,
      },
      {
        key: 'shopee.scale_hard_roas',
        label: 'Raise budget hard from',
        help: 'Far enough above plan to move in one step instead of creeping at it.',
        type: 'number',
        fallback: '14',
        followsRatio: 'shopee.blend_target_roas',
        step: 0.5,
      },
    ],
  },
  {
    group: 'pricing',
    title: 'Pricing',
    usedBy: 'Used by Sample Pricing and the pricing estimator.',
    // Hangtag cost is deliberately NOT here. It is per-brand, not global: the
    // per-garment cost is the price of the material coded `Hangtag_<brandcode>`
    // (material_details.price_per_yard, falling back to
    // raw_material.price_per_unit) — see hangtagForBrandId in
    // pricing-estimate-data.ts and the same resolution in the sample pricing
    // route. An orphan `pricing.hangtag_cost` row exists in app_setting with
    // value 0 and NOTHING reads it; it was on this page for one afternoon by
    // mistake (Andre, 2026-08-24: "remove hangtag cost, it should be retrieved
    // from material_details price"). Do not re-add it.
    knobs: [
      {
        key: 'pricing.ppn_rate',
        label: 'PPN rate',
        type: 'percent',
        fallback: '0.11',
        suffix: '%',
        step: 0.5,
      },
      {
        key: 'pricing.sewing_by_difficulty',
        label: 'Sewing cost by difficulty',
        help: 'The default sewing cost a pricing starts from, per difficulty level.',
        type: 'numberMap',
        fallback: '{"1":10000,"2":20000,"3":35000,"4":50000}',
        mapKeys: [
          { key: '1', label: 'Level 1' },
          { key: '2', label: 'Level 2' },
          { key: '3', label: 'Level 3' },
          { key: '4', label: 'Level 4' },
        ],
      },
    ],
  },
  {
    group: 'approval',
    title: 'Approval',
    usedBy: 'Used by the Approve action on Patterns and Products.',
    knobs: [
      {
        // Andre, 2026-08-28: "app setting -> list of pattern approval -> any on
        // those list able to approve (1 approval required) no need role then".
        // Deliberately NOT a role: the people who may sign off a pola are a
        // named handful, and he wanted to edit the list itself rather than
        // maintain a role's membership to change it.
        key: 'approval.pattern.approvers',
        label: 'Who can approve a pattern',
        help: 'Anyone on this list can approve. One approval completes a pattern.',
        type: 'userList',
        fallback: '[]',
      },
      {
        // A SEPARATE list from the pattern one on purpose: signing off a pola
        // and signing off a finished product are different jobs, usually done
        // by different people. An empty list falls back to admins, so the
        // feature can never be locked out by an unset setting.
        key: 'approval.product.approvers',
        label: 'Who can approve a product',
        help: 'Anyone on this list can approve. One approval completes a product.',
        type: 'userList',
        fallback: '[]',
      },
    ],
  },
  {
    // The rest of the CAPABILITIES (see lib/capabilities.ts) — the same named
    // list the two approvals above already used, for the other permissions that
    // are not "may you edit this table".
    //
    // Andre, 2026-08-29: "move the acl into the settings and solve it separately
    // so it doesnt disrupt general acl logic... I can add who can access the
    // functionality there". Sample pricing used to be the `sample_pricing` ROLE;
    // its list is seeded with the people who held that role, so the move changes
    // nobody's access.
    group: 'access',
    title: 'Who can use what',
    usedBy: 'Each list decides who sees a feature. Empty means admins only.',
    knobs: [
      {
        key: 'access.sample.pricing',
        label: 'Who can see sample pricing',
        help: 'Cost, margin and the pricing simulation on a Sample.',
        type: 'userList',
        fallback: '[]',
      },
      {
        key: 'access.material.pricing',
        label: 'Who can see material prices',
        help: 'Buying prices on Raw Material, Fabric and Material Details.',
        type: 'userList',
        fallback: '[]',
      },
      {
        key: 'access.material.suppliers',
        label: 'Who can see material suppliers',
        help: 'Supplier names on Raw Material, Fabric, Material Details and Material In/Out. Empty = admins only.',
        type: 'userList',
        fallback: '[]',
      },
      // One list per brand, keyed by brand CODE (see lib/product-naming.ts).
      // Replaces Brand.namingUserId, which was a single person and doubled as
      // the permission. A NEW BRAND needs a line here — with two brands that
      // have not changed in the life of this app, two entries beat a dynamic
      // settings registry; a brand with no list simply has no namers.
      {
        key: 'access.product.naming.askalabel',
        label: 'Who can name Aska Label products',
        help: 'Their naming queue, the pending-naming banner and the My Naming Tasks widget all follow this list.',
        type: 'userList',
        fallback: '[]',
      },
      {
        key: 'access.product.naming.inkano',
        label: 'Who can name In Kano products',
        help: 'Their naming queue, the pending-naming banner and the My Naming Tasks widget all follow this list.',
        type: 'userList',
        fallback: '[]',
      },
    ],
  },
];

export const ALL_KNOBS: Knob[] = SETTINGS_SECTIONS.flatMap((s) => s.knobs);

export function knobByKey(key: string): Knob | undefined {
  return ALL_KNOBS.find((k) => k.key === key);
}

export function groupOfKey(key: string): string | undefined {
  return SETTINGS_SECTIONS.find((s) => s.knobs.some((k) => k.key === key))?.group;
}

// A knob's value is always a string in the DB (AppSetting.value is TEXT).
// Validation lives here so the route and the page agree on what "valid" means:
// the page can disable Save, and the route still refuses a bad body.
export function validateKnobValue(knob: Knob, value: string): string | null {
  if (knob.type === 'userList') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return 'Not valid JSON';
    }
    if (!Array.isArray(parsed)) return 'Expected a list of people';
    for (const v of parsed) {
      if (!/^\d+$/.test(String(v))) return 'Expected user ids';
    }
    return null;
  }
  if (knob.type === 'numberMap') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return 'Not valid JSON';
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'Expected an object of numbers';
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!isFinite(n) || n < 0) return `"${k}" is not a number`;
    }
    return null;
  }
  const n = parseFloat(value);
  if (!isFinite(n)) return 'Not a number';
  if (n < 0) return 'Cannot be negative';
  if (knob.type === 'number' && n === 0) return 'Must be greater than zero';
  if (knob.type === 'percent' && n > 1) return 'Expected a rate between 0 and 1';
  return null;
}

// The value type recorded on the AppSetting row.
export function valueTypeOf(knob: Knob): string {
  return knob.type === 'numberMap' || knob.type === 'userList' ? 'json' : 'number';
}
