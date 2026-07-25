import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { config } from '../config.js';
import {
  blockingReviewRowsToCsv,
  buildBlockingReviewRows,
  parseBlockingReviewDecisions,
  validateBlockingReviewDecisions,
} from '../petCatalog/blockingReview.js';
import { openPetCatalogRepository } from '../petCatalog/repository.js';

const defaultReviewPath = path.join(
  config.repositoryRoot,
  'services/product-importer/data/generated/petCatalog.blocking-review.csv',
);

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'export' && command !== 'apply') {
    throw new Error('Usage: review:pet-catalog -- export|apply [options]');
  }
  const repository = await openPetCatalogRepository();
  if (!repository) throw new Error('DATABASE_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY is required.');
  try {
    if (command === 'export') {
      const outputPath = path.resolve(readOption(args, '--out=') ?? defaultReviewPath);
      const limitText = readOption(args, '--limit=');
      const limit = limitText === undefined ? undefined : positiveInteger(limitText, '--limit');
      const snapshot = await repository.loadBlockingReviewSnapshot({
        petGroup: readOption(args, '--pet-group='),
      });
      const rows = buildBlockingReviewRows(snapshot, {
        limit,
      });
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, blockingReviewRowsToCsv(rows), 'utf8');
      console.log(`[pet-catalog:review] exported=${rows.length} file=${outputPath}`);
      return;
    }

    const filePath = path.resolve(readOption(args, '--file=') ?? defaultReviewPath);
    const dryRun = args.includes('--dry-run');
    const reviewer = readOption(args, '--reviewer=');
    const decisions = parseBlockingReviewDecisions(await readFile(filePath, 'utf8'), reviewer);
    if (decisions.length === 0) {
      console.log(`[pet-catalog:review] decisions=0 dryRun=${dryRun} file=${filePath}`);
      return;
    }
    validateBlockingReviewDecisions(
      decisions,
      await repository.loadBlockingReviewSnapshot({
        candidateIds: decisions.map((decision) => decision.candidateId),
      }),
    );
    if (!dryRun) {
      for (const decision of decisions) await repository.reviewBlockingCandidate(decision);
    }
    const approved = decisions.filter((decision) => decision.decision === 'approve').length;
    const rejected = decisions.length - approved;
    console.log(
      `[pet-catalog:review] decisions=${decisions.length} approved=${approved} rejected=${rejected} ` +
        `dryRun=${dryRun} file=${filePath}`,
    );
  } finally {
    await repository.close();
  }
}

function readOption(args: string[], prefix: string): string | undefined {
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} must be a positive integer.`);
  return parsed;
}

void main().catch((error) => {
  console.error('[pet-catalog:review] failed:', error);
  process.exitCode = 1;
});
