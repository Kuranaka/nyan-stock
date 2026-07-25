import { parseCsv, splitList } from './csv.js';
import type { BlockingReviewDecisionInput } from './repository.js';
import { CatalogQualitySnapshot, QualityRow } from './types.js';

export const BLOCKING_REVIEW_COLUMNS = [
  'candidate_id',
  'decision',
  'reviewer',
  'review_note',
  'expected_issue_types',
  'pet_group',
  'target_species',
  'target_scope',
  'normalized_name',
  'brand',
  'category_id',
  'subcategory_id',
  'confidence',
  'issue_details',
  'suggested_actions',
  'source',
  'raw_title',
  'source_url',
  'image_url',
  'jan_code',
  'model_number',
] as const;

export type BlockingReviewCsvRow = Record<(typeof BLOCKING_REVIEW_COLUMNS)[number], string>;

export function buildBlockingReviewRows(
  snapshot: CatalogQualitySnapshot,
  options: { petGroup?: string; limit?: number } = {},
): BlockingReviewCsvRow[] {
  const candidates = new Map(snapshot.candidates.map((row) => [string(row, 'id'), row]));
  const listings = new Map(snapshot.listings.map((row) => [string(row, 'id'), row]));
  const issuesByCandidate = new Map<string, QualityRow[]>();
  for (const issue of snapshot.reviewQueue) {
    if (string(issue, 'disposition') !== 'blocking' || string(issue, 'status') !== 'open') continue;
    if (options.petGroup && string(issue, 'pet_group', 'petGroup') !== options.petGroup) continue;
    const candidateId = string(issue, 'candidate_id', 'candidateId');
    const group = issuesByCandidate.get(candidateId) ?? [];
    group.push(issue);
    issuesByCandidate.set(candidateId, group);
  }

  const rows = [...issuesByCandidate.entries()].map(([candidateId, issues]) => {
    const candidate = candidates.get(candidateId);
    if (!candidate) throw new Error(`Blocking review candidate is missing: ${candidateId}`);
    const rawListingId = string(candidate, 'raw_listing_id', 'rawListingId');
    const listing = listings.get(rawListingId);
    if (!listing) throw new Error(`Blocking review raw listing is missing: ${rawListingId}`);
    const sortedIssues = [...issues].sort((left, right) =>
      string(left, 'issue_type', 'issueType').localeCompare(string(right, 'issue_type', 'issueType')),
    );
    return {
      candidate_id: candidateId,
      decision: '',
      reviewer: '',
      review_note: '',
      expected_issue_types: sortedIssues.map((issue) => string(issue, 'issue_type', 'issueType')).join('|'),
      pet_group: string(candidate, 'pet_group', 'petGroup'),
      target_species: array(candidate, 'target_species', 'targetSpecies').join('|'),
      target_scope: string(candidate, 'target_scope', 'targetScope'),
      normalized_name: string(candidate, 'normalized_name', 'normalizedName'),
      brand: string(candidate, 'brand'),
      category_id: string(candidate, 'category_id', 'categoryId'),
      subcategory_id: string(candidate, 'subcategory_id', 'subcategoryId'),
      confidence: String(number(candidate, 'confidence')),
      issue_details: sortedIssues.map((issue) => string(issue, 'issue_detail', 'issueDetail')).join('\n'),
      suggested_actions: sortedIssues.map((issue) => string(issue, 'suggested_action', 'suggestedAction')).join('\n'),
      source: string(listing, 'source'),
      raw_title: string(listing, 'raw_title', 'rawTitle'),
      source_url: string(listing, 'item_url', 'itemUrl') || string(sortedIssues[0], 'source_url', 'sourceUrl'),
      image_url: string(listing, 'image_url', 'imageUrl'),
      jan_code: string(candidate, 'jan_code', 'janCode') || string(listing, 'jan_code', 'janCode'),
      model_number: string(candidate, 'model_number', 'modelNumber') || string(listing, 'model_number', 'modelNumber'),
    };
  });
  rows.sort((left, right) =>
    Number(left.confidence) - Number(right.confidence) || left.candidate_id.localeCompare(right.candidate_id),
  );
  return options.limit === undefined ? rows : rows.slice(0, options.limit);
}

export function blockingReviewRowsToCsv(rows: BlockingReviewCsvRow[]): string {
  return [
    BLOCKING_REVIEW_COLUMNS.join(','),
    ...rows.map((row) => BLOCKING_REVIEW_COLUMNS.map((column) => csvCell(row[column])).join(',')),
  ].join('\n') + '\n';
}

export function parseBlockingReviewDecisions(
  csvText: string,
  defaultReviewer?: string,
): BlockingReviewDecisionInput[] {
  const decisions: BlockingReviewDecisionInput[] = [];
  const seen = new Set<string>();
  for (const [index, row] of parseCsv(csvText).entries()) {
    const decision = row.decision?.trim().toLowerCase();
    if (!decision || decision === 'keep_open') continue;
    if (decision !== 'approve' && decision !== 'reject') {
      throw new Error(`Invalid decision at review CSV row ${index + 2}: ${row.decision}`);
    }
    const candidateId = row.candidate_id?.trim();
    if (!candidateId) throw new Error(`Missing candidate_id at review CSV row ${index + 2}.`);
    if (seen.has(candidateId)) throw new Error(`Duplicate candidate review decision: ${candidateId}`);
    const reviewer = row.reviewer?.trim() || defaultReviewer?.trim();
    if (!reviewer) throw new Error(`Missing reviewer for candidate ${candidateId}.`);
    const expectedIssueTypes = splitList(row.expected_issue_types).sort();
    if (expectedIssueTypes.length === 0) {
      throw new Error(`Missing expected_issue_types for candidate ${candidateId}. Export a fresh review CSV.`);
    }
    seen.add(candidateId);
    decisions.push({
      candidateId,
      decision,
      reviewer,
      resolutionNote: row.review_note?.trim() || undefined,
      expectedIssueTypes,
    });
  }
  return decisions;
}

export function validateBlockingReviewDecisions(
  decisions: BlockingReviewDecisionInput[],
  snapshot: CatalogQualitySnapshot,
): void {
  const currentRows = new Map(
    buildBlockingReviewRows(snapshot).map((row) => [row.candidate_id, splitList(row.expected_issue_types).sort()]),
  );
  for (const decision of decisions) {
    const current = currentRows.get(decision.candidateId);
    if (!current) {
      throw new Error(`Candidate ${decision.candidateId} no longer has open blocking issues. Export a fresh review CSV.`);
    }
    if (current.join('|') !== [...decision.expectedIssueTypes].sort().join('|')) {
      throw new Error(
        `Review is stale for candidate ${decision.candidateId}. ` +
          `expected=${decision.expectedIssueTypes.join('|')} current=${current.join('|')}`,
      );
    }
  }
}

function csvCell(value: string): string {
  const singleLineValue = value.replace(/\s*[\r\n\u2028\u2029]+\s*/g, ' / ');
  if (!/[",]/.test(singleLineValue)) return singleLineValue;
  return `"${singleLineValue.replace(/"/g, '""')}"`;
}

function string(row: QualityRow | undefined, snake: string, camel?: string): string {
  if (!row) return '';
  const value = row[snake] ?? (camel ? row[camel] : undefined);
  return value === null || value === undefined ? '' : String(value);
}

function array(row: QualityRow, snake: string, camel: string): string[] {
  const value = row[snake] ?? row[camel];
  return Array.isArray(value) ? value.map(String) : [];
}

function number(row: QualityRow, snake: string): number {
  const value = Number(row[snake]);
  return Number.isFinite(value) ? value : 0;
}
