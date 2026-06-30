// Single source of truth for turning raw device-name strings into clean,
// citizen-/operator-facing location labels.
//
// Mirrors backend/handlers/device_location.go:cleanLocationName so a
// camera renders the same way in the dashboard, PDF reports, challan
// templates, and WhatsApp captions.
//
// Handles the noisy mix of names actually present in the DB:
//   "KHANAPUR_JAMBOTTI_CROSS_CAMERA_3"  -> "Khanapur Jambotti Cross"
//   "KATKOL_K_CHANARGI_CAM1"            -> "Katkol K Chanargi"
//   "Camera KATKOL_K_CHANARGI_CAM1"     -> "Katkol K Chanargi"
//   "Katkol K Chanargi Camera 2"        -> "Katkol K Chanargi"
//   "SANKESHWAR - KAMATNURU GATE_CAMERA_1" -> "Sankeshwar - Kamatnuru Gate"
//
// Acronyms ≤3 chars (MK, OP, BCP) are preserved instead of being
// title-cased into "Mk", "Op", "Bcp".
export function cleanDeviceName(raw: string | null | undefined): string {
  let s = (raw || '')
    .replace(/^Camera[\s_\-]+/i, '')
    .replace(/[\s_\-]*CAM(?:ERA)?[\s_\-]*\d+\s*$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stripped = s.replace(/\s+\d{1,2}$/, '').trim();
  if (stripped.split(' ').filter(Boolean).length >= 2) s = stripped;

  return s
    .split(' ')
    .filter(Boolean)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase() && w !== w.toLowerCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(' ');
}
