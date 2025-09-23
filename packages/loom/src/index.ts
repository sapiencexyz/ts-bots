import { createConfig as createSharedConfig } from '@ts-bots/shared';
import { config } from 'dotenv';
import { resolve } from 'path';
import { LoomBot } from './LoomBot';
import { loadConfig } from './config';
import { MarketLPAgent } from './services/MarketLPAgent';

// Load .env from the root of the monorepo
config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  try {
    console.log('🚀 Initializing Loom Bot...');

    const config = loadConfig();
    const mode = process.env.MODE || 'openai';

    // Print config summary for observability
    const shared = createSharedConfig();
    console.log('🧩 Configuration Summary');
    console.log(`   Mode: ${mode}`);
    console.log('   Blockchain:');
    console.log(`     rpcUrl: ${config.blockchain.rpcUrl}`);
    console.log(`     chainId: ${config.blockchain.chainId}`);
    if (mode === 'attestation') {
      console.log('   Attestations:');
      console.log(
        `     EAS contract: ${config.easMonitoring.contractAddress || '(none)'}`
      );
      console.log(
        `     schemaId: ${config.easMonitoring.schemaId || '(none)'}`
      );
      console.log(
        `     targetAddresses: ${config.easMonitoring.targetAddresses.join(', ') || '(none)'}`
      );
      console.log(
        `     pollingIntervalMs: ${config.easMonitoring.pollingInterval}`
      );
      console.log(
        `     startFromDaysAgo: ${config.easMonitoring.startFromDaysAgo}`
      );
    } else {
      const intervalSec = parseInt(
        process.env.OPENAI_MODE_INTERVAL || '60',
        10
      );
      console.log('   OpenAI:');
      console.log(`     SAPIENCE_API: ${shared.graphqlEndpoint}`);
      console.log(
        `     OPENAI_API_KEY set: ${Boolean(shared.openaiApiKey || process.env.OPENAI_API_KEY)}`
      );
      console.log(`     intervalSec: ${intervalSec}`);
      console.log('   LP Management:');
      console.log(
        `     concentrationRange: ${config.lpManagement.concentrationRange}`
      );
      console.log(
        `     deviationThreshold: ${config.lpManagement.deviationThreshold}`
      );
      console.log(
        `     defaultCollateralAmount: ${config.lpManagement.defaultCollateralAmount}`
      );
      console.log('   Risk:');
      console.log(`     maxPositions: ${config.riskManagement.maxPositions}`);
      console.log(
        `     cooldownPeriodMs: ${config.riskManagement.cooldownPeriod}`
      );
    }
    if (mode === 'attestation') {
      const bot = new LoomBot(config);
      process.on('SIGINT', async () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        await bot.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        await bot.stop();
        process.exit(0);
      });

      bot.on('error', (error) => {
        console.error('🚨 Bot encountered an error:', error);
      });

      bot.on('attestationParsed', (attestation) => {
        console.log(
          `✅ New attestation processed: ${attestation.eventId} (${(attestation.likelihood * 100).toFixed(2)}%)`
        );
      });

      bot.on('positionCreatedFromAttestation', ({ position, attestation }) => {
        console.log(
          `🎯 Position ${position.id} created from attestation ${attestation.eventId}`
        );
      });

      await bot.start();
      console.log('🎉 Loom Bot is running! Press Ctrl+C to stop.');
    } else {
      console.log('🤖 Running OpenAI-driven Market LP Agent...');
      const agent = new MarketLPAgent(config);
      const intervalSec = parseInt(
        process.env.OPENAI_MODE_INTERVAL || '60',
        10
      );
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
    }
  } catch (error) {
    console.error('❌ Failed to start Loom Bot:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

export * from './LoomBot';
export * from './config';
export * from './types';
