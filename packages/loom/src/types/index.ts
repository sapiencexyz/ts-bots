export interface LoomConfig {
  blockchain: {
    rpcUrl: string;
    privateKey: string;
    chainId: number;
  };
  // Sapience contract address is now provided per-market via GraphQL
  easMonitoring: {
    contractAddress: string;
    schemaId: string;
    targetAddresses: string[];
    pollingInterval: number;
    startFromDaysAgo: number;
  };
  lpManagement: {
    concentrationRange: number;
    deviationThreshold: number;
    defaultCollateralAmount: string;
    // Note: tickSpacing (200) and slippageTolerance (0) are fixed for Foil protocol
  };
  riskManagement: {
    maxPositions: number;
    cooldownPeriod: number;
    emergencyStopThreshold: number;
  };
}

export interface EASAttestation {
  id: string;
  attester: string;
  recipient: string;
  refUID: string;
  revocationTime: number;
  expirationTime: number;
  time: number;
  txid: string;
  schemaId: string;
  data: string;
  marketAddress?: string;
  marketId?: string;
  questionId?: string;
  prediction?: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttestationEvent {
  id: string;
  address: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
  data: EASAttestation;
}

export interface ParsedAttestation {
  eventId: string;
  attester: string;
  marketAddress: string;
  marketId: string;
  likelihood: number;
  confidence: number;
  reasoning: string;
  timestamp: number;
  rawData: EASAttestation;
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

export enum LoomEventType {
  ATTESTATION_RECEIVED = 'attestation_received',
  POSITION_CREATED = 'position_created',
  POSITION_CLOSED = 'position_closed',
  POSITION_ADJUSTED = 'position_adjusted',
  ERROR = 'error',
}
