import { ProductCandidate, ReviewIssue, ReviewIssueDisposition } from './types.js';

const ingestiblePattern = /food|pellet|treat|milk|supplement|vitamin|calcium|seed|formula|mineral|grit|cuttlebone|hay|timothy|alfalfa|jelly|honey|餌|飼料|療法/;
const medicalPattern = /medicine|therapeutic|flea_tick|medicated|薬|療法/;
const groupLevelClassificationPetGroups = new Set(['bird', 'aquarium', 'reptile_amphibian']);
const minimumHumanReviewMergeConfidence = 0.8;

export function applyReviewIssuePolicy(candidate: ProductCandidate): ProductCandidate {
  const issues = candidate.issues.map((issue) => evaluateReviewIssue(candidate, issue));
  const hasReject = issues.some((issue) => issue.disposition === 'reject');
  const hasBlocking = issues.some((issue) => issue.disposition === 'blocking');
  const canUseGroupWide =
    candidate.petGroup !== undefined &&
    candidate.targetSpecies.length === 0 &&
    !issues.some((issue) =>
      ['target_species_unknown', 'small_animal_scope_unclear', 'bird_species_unknown'].includes(issue.issueType) &&
      issue.disposition === 'blocking',
    );
  const targetScope = canUseGroupWide ? 'group_wide' : candidate.targetScope;
  const structurallyMergeable =
    candidate.petGroup !== undefined &&
    targetScope !== 'unconfirmed' &&
    candidate.mergeConfidence >= 0.85;
  const status = hasReject
    ? 'rejected'
    : hasBlocking || !structurallyMergeable
      ? 'review_required'
      : 'merge_ready';
  return { ...candidate, targetScope, issues, status };
}

export function evaluateReviewIssue(candidate: ProductCandidate, issue: ReviewIssue): ReviewIssue {
  const { disposition, reason } = dispositionFor(candidate, issue);
  return { ...issue, disposition, policyReason: reason };
}

function dispositionFor(
  candidate: ProductCandidate,
  issue: ReviewIssue,
): { disposition: ReviewIssueDisposition; reason: string } {
  const classification = `${candidate.categoryId ?? ''}|${candidate.subcategoryId ?? ''}`;
  switch (issue.issueType) {
    case 'possible_wrong_search_result':
      return rule('reject', '除外語または検索対象と異なるpet_groupを検出したため、自動除外対象。');
    case 'multiple_pet_groups_detected':
    case 'rabbit_or_small_animal_unclear':
      return rule('reject', '現行マスタではpet_groupを一意に確定できない候補を安全に表現できないため、自動除外対象。');
    case 'small_animal_scope_unclear':
    case 'possible_duplicate':
      return rule('blocking', '対象生体または統合先を誤る影響が大きいため、人手確認が必要。');
    case 'feeding_type_unknown':
      return rule('non_blocking', '爬虫類・両生類カテゴリ内の食性分類は任意属性としてnullを許容。');
    case 'target_species_unknown':
      if (!candidate.petGroup) {
        return rule('reject', 'pet_groupと対象種をどちらも確定できず、現行マスタへ安全に分類できないため、自動除外対象。');
      }
      if (candidate.petGroup === 'small_animal') {
        return rule('blocking', '小動物用品は種別による適否差が大きいため、具体的な対象種が必要。');
      }
      if (candidate.petGroup && groupLevelClassificationPetGroups.has(candidate.petGroup)) {
        return rule('non_blocking', `${candidate.petGroup}カテゴリ内の対象種分類は任意属性としてnullを許容。`);
      }
      if (ingestiblePattern.test(classification) || medicalPattern.test(classification)) {
        return rule('blocking', '摂取物・薬剤・療法関連は対象種不明のまま採用しない。');
      }
      return rule('non_blocking', '非摂取の汎用品としてpet_group単位で扱い、対象種はnullのまま許容。');
    case 'bird_species_unknown':
      return rule('non_blocking', '鳥類カテゴリ内の鳥種・体格分類は任意属性としてnullを許容。');
    case 'freshwater_or_marine_unknown':
      return rule('non_blocking', '観賞魚カテゴリ内の淡水・海水分類は任意属性としてhabitat_type未確定を許容。');
    case 'life_stage_unknown':
      return rule('non_blocking', 'life_stageは任意属性として未確定を許容し、商品分類と統合を妨げない。');
    case 'package_data_suspicious':
      return rule('non_blocking', '容量・入数は販売listing側の属性であり、プロダクト同一性を阻害しない。');
    case 'initial_review_required':
      return rule('non_blocking', '工程分離後はmergeコマンド自体が明示的な統合操作になるため自動解消可能。');
    case 'variant_merge_uncertain':
      if (!candidate.petGroup) {
        return rule('reject', 'pet_groupを確定できず、現行マスタへ安全に分類できないため、自動除外対象。');
      }
      if (candidate.mergeConfidence < minimumHumanReviewMergeConfidence) {
        return rule(
          'reject',
          `統合confidenceが人手レビュー下限${minimumHumanReviewMergeConfidence.toFixed(2)}未満のため、自動除外対象。`,
        );
      }
      if (candidate.mergeConfidence >= 0.85 && candidate.petGroup && candidate.baseProductName.length >= 5) {
        return rule('non_blocking', '基本商品名・pet_group・統合confidenceが最低基準を満たすため許容。');
      }
      return rule('blocking', '商品同一性の確度が不足しており、別商品統合を防ぐため確認が必要。');
  }
}

function rule(disposition: ReviewIssueDisposition, reason: string): {
  disposition: ReviewIssueDisposition;
  reason: string;
} {
  return { disposition, reason };
}
