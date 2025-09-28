import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { ERC20_ABI, SAPIENCE_ABI } from '../abis/placeholders';
import { LoomConfig, LPPosition, MarketData, PriceRange } from '../types';

export class LPManager extends EventEmitter {
  private config: LoomConfig;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private sapience: ethers.Contract;
  private collateralTokenSymbol: string = 'TOKEN'; // Cache for token symbol

  constructor(config: LoomConfig, sapienceContractAddress: string) {
    super();
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
    this.wallet = new ethers.Wallet(
      config.blockchain.privateKey,
      this.provider
    );

    this.sapience = new ethers.Contract(
      sapienceContractAddress,
      SAPIENCE_ABI.abi,
      this.wallet
    );
  }

  private async getCollateralTokenSymbol(
    collateralAddress: string
  ): Promise<string> {
    try {
      // Return cached symbol if we already fetched it for this address
      if (this.collateralTokenSymbol !== 'TOKEN') {
        return this.collateralTokenSymbol;
      }

      const tokenContract = new ethers.Contract(
        collateralAddress,
        ERC20_ABI,
        this.provider
      );
      const symbol = await tokenContract.symbol();
      this.collateralTokenSymbol = symbol;
      console.log(`💰 [LPManager] Collateral token symbol: ${symbol}`);
      return symbol;
    } catch (error) {
      console.warn(
        `⚠️ [LPManager] Could not fetch token symbol for ${collateralAddress}, using 'TOKEN'`
      );
      return 'TOKEN';
    }
  }

  async getMarketData(marketId: bigint): Promise<MarketData> {
    try {
      console.log(
        `🔍 [LPManager] Fetching market data for marketId: ${marketId}`
      );
      console.log(`📞 [LPManager] Calling sapience.getMarket(${marketId})`);

      // Get market data from Sapience contract
      const [marketData] = await this.sapience.getMarket(marketId);

      console.log(`✅ [LPManager] Market data retrieved successfully`);
      console.log(`📊 [LPManager] Market details:`, {
        marketId: marketData.marketId.toString(),
        startTime: new Date(Number(marketData.startTime) * 1000).toISOString(),
        endTime: new Date(Number(marketData.endTime) * 1000).toISOString(),
        pool: marketData.pool,
        baseToken: marketData.baseToken,
        quoteToken: marketData.quoteToken,
        settled: marketData.settled,
        baseAssetMinPriceTick: marketData.baseAssetMinPriceTick,
        baseAssetMaxPriceTick: marketData.baseAssetMaxPriceTick,
      });

      // Get collateral address from market group
      console.log(`📞 [LPManager] Calling sapience.getMarketGroup()`);
      const { collateralAsset: collateralAddress } =
        await this.sapience.getMarketGroup();
      console.log(
        `💰 [LPManager] Market group collateral address: ${collateralAddress}`
      );

      // Get current sqrtPrice from the market's pool
      console.log(
        `📞 [LPManager] Calling sapience.getSqrtPriceX96(${marketId})`
      );
      const currentSqrtPriceX96 = await this.sapience.getSqrtPriceX96(marketId);

      // Convert sqrtPriceX96 to readable price for logging
      const readablePrice = this.sqrtPriceToPrice(currentSqrtPriceX96);
      console.log(
        `💰 [LPManager] Current market price: ${readablePrice.toFixed(6)} (sqrtPriceX96: ${currentSqrtPriceX96.toString()})`
      );

      const marketDataResult = {
        marketId: marketData.marketId,
        startTime: marketData.startTime,
        endTime: marketData.endTime,
        pool: marketData.pool,
        quoteToken: marketData.quoteToken,
        baseToken: marketData.baseToken,
        minPriceD18: marketData.minPriceD18,
        maxPriceD18: marketData.maxPriceD18,
        baseAssetMinPriceTick: marketData.baseAssetMinPriceTick,
        baseAssetMaxPriceTick: marketData.baseAssetMaxPriceTick,
        settled: marketData.settled,
        settlementPriceD18: marketData.settlementPriceD18,
        assertionId: marketData.assertionId,
        claimStatementYesOrNumeric: marketData.claimStatementYesOrNumeric,
        claimStatementNo: marketData.claimStatementNo,
        currentSqrtPriceX96,
        collateralAddress,
      };

      console.log(
        `✅ [LPManager] Market data compilation complete with collateral: ${collateralAddress}`
      );
      return marketDataResult;
    } catch (error) {
      console.error(
        `❌ [LPManager] Error getting market data for marketId ${marketId}:`,
        error
      );
      throw error;
    }
  }

  async getCollateralBalance(collateralAddress: string): Promise<bigint> {
    const token = new ethers.Contract(
      collateralAddress,
      ERC20_ABI,
      this.provider
    );
    const bal = await token.balanceOf(this.wallet.address);
    return typeof bal === 'bigint' ? bal : BigInt(bal.toString());
  }

  async createLPPosition(
    marketId: bigint,
    lowerTick: number,
    upperTick: number,
    targetPrice: number,
    collateralAmount: string
  ): Promise<LPPosition> {
    try {
      console.log(`🚀 [LPManager] ===== CREATING LP POSITION =====`);
      console.log(`📊 [LPManager] Parameters:`);
      console.log(`   • MarketId: ${marketId}`);
      console.log(`   • Initial Tick Range: ${lowerTick} to ${upperTick}`);
      console.log(`   • Target Price: ${targetPrice}`);
      console.log(`   • Collateral Amount: ${collateralAmount} wei`);

      console.log(`🔍 [LPManager] Step 1: Getting market data...`);
      const marketData = await this.getMarketData(marketId);

      // Get token symbol for better logging
      const tokenSymbol = await this.getCollateralTokenSymbol(
        marketData.collateralAddress
      );
      console.log(
        `   • Collateral Amount (${tokenSymbol}): ${this.weiToEth(collateralAmount)}`
      );

      console.log(`🔒 [LPManager] Step 2: Clamping ticks to market bounds...`);
      const originalLowerTick = lowerTick;
      const originalUpperTick = upperTick;

      // Clamp ticks to market bounds (convert BigInt to number safely)
      const minTick =
        typeof marketData.baseAssetMinPriceTick === 'bigint'
          ? Number(marketData.baseAssetMinPriceTick)
          : marketData.baseAssetMinPriceTick;
      const maxTick =
        typeof marketData.baseAssetMaxPriceTick === 'bigint'
          ? Number(marketData.baseAssetMaxPriceTick)
          : marketData.baseAssetMaxPriceTick;

      const clampedLowerTick = Math.max(lowerTick, minTick);
      const clampedUpperTick = Math.min(upperTick, maxTick);

      console.log(`📐 [LPManager] Tick clamping results:`);
      console.log(
        `   • Original: ${originalLowerTick} to ${originalUpperTick}`
      );
      console.log(
        `   • Market bounds: ${marketData.baseAssetMinPriceTick} to ${marketData.baseAssetMaxPriceTick}`
      );
      console.log(`   • Clamped: ${clampedLowerTick} to ${clampedUpperTick}`);

      if (
        originalLowerTick !== clampedLowerTick ||
        originalUpperTick !== clampedUpperTick
      ) {
        console.log(`⚠️  [LPManager] Ticks were clamped to fit market bounds!`);
      }

      console.log(`💱 [LPManager] Step 3: Converting ticks to sqrt prices...`);
      const lowerSqrtPriceX96 = this.tickToSqrtPriceX96(clampedLowerTick);
      const upperSqrtPriceX96 = this.tickToSqrtPriceX96(clampedUpperTick);

      console.log(`🔢 [LPManager] Sqrt price calculations:`);
      console.log(
        `   • Lower tick ${clampedLowerTick} → sqrtPriceX96: ${lowerSqrtPriceX96.toString()}`
      );
      console.log(
        `   • Upper tick ${clampedUpperTick} → sqrtPriceX96: ${upperSqrtPriceX96.toString()}`
      );
      console.log(
        `   • Current market sqrtPriceX96: ${marketData.currentSqrtPriceX96.toString()}`
      );

      console.log(`📞 [LPManager] Step 4: Getting liquidity quote...`);
      console.log(`🔍 [LPManager] Calling quoteLiquidityPositionTokens with:`);
      console.log(`   • marketId: ${marketId}`);
      console.log(`   • collateralAmount: ${collateralAmount}`);
      console.log(
        `   • currentSqrtPriceX96: ${marketData.currentSqrtPriceX96.toString()}`
      );
      console.log(`   • lowerSqrtPriceX96: ${lowerSqrtPriceX96.toString()}`);
      console.log(`   • upperSqrtPriceX96: ${upperSqrtPriceX96.toString()}`);

      // Use quoteLiquidityPositionTokens to calculate token amounts
      const { amount0, amount1, liquidity } =
        await this.sapience.quoteLiquidityPositionTokens(
          marketId,
          collateralAmount,
          marketData.currentSqrtPriceX96,
          lowerSqrtPriceX96,
          upperSqrtPriceX96
        );

      console.log(`✅ [LPManager] Liquidity quote received:`);
      console.log(
        `   • Base token amount (amount0): ${amount0.toString()} wei (${this.weiToEth(amount0.toString())} ${tokenSymbol})`
      );
      console.log(
        `   • Quote token amount (amount1): ${amount1.toString()} wei (${this.weiToEth(amount1.toString())} ${tokenSymbol})`
      );
      console.log(`   • Liquidity: ${liquidity.toString()}`);

      console.log(
        `🔐 [LPManager] Step 5: Checking collateral token approval...`
      );
      // Ensure collateral token approval for liquidity creation
      await this.ensureCollateralApproval(
        collateralAmount,
        marketData.collateralAddress
      );

      console.log(
        `📋 [LPManager] Step 6: Preparing liquidity position parameters...`
      );
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Create liquidity position parameters
      const liquidityParams = {
        marketId,
        amountBaseToken: amount0,
        amountQuoteToken: amount1,
        collateralAmount,
        lowerTick: clampedLowerTick,
        upperTick: clampedUpperTick,
        minAmountBaseToken: 0, // 0 slippage as specified
        minAmountQuoteToken: 0, // 0 slippage as specified
        deadline,
      };

      console.log(`📝 [LPManager] Final liquidity parameters:`);
      console.log(`   • marketId: ${liquidityParams.marketId}`);
      console.log(
        `   • amountBaseToken: ${liquidityParams.amountBaseToken.toString()}`
      );
      console.log(
        `   • amountQuoteToken: ${liquidityParams.amountQuoteToken.toString()}`
      );
      console.log(`   • collateralAmount: ${liquidityParams.collateralAmount}`);
      console.log(`   • lowerTick: ${liquidityParams.lowerTick}`);
      console.log(`   • upperTick: ${liquidityParams.upperTick}`);
      console.log(
        `   • minAmountBaseToken: ${liquidityParams.minAmountBaseToken}`
      );
      console.log(
        `   • minAmountQuoteToken: ${liquidityParams.minAmountQuoteToken}`
      );
      console.log(`   • deadline: ${new Date(deadline * 1000).toISOString()}`);

      console.log(
        `🔗 [LPManager] Step 7: Submitting transaction to blockchain...`
      );
      const tx = await this.sapience.createLiquidityPosition(liquidityParams);
      console.log(`📤 [LPManager] Transaction submitted! Hash: ${tx.hash}`);

      console.log(`⏳ [LPManager] Waiting for transaction confirmation...`);
      const receipt = await tx.wait();
      console.log(
        `✅ [LPManager] Transaction confirmed! Block: ${receipt.blockNumber}, Gas used: ${receipt.gasUsed.toString()}`
      );

      // Extract token ID from receipt
      console.log(
        `🔍 [LPManager] Extracting NFT token ID from transaction receipt...`
      );
      const tokenId = this.extractTokenIdFromReceipt(receipt);
      console.log(`🎯 [LPManager] Extracted token ID: ${tokenId}`);

      const position: LPPosition = {
        id: `position-${tokenId}`,
        marketId: marketId.toString(),
        tokenId: tokenId,
        lowerTick: clampedLowerTick,
        upperTick: clampedUpperTick,
        liquidity: liquidity.toString(),
        targetPrice,
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        isActive: true,
      };

      console.log(`🎉 [LPManager] Position object created:`);
      console.log(`   • ID: ${position.id}`);
      console.log(`   • MarketId: ${position.marketId}`);
      console.log(`   • TokenId: ${position.tokenId}`);
      console.log(
        `   • Tick Range: ${position.lowerTick} to ${position.upperTick}`
      );
      console.log(`   • Liquidity: ${position.liquidity}`);
      console.log(`   • Target Price: ${position.targetPrice}`);
      console.log(
        `   • Created: ${new Date(position.createdAt).toISOString()}`
      );
      console.log(`   • Active: ${position.isActive}`);

      this.emit('positionCreated', position);
      console.log(`📡 [LPManager] 'positionCreated' event emitted`);
      console.log(`🎯 [LPManager] ===== LP POSITION CREATION COMPLETE =====`);

      return position;
    } catch (error) {
      console.error(
        `💥 [LPManager] Error creating LP position for market ${marketId}:`,
        error
      );
      throw error;
    }
  }

  private weiToEth(weiAmount: string): string {
    try {
      const wei = BigInt(weiAmount);
      const eth = Number(wei) / 1e18;
      return eth.toFixed(6);
    } catch {
      return 'Invalid';
    }
  }

  async closeLPPosition(position: LPPosition): Promise<void> {
    try {
      console.log(
        `Closing LP position ${position.id} (token ID: ${position.tokenId})`
      );

      if (!position.tokenId) {
        throw new Error('Position token ID is required to close position');
      }

      // Get current position info from Sapience contract
      const positionData = await this.sapience.getPosition(position.tokenId);
      const [
        id,
        kind,
        marketId,
        depositedCollateralAmount,
        borrowedVQuote,
        borrowedVBase,
        vQuoteAmount,
        vBaseAmount,
        uniswapPositionId,
        isSettled,
      ] = positionData;

      // Check if position is LP kind (1) and not settled
      const kindNum =
        typeof kind === 'bigint' ? Number(kind) : (kind as number);
      if (kindNum !== 1 || isSettled) {
        console.log(
          `Position ${position.tokenId} is not an active LP position (kind: ${kindNum}, settled: ${isSettled})`
        );
        return;
      }

      // Close liquidity position using Sapience contract
      const closeParams = {
        positionId: position.tokenId,
        amount0Min: 0, // 0 slippage as specified
        amount1Min: 0, // 0 slippage as specified
        tradeSlippage: 0, // 0 slippage as specified
        deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const tx = await this.sapience.closeLiquidityPosition(closeParams);
      await tx.wait();

      position.isActive = false;
      position.lastUpdated = Date.now();

      this.emit('positionClosed', position);
      console.log(`LP position ${position.id} closed successfully`);
    } catch (error) {
      console.error('Error closing LP position:', error);
      throw error;
    }
  }

  async getCurrentLPPosition(marketId: bigint): Promise<LPPosition | null> {
    try {
      console.log(
        `🔍 [LPManager] Checking for existing LP position in market ${marketId}...`
      );
      console.log(`👤 [LPManager] Wallet address: ${this.wallet.address}`);

      // Check balance of positions for this wallet
      console.log(`📞 [LPManager] Calling balanceOf(${this.wallet.address})`);
      const positionCount = await this.sapience.balanceOf(this.wallet.address);

      console.log(
        `📊 [LPManager] Total positions owned by wallet: ${positionCount.toString()}`
      );

      if (positionCount === 0n) {
        console.log(`❌ [LPManager] No positions found for this wallet`);
        return null;
      }

      console.log(
        `🔍 [LPManager] Iterating through ${Number(positionCount)} positions...`
      );

      // Iterate through positions to find active LP position for this market
      for (let i = 0; i < Number(positionCount); i++) {
        console.log(`📍 [LPManager] Checking position index ${i}...`);

        const tokenId = await this.sapience.tokenOfOwnerByIndex(
          this.wallet.address,
          i
        );
        console.log(
          `🎯 [LPManager] Token ID at index ${i}: ${tokenId.toString()}`
        );

        const positionData = await this.sapience.getPosition(tokenId);
        const [
          id,
          kind,
          positionMarketId,
          depositedCollateralAmount,
          borrowedVQuote,
          borrowedVBase,
          vQuoteAmount,
          vBaseAmount,
          uniswapPositionId,
          isSettled,
        ] = positionData;

        console.log(`📋 [LPManager] Position ${tokenId.toString()} details:`);
        console.log(`   • ID: ${id.toString()}`);
        const kindNum =
          typeof kind === 'bigint' ? Number(kind) : (kind as number);
        console.log(`   • Kind: ${kindNum} (1=LP, 2=Trader)`);
        const positionMarketIdStr = positionMarketId.toString();
        const targetMarketIdStr = marketId.toString();
        const sameMarket = positionMarketIdStr === targetMarketIdStr;
        console.log(`   • Market ID: ${positionMarketIdStr}`);
        console.log(`   • Target Market ID: ${targetMarketIdStr}`);
        console.log(
          `   • Deposited Collateral: ${depositedCollateralAmount.toString()}`
        );
        console.log(`   • Is Settled: ${isSettled}`);
        console.log(`   • vQuote Amount: ${vQuoteAmount.toString()}`);
        console.log(`   • vBase Amount: ${vBaseAmount.toString()}`);

        // Check if this is an active LP position for the specified market
        if (kindNum === 1 && !isSettled && sameMarket) {
          console.log(`✅ [LPManager] Found matching active LP position!`);

          // This is our active LP position for this market
          const position: LPPosition = {
            id: `position-${tokenId}`,
            marketId: marketId.toString(),
            tokenId: Number(tokenId),
            lowerTick: 0, // Would need to get from Uniswap position if needed
            upperTick: 0, // Would need to get from Uniswap position if needed
            liquidity: vQuoteAmount.toString(),
            targetPrice: 0, // Would need to calculate from current price
            createdAt: Date.now(), // Placeholder
            lastUpdated: Date.now(),
            isActive: true,
          };

          console.log(`🎉 [LPManager] Returning existing position:`);
          console.log(`   • Position ID: ${position.id}`);
          console.log(`   • Token ID: ${position.tokenId}`);
          console.log(`   • Market ID: ${position.marketId}`);
          console.log(`   • Liquidity: ${position.liquidity}`);

          return position;
        } else {
          console.log(
            `⏭️  [LPManager] Position ${tokenId.toString()} doesn't match criteria:`
          );
          if (kindNum !== 1)
            console.log(`     - Wrong kind: ${kindNum} (expected 1 for LP)`);
          if (isSettled) console.log(`     - Position is settled`);
          if (!sameMarket)
            console.log(
              `     - Wrong market: ${positionMarketIdStr} (expected ${targetMarketIdStr})`
            );
        }
      }

      console.log(
        `❌ [LPManager] No active LP position found for market ${marketId}`
      );
      return null;
    } catch (error) {
      console.error(
        `💥 [LPManager] Error getting current LP position for market ${marketId}:`,
        error
      );
      throw error;
    }
  }

  async adjustLPPosition(
    oldPosition: LPPosition,
    newLowerTick: number,
    newUpperTick: number,
    newTargetPrice: number,
    collateralAmount: string
  ): Promise<LPPosition> {
    console.log(`Adjusting LP position ${oldPosition.id}`);

    // Close old position
    await this.closeLPPosition(oldPosition);

    // Create new position with specified collateral amount
    return await this.createLPPosition(
      BigInt(oldPosition.marketId),
      newLowerTick,
      newUpperTick,
      newTargetPrice,
      collateralAmount
    );
  }

  isPriceOutsideDeviation(currentPrice: number, targetPrice: number): boolean {
    const deviation = Math.abs(currentPrice - targetPrice) / targetPrice;
    return deviation > this.config.lpManagement.deviationThreshold;
  }

  calculatePriceRange(targetPrice: number): PriceRange {
    const epsilon = 1e-6;
    const halfRange = this.config.lpManagement.concentrationRange / 2;
    return {
      lower: Math.max(epsilon, targetPrice - halfRange),
      upper: Math.min(1 - epsilon, targetPrice + halfRange),
      center: targetPrice,
    };
  }

  private tickToSqrtPriceX96(tick: number): bigint {
    // Convert tick to sqrtPriceX96 format
    // This is based on Uniswap V3 math: sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
    const price = Math.pow(1.0001, tick);
    const sqrtPrice = Math.sqrt(price);
    const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * 2 ** 96));
    return sqrtPriceX96;
  }

  private async ensureCollateralApproval(
    collateralAmount: string,
    collateralAddress: string
  ): Promise<void> {
    console.log(
      `🔍 [LPManager] Checking collateral approval for ${collateralAddress}`
    );
    const tokenSymbol = await this.getCollateralTokenSymbol(collateralAddress);
    console.log(
      `💰 [LPManager] Required amount: ${collateralAmount} wei (${this.weiToEth(collateralAmount)} ${tokenSymbol})`
    );

    const collateralContract = new ethers.Contract(
      collateralAddress,
      ERC20_ABI,
      this.wallet
    );
    const spender = this.sapience.target; // The Sapience contract address

    // Convert amount to BigInt for comparison
    const requiredAmount = BigInt(collateralAmount);

    // Check current allowance
    const currentAllowance = await collateralContract.allowance(
      this.wallet.address,
      spender
    );
    console.log(
      `📊 [LPManager] Current allowance: ${currentAllowance.toString()} wei`
    );

    if (currentAllowance < requiredAmount) {
      console.log(
        `🔓 [LPManager] Insufficient allowance, approving collateral token...`
      );
      console.log(`📞 [LPManager] Calling approve(${spender}, MaxUint256)`);

      const approveTx = await collateralContract.approve(
        spender,
        ethers.MaxUint256
      );
      console.log(
        `📤 [LPManager] Approval transaction submitted: ${approveTx.hash}`
      );
      await approveTx.wait();
      console.log(`✅ [LPManager] Collateral approval confirmed`);
    } else {
      console.log(`✅ [LPManager] Sufficient allowance already exists`);
    }
  }

  private extractTokenIdFromReceipt(
    receipt: ethers.TransactionReceipt
  ): number {
    console.log('Extracting token ID from transaction receipt');

    // Look for Transfer event from ERC721 (NFT creation)
    // The Sapience contract inherits NFT functionality for position tracking
    for (const log of receipt.logs) {
      try {
        // Try to parse as Transfer event (address indexed from, address indexed to, uint256 indexed tokenId)
        const transferInterface = new ethers.Interface([
          'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
        ]);

        const parsedLog = transferInterface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsedLog && parsedLog.name === 'Transfer') {
          // Check if this is a mint (from address is zero) to our wallet
          if (
            parsedLog.args.from === ethers.ZeroAddress &&
            parsedLog.args.to === this.wallet.address
          ) {
            return Number(parsedLog.args.tokenId);
          }
        }
      } catch (error) {
        // Log doesn't match Transfer event format, continue
      }
    }

    // If we can't find the token ID, throw error
    throw new Error('Could not extract token ID from transaction receipt');
  }

  sqrtPriceToPrice(sqrtPriceX96: bigint): number {
    // Convert sqrtPriceX96 format to regular price
    const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
    return sqrtPrice ** 2;
  }
}
