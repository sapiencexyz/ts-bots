import {
  createLogger,
  createConfig as createSharedConfig,
} from '@ts-bots/shared';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadConfig } from './config';
import { MarketLPAgent } from './services/MarketLPAgent';

// Load .env from the root of the monorepo
config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  try {
    const logger = createLogger('Loom');
    logger.info('Initializing Loom Market LP Agent...');

    const cfg = loadConfig();

    // Print config summary for observability
    const shared = createSharedConfig();
    const intervalSec = parseInt(process.env.OPENAI_MODE_INTERVAL || '60', 10);
    logger.info('Configuration Summary');
    logger.debug(
      `Blockchain rpcUrl=${cfg.blockchain.rpcUrl}, chainId=${cfg.blockchain.chainId}`
    );
    logger.debug(`SAPIENCE_API=${shared.graphqlEndpoint}`);
    logger.debug(
      `OPENAI_API_KEY set=${Boolean(shared.openaiApiKey || process.env.OPENAI_API_KEY)}`
    );
    logger.info(`intervalSec=${intervalSec}`);
    logger.debug(
      `LP concentrationRange=${cfg.lpManagement.concentrationRange}, deviationThreshold=${cfg.lpManagement.deviationThreshold}, defaultCollateralAmount=${cfg.lpManagement.defaultCollateralAmount}`
    );
    logger.debug(`Risk cooldownPeriodMs=${cfg.riskManagement.cooldownPeriod}`);

    logger.info('Running OpenAI-driven Market LP Agent...');
    const agent = new MarketLPAgent(cfg);
    const intervalMs = Math.max(5, intervalSec) * 1000;
    logger.info(`OpenAI agent loop interval: ${intervalSec}s`);

    let stopping = false;
    const loop = async () => {
      while (!stopping) {
        try {
          await agent.runOnce();
        } catch (err) {
          logger.error('Agent run error:', err);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, stopping OpenAI loop...');
      stopping = true;
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, stopping OpenAI loop...');
      stopping = true;
      process.exit(0);
    });

    await loop();
  } catch (error) {
    const logger = createLogger('Loom');
    logger.error('Failed to start Loom Agent:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    const logger = createLogger('Loom');
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export * from './config';
export * from './services/MarketLPAgent';
export * from './types';
