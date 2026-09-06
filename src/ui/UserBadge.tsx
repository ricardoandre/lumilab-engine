// Circular-initial avatar + first-name label for person-relation fields
// (owner, reviewedBy, ...) — matches the approved "Ledger" mockup, which
// shows "F  Firman" rather than the full stored nickname/team suffix.
function firstNameOf(name: string): string {
  return name.split(' (')[0].trim().split(' ')[0] || name;
}

export function UserBadge({ name }: { name: string }) {
  const first = firstNameOf(name);
  const initial = first.charAt(0).toUpperCase();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#dce3ec',
          color: '#26344b',
          fontSize: 11,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {initial}
      </span>
      {first}
    </span>
  );
}
