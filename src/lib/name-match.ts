/**
 * Matching partner labels from CSV files to the affiliates / lead sources
 * already in the system. Files spell the same partner in many ways —
 * "AmazeSec", "Amaze Sec", "Amaze-Media Ltd" — but must all land on "Amaze".
 *
 * Every step requires a unique hit, so an ambiguous label (e.g. "FTDhub" with
 * both "FTDhub-FLAT" and "FTDhubCRG" in the system) stays unmatched rather
 * than being guessed wrong.
 */

export type NamedRecord = { id: string; name: string };

/** Lowercase, drop everything that isn't a letter or a digit. */
export const normLabel = (s: string | null | undefined) =>
  String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/** Marketing noise that partners bolt onto their name in exports. */
const NOISE = ["sec", "media", "leads", "lead", "ltd", "llc", "inc", "group", "crg", "flat", "traffic", "marketing", "digital"];

const stripNoise = (s: string) => {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of NOISE) {
      if (out.length > n.length + 2 && out.endsWith(n)) { out = out.slice(0, -n.length); changed = true; }
    }
  }
  return out;
};

const unique = <T,>(list: T[]) => (list.length === 1 ? list[0] : null);

/** Resolve a raw label to one record id, or null when unsure. */
export function matchName(raw: string | null | undefined, list: NamedRecord[] | undefined): string | null {
  const name = normLabel(raw);
  if (!name || !list?.length) return null;
  const entries = list.map((item) => ({ id: item.id, norm: normLabel(item.name) })).filter((e) => e.norm);

  const exact = entries.find((e) => e.norm === name);
  if (exact) return exact.id;

  // "AmazeSec" -> "Amaze" / "Amaze" -> "AmazeSec"
  const prefix = unique(entries.filter((e) => e.norm.length >= 4 && (name.startsWith(e.norm) || e.norm.startsWith(name))));
  if (prefix) return prefix.id;

  // Same after dropping trailing noise words on both sides.
  const bare = stripNoise(name);
  if (bare.length >= 3) {
    const byBare = unique(entries.filter((e) => stripNoise(e.norm) === bare));
    if (byBare) return byBare.id;
  }

  // Last resort: one record whose name is contained in the label (or vice versa).
  const contained = unique(entries.filter((e) => e.norm.length >= 4 && (name.includes(e.norm) || e.norm.includes(name))));
  return contained ? contained.id : null;
}
