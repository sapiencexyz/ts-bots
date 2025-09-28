export class LoomLogger {
  static logStartup(config: any) {
    // This helper was very verbose; keep only a concise summary
    console.log(
      `Loom startup: chainId=${config.blockchain.chainId}, rpc=${config.blockchain.rpcUrl}, wallet=${config.wallet?.address || 'N/A'}`
    );
    console.log(
      `EAS: contract=${config.easMonitoring.contractAddress}, schemaId=${config.easMonitoring.schemaId}`
    );
    console.log(
      `LP: concentrationRange=${config.lpManagement.concentrationRange}, deviationThreshold=${config.lpManagement.deviationThreshold}, defaultCollateral=${config.lpManagement.defaultCollateralAmount}`
    );
  }

  static logAttestationReceived(attestation: any) {
    console.log(
      `Attestation: market=${attestation.marketAddress} id=${attestation.marketId}, prob=${(attestation.likelihood * 100).toFixed(2)}%, conf=${(attestation.confidence * 100).toFixed(1)}%`
    );
  }

  static logLPStrategy(marketData: any, targetPrice: number, ticks: any) {
    console.log(
      `LP Strategy: price=${marketData.currentPrice?.toFixed(6) || 'N/A'} target=${targetPrice.toFixed(6)} ticks=${ticks.lowerTick}-${ticks.upperTick}`
    );
  }

  static logError(context: string, error: any) {
    console.error(`Error in ${context}: ${error.message}`);
  }

  static logSeparator(title?: string) {
    if (title) {
      console.log(`[---- ${title.toUpperCase()} ----]`);
    } else {
      console.log('----------------------------------------');
    }
  }
}
