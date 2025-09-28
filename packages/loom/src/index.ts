import { createConfig as createSharedConfig } from '@ts-bots/shared';
import { config } from 'dotenv';
import { resolve } from 'path';
import { loadConfig } from './config';
import { MarketLPAgent } from './services/MarketLPAgent';

// Load .env from the root of the monorepo
config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  try {
    console.log('🚀 Initializing Loom Market LP Agent...');

    const cfg = loadConfig();

    // Print config summary for observability
    const shared = createSharedConfig();
    const intervalSec = parseInt(process.env.OPENAI_MODE_INTERVAL || '60', 10);
    console.log('🧩 Configuration Summary');
    console.log('   Blockchain:');
    console.log(`     rpcUrl: ${cfg.blockchain.rpcUrl}`);
    console.log(`     chainId: ${cfg.blockchain.chainId}`);
    console.log('   OpenAI:');
    console.log(`     SAPIENCE_API: ${shared.graphqlEndpoint}`);
    console.log(
      `     OPENAI_API_KEY set: ${Boolean(shared.openaiApiKey || process.env.OPENAI_API_KEY)}`
    );
    console.log(`     intervalSec: ${intervalSec}`);
    console.log('   LP Management:');
    console.log(
      `     concentrationRange: ${cfg.lpManagement.concentrationRange}`
    );
    console.log(
      `     deviationThreshold: ${cfg.lpManagement.deviationThreshold}`
    );
    console.log(
      `     defaultCollateralAmount: ${cfg.lpManagement.defaultCollateralAmount}`
    );
    console.log('   Risk:');
    console.log(`     cooldownPeriodMs: ${cfg.riskManagement.cooldownPeriod}`);

    console.log('🤖 Running OpenAI-driven Market LP Agent...');
    const agent = new MarketLPAgent(cfg);
    const intervalMs = Math.max(5, intervalSec) * 1000;
    console.log(`⏱️  OpenAI agent loop interval: ${intervalSec}s`);

    let stopping = false;
    const loop = async () => {
      while (!stopping) {
        try {
          await agent.runOnce();
        } catch (err) {
          console.error('Agent run error:', err);
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    };

    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, stopping OpenAI loop...');
      stopping = true;
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, stopping OpenAI loop...');
      stopping = true;
      process.exit(0);
    });

    await loop();
  } catch (error) {
    console.error('❌ Failed to start Loom Agent:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

export * from './config';
export * from './services/MarketLPAgent';
export * from './types';
