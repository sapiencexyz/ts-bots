import {
  createConfig,
  createGraphQLService,
  createOpenAIService,
  MARKETS_QUERY,
  MarketsQueryResult,
} from '@ts-bots/shared';
import { LoomConfig } from '../types';
import { LPManager } from './LPManager';
import { PriceModel } from './PriceModel';

export class MarketLPAgent {
  constructor(private loomConfig: LoomConfig) {}

  async runOnce(): Promise<void> {
    const sharedConfig = createConfig();
    const gql = createGraphQLService(sharedConfig);
    const openai = createOpenAIService(sharedConfig);

    const model = new PriceModel();

    console.log('🔎 Fetching active markets from Sapience API...');
    const variables = { where: { settled: { equals: false } } } as any;
    const { markets } = await gql.query<MarketsQueryResult>(
      MARKETS_QUERY,
      variables
    );
    console.log(`📊 Active markets: ${markets.length}`);

    for (const m of markets) {
      const sapienceAddress = m.marketGroup?.address;
      if (!sapienceAddress) {
        console.log(
          `⚠️  Market ${m.marketId} missing marketGroup.address, skipping.`
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
          console.log(
            `⏰ Market ${m.marketId} expired at ${new Date(endSec * 1000).toISOString()}, skipping.`
          );
          continue;
        }
      }

      const existing = await lpManager.getCurrentLPPosition(marketIdBig);
      if (existing) {
        console.log(
          `⏭️  Market ${m.marketId}: position exists (${existing.id}), skipping.`
        );
        continue;
      }

      const question = m.marketGroup?.question || '';
      const claimYes = m.claimStatementYesOrNumeric || undefined;
      const claimNo = m.claimStatementNo || undefined;

      console.log(
        `🧠 Asking OpenAI for probability on market ${m.marketId}...`
      );
      const prediction = await openai.predictMarket({
        question,
        claimYes,
        claimNo,
      });
      const likelihood = prediction.probabilityYes; // 0..1
      console.log(
        `🎯 OpenAI probabilityYes=${(likelihood * 100).toFixed(2)}% | ${prediction.reasoning || ''}`
      );

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

      console.log(
        `📐 Market ${m.marketId}: ticks ${lowerTick}..${upperTick} around target ${targetPrice}`
      );

      const position = await lpManager.createLPPosition(
        marketIdBig,
        lowerTick,
        upperTick,
        targetPrice,
        this.loomConfig.lpManagement.defaultCollateralAmount
      );
      console.log(
        `✅ Created LP position ${position.id} for market ${m.marketId}`
      );
    }
  }
}
