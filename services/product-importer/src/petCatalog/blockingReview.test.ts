import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blockingReviewRowsToCsv,
  buildBlockingReviewRows,
  parseBlockingReviewDecisions,
  validateBlockingReviewDecisions,
} from './blockingReview.js';
import { CatalogQualitySnapshot } from './types.js';

test('blocking review export groups open blocking issues by candidate', () => {
  const rows = buildBlockingReviewRows(snapshot());

  assert.equal(rows.length, 1);
  assert.equal(rows[0].candidate_id, 'candidate-1');
  assert.equal(rows[0].expected_issue_types, 'target_species_unknown|variant_merge_uncertain');
  assert.equal(rows[0].raw_title, '小動物用\nテストフード');
  const csv = blockingReviewRowsToCsv(rows);
  assert.match(csv, /対象種が不明 \/ 統合先が不明/);
  assert.match(csv, /小動物用 \/ テストフード/);
  assert.equal(csv.trimEnd().split('\n').length, 2);
});

test('blocking review decisions require reviewer and preserve issue fingerprint', () => {
  const csv = blockingReviewRowsToCsv(buildBlockingReviewRows(snapshot()))
    .replace('candidate-1,,', 'candidate-1,approve,');
  const decisions = parseBlockingReviewDecisions(csv, 'catalog-reviewer');

  assert.deepEqual(decisions, [{
    candidateId: 'candidate-1',
    decision: 'approve',
    reviewer: 'catalog-reviewer',
    resolutionNote: undefined,
    expectedIssueTypes: ['target_species_unknown', 'variant_merge_uncertain'],
  }]);
  assert.throws(() => parseBlockingReviewDecisions(csv), /Missing reviewer/);
});

test('blank and keep_open rows are not applied', () => {
  const exported = blockingReviewRowsToCsv(buildBlockingReviewRows(snapshot()));
  assert.deepEqual(parseBlockingReviewDecisions(exported, 'reviewer'), []);
  assert.deepEqual(
    parseBlockingReviewDecisions(exported.replace('candidate-1,,', 'candidate-1,keep_open,'), 'reviewer'),
    [],
  );
});

test('review apply detects stale or already resolved candidates before writing', () => {
  const decision = {
    candidateId: 'candidate-1',
    decision: 'approve' as const,
    reviewer: 'reviewer',
    expectedIssueTypes: ['target_species_unknown', 'variant_merge_uncertain'],
  };
  assert.doesNotThrow(() => validateBlockingReviewDecisions([decision], snapshot()));
  assert.throws(
    () => validateBlockingReviewDecisions([{ ...decision, expectedIssueTypes: ['target_species_unknown'] }], snapshot()),
    /Review is stale/,
  );
  assert.throws(
    () => validateBlockingReviewDecisions([{ ...decision, candidateId: 'candidate-missing' }], snapshot()),
    /no longer has open blocking issues/,
  );
});

function snapshot(): CatalogQualitySnapshot {
  return {
    listings: [{
      id: 'raw-1',
      source: 'rakuten_ichiba',
      raw_title: '小動物用\nテストフード',
      item_url: 'https://example.test/item',
    }],
    candidates: [{
      id: 'candidate-1',
      raw_listing_id: 'raw-1',
      normalized_name: '小動物用テストフード',
      pet_group: 'small_animal',
      target_species: [],
      target_scope: 'unconfirmed',
      confidence: 0.7,
    }],
    products: [],
    variants: [],
    identityKeys: [],
    productListings: [],
    reviewQueue: [
      {
        candidate_id: 'candidate-1',
        pet_group: 'small_animal',
        issue_type: 'variant_merge_uncertain',
        issue_detail: '統合先が不明',
        suggested_action: '商品名を確認',
        disposition: 'blocking',
        status: 'open',
      },
      {
        candidate_id: 'candidate-1',
        pet_group: 'small_animal',
        issue_type: 'target_species_unknown',
        issue_detail: '対象種が不明',
        suggested_action: '公式情報を確認',
        disposition: 'blocking',
        status: 'open',
      },
      {
        candidate_id: 'candidate-1',
        pet_group: 'small_animal',
        issue_type: 'package_data_suspicious',
        issue_detail: '容量不明',
        suggested_action: '容量確認',
        disposition: 'non_blocking',
        status: 'resolved',
      },
    ],
  };
}
