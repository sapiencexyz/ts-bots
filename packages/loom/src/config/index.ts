import { LoomConfig } from '../types';

export function loadConfig(): LoomConfig {
  const requiredEnvVars = ['RPC_URL', 'PRIVATE_KEY', 'CHAIN_ID'];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    blockchain: {
      rpcUrl: process.env.RPC_URL!,
      privateKey: process.env.PRIVATE_KEY!,
      chainId: parseInt(process.env.CHAIN_ID!, 10),
    },
    easMonitoring: {
      contractAddress: process.env.EAS_CONTRACT_ADDRESS || '',
      schemaId: process.env.EAS_SCHEMA_ID || '',
      targetAddresses: process.env.TARGET_ATTESTER_ADDRESSES
        ? process.env.TARGET_ATTESTER_ADDRESSES.split(',').map((addr) =>
            addr.trim()
          )
        : [],
      pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '30000', 10),
      startFromDaysAgo: parseFloat(process.env.START_FROM_DAYS_AGO || '2'),
    },
    lpManagement: {
      concentrationRange: parseFloat(process.env.CONCENTRATION_RANGE || '0.05'),
      deviationThreshold: parseFloat(process.env.DEVIATION_THRESHOLD || '0.02'),
      defaultCollateralAmount:
        process.env.DEFAULT_COLLATERAL_AMOUNT || '1000000000000000000',
    },
    riskManagement: {
      maxPositions: parseInt(process.env.MAX_POSITIONS || '5', 10),
      cooldownPeriod: parseInt(process.env.COOLDOWN_PERIOD_MS || '300000', 10),
      emergencyStopThreshold: parseFloat(
        process.env.EMERGENCY_STOP_THRESHOLD || '0.1'
      ),
    },
  };
}
