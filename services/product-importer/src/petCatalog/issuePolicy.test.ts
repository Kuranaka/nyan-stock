import assert from 'node:assert/strict';
import test from 'node:test';

import { applyReviewIssuePolicy } from './issuePolicy.js';
import { ProductCandidate, ReviewIssue, ReviewIssueType } from './types.js';

test('non-ingestible group-wide supplies accept unknown target species', () => {
  const candidate = applyReviewIssuePolicy(makeCandidate('target_species_unknown', {
    petGroup: 'dog',
    categoryId: 'shampoo',
    subcategoryId: 'shampoo',
  }));

  assert.equal(candidate.issues[0].disposition, 'non_blocking');
  assert.equal(candidate.targetScope, 'group_wide');
  assert.equal(candidate.status, 'merge_ready');
});

test('small-animal target species stays blocking while bird sub-classification is non-blocking', () => {
  const smallAnimal = applyReviewIssuePolicy(makeCandidate('target_species_unknown', {
    petGroup: 'small_animal',
    categoryId: 'small_mammal_food',
    subcategoryId: 'small_mammal_food',
  }));
  const birdFood = applyReviewIssuePolicy(makeCandidate('bird_species_unknown', {
    petGroup: 'bird',
    categoryId: 'bird_food',
    subcategoryId: 'bird_seed_food',
  }));

  assert.equal(smallAnimal.issues[0].disposition, 'blocking');
  assert.equal(smallAnimal.status, 'review_required');
  assert.equal(birdFood.issues[0].disposition, 'non_blocking');
  assert.equal(birdFood.targetScope, 'group_wide');
  assert.equal(birdFood.status, 'merge_ready');
});

test('bird bath and generic aquarium filter unknowns are non-blocking', () => {
  const birdBath = applyReviewIssuePolicy(makeCandidate('bird_species_unknown', {
    petGroup: 'bird',
    categoryId: 'bath',
    subcategoryId: 'bath',
  }));
  const filter = applyReviewIssuePolicy(makeCandidate('freshwater_or_marine_unknown', {
    petGroup: 'aquarium',
    categoryId: 'filter_media',
    subcategoryId: 'filter_media',
  }));

  assert.equal(birdBath.issues[0].disposition, 'non_blocking');
  assert.equal(filter.issues[0].disposition, 'non_blocking');
});

test('group-level categories remain merge-ready when all internal classifications are unknown', () => {
  const bird = applyReviewIssuePolicy({
    ...makeCandidate('target_species_unknown', { petGroup: 'bird' }),
    issues: [
      makeIssue('target_species_unknown'),
      makeIssue('bird_species_unknown'),
    ],
  });
  const aquarium = applyReviewIssuePolicy({
    ...makeCandidate('target_species_unknown', { petGroup: 'aquarium' }),
    issues: [
      makeIssue('target_species_unknown'),
      makeIssue('freshwater_or_marine_unknown'),
    ],
  });
  const reptile = applyReviewIssuePolicy({
    ...makeCandidate('target_species_unknown', { petGroup: 'reptile_amphibian' }),
    issues: [
      makeIssue('target_species_unknown'),
      makeIssue('feeding_type_unknown'),
    ],
  });

  for (const candidate of [bird, aquarium, reptile]) {
    assert.ok(candidate.issues.every((issue) => issue.disposition === 'non_blocking'));
    assert.equal(candidate.targetScope, 'group_wide');
    assert.equal(candidate.status, 'merge_ready');
  }
});

test('fish habitat and reptile diet unknowns are non-blocking while wrong search results are rejected', () => {
  const medicine = applyReviewIssuePolicy(makeCandidate('freshwater_or_marine_unknown', {
    petGroup: 'aquarium',
    categoryId: 'fish_medicine',
    subcategoryId: 'fish_medicine',
  }));
  const reptileDiet = applyReviewIssuePolicy(makeCandidate('feeding_type_unknown', {
    petGroup: 'reptile_amphibian',
    categoryId: 'reptile_food',
    subcategoryId: 'reptile_food',
  }));
  const reptileSpecies = applyReviewIssuePolicy(makeCandidate('target_species_unknown', {
    petGroup: 'reptile_amphibian',
    categoryId: 'reptile_food',
    subcategoryId: 'reptile_food',
  }));
  const wrongResult = applyReviewIssuePolicy(makeCandidate('possible_wrong_search_result'));

  assert.equal(medicine.issues[0].disposition, 'non_blocking');
  assert.equal(medicine.status, 'merge_ready');
  assert.equal(reptileDiet.issues[0].disposition, 'non_blocking');
  assert.equal(reptileDiet.status, 'merge_ready');
  assert.equal(reptileSpecies.issues[0].disposition, 'non_blocking');
  assert.equal(reptileSpecies.targetScope, 'group_wide');
  assert.equal(reptileSpecies.status, 'merge_ready');
  assert.equal(wrongResult.issues[0].disposition, 'reject');
  assert.equal(wrongResult.status, 'rejected');
});

test('suspicious package data is retained as a non-blocking audit issue', () => {
  const candidate = applyReviewIssuePolicy(makeCandidate('package_data_suspicious', {
    petGroup: 'rabbit',
    targetSpecies: ['rabbit'],
    targetScope: 'species_specific',
  }));

  assert.equal(candidate.issues[0].disposition, 'non_blocking');
  assert.equal(candidate.status, 'merge_ready');
});

test('unknown insect life stage is automatically accepted as an optional attribute', () => {
  const candidate = applyReviewIssuePolicy(makeCandidate('life_stage_unknown', {
    petGroup: 'insect',
    categoryId: 'kinshi_bottle',
    subcategoryId: 'kinshi_bottle',
    targetSpecies: ['stag_beetle'],
    targetScope: 'species_specific',
    mergeConfidence: 0.85,
  }));

  assert.equal(candidate.issues[0].disposition, 'non_blocking');
  assert.equal(candidate.status, 'merge_ready');
});

test('ambiguous pet groups are rejected because the current master requires one pet group', () => {
  for (const issueType of ['multiple_pet_groups_detected', 'rabbit_or_small_animal_unclear'] as const) {
    const candidate = applyReviewIssuePolicy(makeCandidate(issueType, {
      petGroup: undefined,
      mergeConfidence: 0.85,
    }));
    assert.equal(candidate.issues[0].disposition, 'reject');
    assert.equal(candidate.status, 'rejected');
  }
});

test('low-confidence or unclassified merge candidates are rejected below the reviewable boundary', () => {
  const lowConfidence = applyReviewIssuePolicy(makeCandidate('variant_merge_uncertain', {
    mergeConfidence: 0.75,
  }));
  const boundary = applyReviewIssuePolicy(makeCandidate('variant_merge_uncertain', {
    mergeConfidence: 0.8,
  }));
  const missingPetGroup = applyReviewIssuePolicy(makeCandidate('target_species_unknown', {
    petGroup: undefined,
    mergeConfidence: 0.85,
  }));

  assert.equal(lowConfidence.issues[0].disposition, 'reject');
  assert.equal(lowConfidence.status, 'rejected');
  assert.equal(boundary.issues[0].disposition, 'blocking');
  assert.equal(boundary.status, 'review_required');
  assert.equal(missingPetGroup.issues[0].disposition, 'reject');
  assert.equal(missingPetGroup.status, 'rejected');
});

function makeCandidate(issueType: ReviewIssueType, overrides: Partial<ProductCandidate> = {}): ProductCandidate {
  const issue = makeIssue(issueType);
  return {
    id: 'candidate-test',
    rawListingId: 'raw-test',
    sourceLocale: 'ja-JP',
    normalizedName: 'テスト商品名',
    baseProductName: 'テスト商品名',
    petGroup: 'dog',
    targetSpecies: [],
    targetScope: 'unconfirmed',
    categoryId: 'shampoo',
    subcategoryId: 'shampoo',
    canonicalKey: 'test::canonical',
    classificationEvidence: {
      petGroup: [],
      targetSpecies: [],
      targetSpeciesGroup: [],
      searchContext: { queryId: 'query-test', petGroup: 'dog' },
      notes: [],
    },
    classificationConfidence: 0.9,
    mergeConfidence: 0.9,
    confidence: 0.9,
    status: 'review_required',
    issues: [issue],
    ...overrides,
  };
}

function makeIssue(issueType: ReviewIssueType): ReviewIssue {
  return {
    issueType,
    issueDetail: 'test issue',
    suggestedAction: 'test action',
  };
}
