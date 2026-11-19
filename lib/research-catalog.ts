/** Canonical source identities; optimized search and complete-text stores remain independent. */
import catalogJson from "../research/index/catalog.json";

export type ResearchCatalogEntry = (typeof catalogJson.publications)[number];
const publications = catalogJson.publications;
const byId = new Map(publications.map((source) => [source.id, source]));

if (publications.length !== catalogJson.publication_count || byId.size !== publications.length) {
  throw new Error("Invalid canonical research catalog: missing or duplicate source IDs");
}

export function listResearchSources(): readonly ResearchCatalogEntry[] {
  return publications;
}

export function findResearchSource(id: string): ResearchCatalogEntry | null {
  return byId.get(id) ?? null;
}

export function assertResearchCatalogCoverage(ids: Iterable<string>): void {
  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`Research source missing from canonical catalog: ${id}`);
  }
}
