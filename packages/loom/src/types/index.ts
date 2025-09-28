export interface LoomConfig {
  blockchain: {
    rpcUrl: string;
    privateKey: string;
    chainId: number;
  };
  lpManagement: {
    concentrationRange: number;
    deviationThreshold: number;
    defaultCollateralAmount: string;
  };
  riskManagement: {
    cooldownPeriod: number;
    emergencyStopThreshold: number;
  };
}

export interface LPPosition {
  id: string;
  marketId: string;
  tokenId?: number;
  lowerTick: number;
  upperTick: number;
  liquidity: string;
  targetPrice: number;
  createdAt: number;
  lastUpdated: number;
  isActive: boolean;
}

export interface PriceRange {
  lower: number;
  upper: number;
  center: number;
}

export interface MarketData {
  marketId: bigint;
  startTime: bigint;
  endTime: bigint;
  pool: string;
  quoteToken: string;
  baseToken: string;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number | bigint;
  baseAssetMaxPriceTick: number | bigint;
  settled: boolean;
  settlementPriceD18: bigint;
  assertionId: string;
  claimStatementYesOrNumeric: string;
  claimStatementNo: string;
  currentSqrtPriceX96: bigint;
  collateralAddress: string;
}
