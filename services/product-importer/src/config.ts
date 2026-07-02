import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  rakutenApplicationId: process.env.RAKUTEN_APPLICATION_ID,
  yahooClientId: process.env.YAHOO_CLIENT_ID,
  databaseUrl: process.env.DATABASE_URL,
  amazonAccessKey: process.env.AMAZON_ACCESS_KEY,
  amazonSecretKey: process.env.AMAZON_SECRET_KEY,
  amazonAssociateTag: process.env.AMAZON_ASSOCIATE_TAG,
  gs1ApiKey: process.env.GS1_API_KEY,
  requestDelayMs: Number(process.env.PRODUCT_IMPORT_REQUEST_DELAY_MS ?? 700),
  outputJsonPath:
    process.env.PRODUCT_MASTER_OUTPUT_PATH ??
    path.join(serviceDir, 'data', 'generated', 'productMaster.generated.json'),
};

export function delay(ms = config.requestDelayMs): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
