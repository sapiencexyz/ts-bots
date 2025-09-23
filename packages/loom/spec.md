# Loom Bot Specification

## Overview

The Loom bot is an automated liquidity provision (LP) bot designed to monitor attestation services for specific events and dynamically manage concentrated liquidity positions based on attested probability data. The bot focuses on concentrated liquidity around prices derived from attestation likelihood percentages.

## Core Functionality

### 1. Event Monitoring
- Monitor attestation service for events from specific configured addresses
- Poll at configurable intervals for new attestations
- Filter events based on predefined criteria (address, event type, etc.)

### 2. Attestation Data Extraction
- Parse attestation data to extract likelihood percentages
- Validate attestation format and data integrity
- Convert percentage data to price ranges for LP positioning

### 3. LP Position Management
- Create new concentrated liquidity positions around attested prices
- Monitor existing LP positions for deviation from target price
- Close and re-open positions when price moves beyond configured deviation threshold
- Calculate optimal position ranges based on attested probabilities

## Technical Architecture

### Components

#### 1. Event Monitor
- **Purpose**: Continuously monitor attestation service for relevant events
- **Responsibilities**:
  - Poll attestation service API/endpoints
  - Filter events by configured addresses
  - Trigger data processing pipeline when relevant events are found

#### 2. Attestation Parser
- **Purpose**: Extract and validate probability data from attestations
- **Responsibilities**:
  - Parse attestation payloads
  - Extract likelihood percentages
  - Validate data format and ranges
  - Convert percentages to price targets

#### 3. LP Manager
- **Purpose**: Handle all liquidity position operations
- **Responsibilities**:
  - Create new LP positions
  - Close existing positions
  - Calculate position ranges
  - Interface with DEX protocols

#### 4. Position Tracker
- **Purpose**: Monitor existing positions and trigger management actions
- **Responsibilities**:
  - Track active LP positions
  - Monitor price deviations
  - Trigger position adjustments
  - Maintain position state

### Data Flow
```
Attestation Service → Event Monitor → Attestation Parser → LP Manager
                                                            ↓
Position Tracker ← DEX Protocol ← LP Position Creation/Update
```

## Configuration

### Required Parameters

#### Attestation Service
- `attestationServiceUrl`: Base URL for attestation service
- `targetAddresses`: Array of addresses to monitor for events
- `eventTypes`: Specific event types to watch (optional filter)
- `pollingInterval`: How often to check for new attestations (in ms)

#### LP Management
- `dexProtocol`: Target DEX protocol (e.g., Uniswap V3, etc.)
- `poolAddress`: Target pool for LP positions
- `concentrationRange`: Percentage range around target price for concentrated liquidity
- `deviationThreshold`: Percentage deviation that triggers position adjustment
- `minLiquidityAmount`: Minimum liquidity amount for positions
- `maxLiquidityAmount`: Maximum liquidity amount for positions

#### Risk Management
- `maxPositions`: Maximum number of simultaneous LP positions
- `cooldownPeriod`: Minimum time between position adjustments (in ms)
- `emergencyStopThreshold`: Maximum loss threshold for emergency position closure

### Example Configuration
```typescript
interface LoomConfig {
  attestationService: {
    url: string;
    targetAddresses: string[];
    eventTypes?: string[];
    pollingInterval: number;
  };
  lpManagement: {
    dexProtocol: 'uniswap-v3' | 'other';
    poolAddress: string;
    concentrationRange: number; // e.g., 0.05 for 5%
    deviationThreshold: number; // e.g., 0.02 for 2%
    minLiquidityAmount: string; // Wei/BigInt string
    maxLiquidityAmount: string; // Wei/BigInt string
  };
  riskManagement: {
    maxPositions: number;
    cooldownPeriod: number;
    emergencyStopThreshold: number;
  };
  wallet: {
    privateKey: string;
    rpcUrl: string;
  };
}
```

## LP Management Strategy

### Position Opening Logic
1. **Trigger**: New attestation with likelihood percentage detected
2. **Price Target**: Convert percentage to market price equivalent
3. **Range Calculation**: Create concentrated liquidity range around target price
   - Lower bound: `targetPrice * (1 - concentrationRange/2)`
   - Upper bound: `targetPrice * (1 + concentrationRange/2)`
4. **Position Size**: Based on configured liquidity amounts and available funds

### Position Monitoring
- Continuously monitor current market price vs. position range
- Track position performance and fees earned
- Check for deviation beyond configured threshold

### Position Adjustment Triggers
- **Price Deviation**: Current price moves beyond `deviationThreshold` from position center
- **New Attestation**: Fresh attestation with significantly different likelihood
- **Emergency Conditions**: Losses exceed emergency stop threshold

### Position Adjustment Process
1. Close existing LP position
2. Calculate new target price from latest attestation
3. Create new position with updated range
4. Update position tracking state

## Dependencies & Integrations

### External Services
- **Attestation Service**: API endpoints for event monitoring and data retrieval
- **DEX Protocol**: Smart contracts for LP position management
- **RPC Provider**: Blockchain node access for transaction execution
- **Price Feeds**: Real-time price data for deviation calculations

### Smart Contract Interactions
- LP position creation/removal
- Token approvals for liquidity provision
- Fee collection from positions
- Position range queries

### Required Libraries
- Web3/Ethers for blockchain interactions
- Axios/Fetch for HTTP requests to attestation service
- BigNumber.js for precise decimal calculations
- Logging framework for operational monitoring

## Error Handling & Monitoring

### Error Scenarios
- Attestation service unavailable
- Invalid attestation data format
- LP position creation failures
- Insufficient funds for position creation
- Network connectivity issues

### Monitoring & Logging
- Position performance metrics
- Attestation processing logs
- Error tracking and alerting
- Fee earnings reports

## Security Considerations

- Secure private key management
- Input validation for attestation data
- Rate limiting for API calls
- Slippage protection for position operations
- Emergency stop mechanisms

## Implementation Phases

### Phase 1: Core Infrastructure
- Event monitoring system
- Attestation parsing
- Basic configuration management

### Phase 2: LP Management
- DEX integration
- Position creation/closure
- Range calculations

### Phase 3: Advanced Features
- Position monitoring and adjustment
- Performance tracking
- Risk management features

### Phase 4: Production Hardening
- Comprehensive error handling
- Monitoring and alerting
- Security auditing