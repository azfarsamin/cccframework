/**
 * Evidence-linked narrative boundaries. This catalog is optional metadata,
 * never used to establish whether a phrase occurs in a verse. Only checked
 * local verse IDs are added as context, not as direct occurrences.
 * Entries are declarative so new subjects can be added without changing the
 * query planner or retrieval algorithms.
 */
export const NARRATIVE_WINDOWS: Readonly<Record<string, readonly [number, number, number][]>> = {
  "Companions of the Wood (أصحاب الأيكة)": [[15, 78, 79], [26, 176, 191]],
  "Companions of the Cave (أصحاب الكهف)": [[18, 9, 26]],
  "Companions of the Town (أصحاب القرية)": [[36, 13, 32]],
};
