export class LoomLogger {
  static logStartup(config: any) {
    console.log(`🚀 ===== LOOM BOT STARTING UP =====`);
    console.log(`🤖 Bot Name: Loom (Automated LP Provider)`);
    console.log(`⛓️  Blockchain: ${config.blockchain.chainId === 42161 ? 'Arbitrum' : 'Chain ' + config.blockchain.chainId}`);
    console.log(`🔗 RPC URL: ${config.blockchain.rpcUrl}`);
    console.log(`👤 Wallet: ${config.wallet?.address || 'Loading...'}`);
    console.log(``);
    console.log(`📡 EAS Monitoring Configuration:`);
    console.log(`   • Contract: ${config.easMonitoring.contractAddress}`);
    console.log(`   • Schema ID: ${config.easMonitoring.schemaId}`);
    console.log(`   • Target Attesters: ${config.easMonitoring.targetAddresses.join(', ')}`);
    console.log(`   • Polling Interval: ${config.easMonitoring.pollingInterval}ms`);
    console.log(``);
    console.log(`🏊 LP Management Configuration:`);
    console.log(`   • Protocol: Foil (Sapience Contract)`);
    console.log(`   • Concentration Range: ${config.lpManagement.concentrationRange * 100}%`);
    console.log(`   • Deviation Threshold: ${config.lpManagement.deviationThreshold * 100}%`);
    console.log(`   • Default Collateral: ${config.lpManagement.defaultCollateralAmount} wei`);
    console.log(`   • Tick Spacing: 200 (fixed for Foil protocol)`);
    console.log(`   • Slippage Tolerance: 0% (fixed for Foil protocol)`);
    console.log(``);
    console.log(`⚠️  Risk Management:`);
    console.log(`   • Max Positions: ${config.riskManagement.maxPositions}`);
    console.log(`   • Cooldown Period: ${config.riskManagement.cooldownPeriod}ms`);
    console.log(`   • Emergency Stop Threshold: ${config.riskManagement.emergencyStopThreshold * 100}%`);
    console.log(``);
    console.log(`🚧 TESTING MODE: Liquidity creation transactions are disabled!`);
    console.log(`🔍 The bot will log all operations without executing blockchain transactions.`);
    console.log(`✅ Ready to monitor attestations and simulate LP operations.`);
    console.log(`🚀 ===== LOOM BOT STARTUP COMPLETE =====`);
    console.log(``);
  }

  static logAttestationReceived(attestation: any) {
    console.log(`🎯 ===== NEW ATTESTATION RECEIVED =====`);
    console.log(`📝 Event ID: ${attestation.eventId}`);
    console.log(`👤 Attester: ${attestation.attester}`);
    console.log(`🏪 Market: ${attestation.marketAddress} (ID: ${attestation.marketId})`);
    console.log(`💰 Predicted Price: ${(attestation.likelihood * 100).toFixed(2)}%`);
    console.log(`🔮 Confidence: ${(attestation.confidence * 100).toFixed(1)}%`);
    console.log(`💭 Reasoning: ${attestation.reasoning}`);
    console.log(`⏰ Time: ${new Date(attestation.timestamp).toISOString()}`);
    console.log(`🎯 ===== PROCESSING ATTESTATION =====`);
    console.log(``);
  }

  static logLPStrategy(marketData: any, targetPrice: number, ticks: any) {
    console.log(`🎯 ===== LP STRATEGY DECISION =====`);
    console.log(`📊 Market Analysis:`);
    console.log(`   • Current Price: ${marketData.currentPrice?.toFixed(6) || 'N/A'}`);
    console.log(`   • Target Price: ${targetPrice.toFixed(6)}`);
    console.log(`   • Market Bounds: Tick ${marketData.baseAssetMinPriceTick} to ${marketData.baseAssetMaxPriceTick}`);
    console.log(`📐 LP Position Design:`);
    console.log(`   • Lower Tick: ${ticks.lowerTick}`);
    console.log(`   • Upper Tick: ${ticks.upperTick}`);
    console.log(`   • Tick Range: ${ticks.upperTick - ticks.lowerTick} ticks`);
    console.log(`🎯 ===== EXECUTING LP STRATEGY =====`);
    console.log(``);
  }

  static logError(context: string, error: any) {
    console.error(`💥 ===== ERROR IN ${context.toUpperCase()} =====`);
    console.error(`❌ Error message: ${error.message}`);
    console.error(`📍 Error stack:`, error.stack);
    console.error(`💥 ===== END ERROR LOG =====`);
    console.log(``);
  }

  static logSeparator(title?: string) {
    console.log(``);
    if (title) {
      console.log(`🔄 ===== ${title.toUpperCase()} =====`);
    } else {
      console.log(`${'='.repeat(50)}`);
    }
    console.log(``);
  }
}