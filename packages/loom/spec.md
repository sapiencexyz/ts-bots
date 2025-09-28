# Loom Market LP Agent Specification

## Overview

The Loom Market LP Agent is an automated liquidity provision (LP) bot that periodically queries the Sapience GraphQL API for active markets, uses an LLM to estimate probabilities, and creates concentrated liquidity positions around the target price.

## Core Functionality

1. Fetch active, unsettled markets via GraphQL
2. Use OpenAI to estimate probability for each market
3. Convert probability to target price and tick range
4. Create LP positions on-chain via the Sapience contract

## Components

- MarketLPAgent: main loop that orchestrates fetching markets, prompting OpenAI, and calling `LPManager`
- LPManager: blockchain interactions to read market data, quote liquidity and create/close/adjust positions
- PriceModel: conversions between probabilities, prices, and ticks

## Configuration

Environment variables:

- `RPC_URL`, `PRIVATE_KEY`, `CHAIN_ID`
- `SAPIENCE_API`, `OPENAI_API_KEY`, `OPENAI_MODE_INTERVAL`
- `CONCENTRATION_RANGE`, `DEVIATION_THRESHOLD`, `DEFAULT_COLLATERAL_AMOUNT`

## Loop

```
GraphQL → Markets → OpenAI → Likelihood → PriceModel → LPManager.createLPPosition
```

## Risk Controls

- Skip markets that are settled or expired
- Do not recreate positions when one already exists
- Use zero slippage on-chain parameters
