import {
  createConfig,
  createGraphQLService,
  createLogger,
  createOpenAIService,
  MARKETS_QUERY,
  MarketsQueryResult,
} from '@ts-bots/shared';
import { LoomConfig } from '../types';
import { LPManager } from './LPManager';
import { PriceModel } from './PriceModel';

export class MarketLPAgent {
  private lastRunCutoff?: string;
  constructor(private loomConfig: LoomConfig) {}

  async runOnce(): Promise<void> {
    const logger = createLogger('Loom');
    const sharedConfig = createConfig();
    const gql = createGraphQLService(sharedConfig);
    const openai = createOpenAIService(sharedConfig);

    const model = new PriceModel();

    logger.info('Fetching active markets from Sapience API...');
    const where: any = { settled: { equals: false } };
    if (this.lastRunCutoff) {
      where.createdAt = { gt: this.lastRunCutoff };
    }
    const variables = { where } as any;
    const { markets } = await gql.query<MarketsQueryResult>(
      MARKETS_QUERY,
      variables
    );
    logger.info(`Active markets: ${markets.length}`);

    let createdCount = 0;

    for (const m of markets) {
      const sapienceAddress = m.marketGroup?.address;
      if (!sapienceAddress) {
        logger.warn(
          `Market ${m.marketId} missing marketGroup.address, skipping.`
        );
        continue;
      }

      const lpManager = new LPManager(this.loomConfig, sapienceAddress);
      const marketIdBig = BigInt(m.marketId);

      // Optional: skip expired markets when endTimestamp provided
      if (m.endTimestamp) {
        const endSec =
          typeof m.endTimestamp === 'string'
            ? parseInt(m.endTimestamp, 10)
            : Number(m.endTimestamp);
        const nowSec = Math.floor(Date.now() / 1000);
        if (Number.isFinite(endSec) && nowSec > endSec) {
          logger.info(
            `Market ${m.marketId} expired at ${new Date(endSec * 1000).toISOString()}, skipping.`
          );
          continue;
        }
      }

      const existing = await lpManager.getCurrentLPPosition(marketIdBig);
      if (existing) {
        logger.debug(
          `Market ${m.marketId}: position exists (${existing.id}), skipping.`
        );
        continue;
      }

      // Stop when collateral is insufficient
      const collateralAddress = m.marketGroup?.collateralAsset;
      if (!collateralAddress) {
        logger.warn(`Market ${m.marketId}: missing collateralAsset, skipping.`);
        continue;
      }
      const required = BigInt(
        this.loomConfig.lpManagement.defaultCollateralAmount
      );
      try {
        const balance = await lpManager.getCollateralBalance(collateralAddress);
        if (balance < required) {
          logger.info(
            `Insufficient collateral (${balance.toString()} wei) for required ${required.toString()} wei. Stopping further creations this run.`
          );
          break;
        }
      } catch (e) {
        logger.warn(`Could not fetch collateral balance, attempting anyway...`);
      }

      const question = m.marketGroup?.question || '';
      const claimYes = m.claimStatementYesOrNumeric || undefined;
      const claimNo = m.claimStatementNo || undefined;

      logger.debug(`Asking OpenAI for probability on market ${m.marketId}...`);
      const prediction = await openai.predictMarket({
        question,
        claimYes,
        claimNo,
      });
      const likelihood = prediction.probabilityYes; // 0..1
      logger.info(
        `Market ${m.marketId}: probabilityYes=${(likelihood * 100).toFixed(2)}%`
      );
      logger.debug(`Reasoning: ${prediction.reasoning || ''}`);

      const marketData = await lpManager.getMarketData(marketIdBig);
      const targetPrice = model.likelihoodToPrice(likelihood);
      const currentPrice = lpManager.sqrtPriceToPrice(
        marketData.currentSqrtPriceX96
      );
      const currentTick = Math.floor(Math.log(currentPrice) / Math.log(1.0001));
      const { lowerTick, upperTick } = model.priceToTicks(
        targetPrice,
        currentTick,
        this.loomConfig.lpManagement.concentrationRange,
        typeof marketData.baseAssetMinPriceTick === 'bigint'
          ? Number(marketData.baseAssetMinPriceTick)
          : marketData.baseAssetMinPriceTick,
        typeof marketData.baseAssetMaxPriceTick === 'bigint'
          ? Number(marketData.baseAssetMaxPriceTick)
          : marketData.baseAssetMaxPriceTick
      );

      logger.debug(
        `Market ${m.marketId}: ticks ${lowerTick}..${upperTick} around target ${targetPrice}`
      );

      if (process.env.DRY_RUN === 'true') {
        logger.info('DRY RUN enabled: skipping createLPPosition call.');
        continue;
      }

      const position = await lpManager.createLPPosition(
        marketIdBig,
        lowerTick,
        upperTick,
        targetPrice,
        this.loomConfig.lpManagement.defaultCollateralAmount
      );
      createdCount += 1;
      logger.info(
        `Created LP position ${position.id} for market ${m.marketId}`
      );
    }

    // After the run, record cutoff for subsequent runs
    this.lastRunCutoff = new Date().toISOString();
    logger.info(
      `Run complete. Markets scanned=${markets.length}, positions created=${createdCount}`
    );
  }
}
