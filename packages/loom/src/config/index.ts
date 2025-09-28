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
    lpManagement: {
      concentrationRange: parseFloat(process.env.CONCENTRATION_RANGE || '0.05'),
      deviationThreshold: parseFloat(process.env.DEVIATION_THRESHOLD || '0.02'),
      defaultCollateralAmount:
        process.env.DEFAULT_COLLATERAL_AMOUNT || '1000000000000000000',
    },
    riskManagement: {
      cooldownPeriod: parseInt(process.env.COOLDOWN_PERIOD_MS || '300000', 10),
      emergencyStopThreshold: parseFloat(
        process.env.EMERGENCY_STOP_THRESHOLD || '0.1'
      ),
    },
  };
}
