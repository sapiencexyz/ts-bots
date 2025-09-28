import { createLogger } from '@ts-bots/shared';
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
  private logger = createLogger('Loom');

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
      this.logger.debug(`Collateral token symbol: ${symbol}`);
      return symbol;
    } catch (error) {
      this.logger.warn(
        `Could not fetch token symbol for ${collateralAddress}, using 'TOKEN'`
      );
      return 'TOKEN';
    }
  }

  async getMarketData(marketId: bigint): Promise<MarketData> {
    try {
      this.logger.debug(`Fetching market data for marketId: ${marketId}`);
      this.logger.debug(`Calling sapience.getMarket(${marketId})`);

      // Get market data from Sapience contract
      const [marketData] = await this.sapience.getMarket(marketId);

      this.logger.debug(`Market data retrieved successfully`);
      this.logger.debug(`Market details:`, {
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
      this.logger.debug(`Calling sapience.getMarketGroup()`);
      const { collateralAsset: collateralAddress } =
        await this.sapience.getMarketGroup();
      this.logger.debug(
        `Market group collateral address: ${collateralAddress}`
      );

      // Get current sqrtPrice from the market's pool
      this.logger.debug(`Calling sapience.getSqrtPriceX96(${marketId})`);
      const currentSqrtPriceX96 = await this.sapience.getSqrtPriceX96(marketId);

      // Convert sqrtPriceX96 to readable price for logging
      const readablePrice = this.sqrtPriceToPrice(currentSqrtPriceX96);
      this.logger.info(
        `Market ${marketId}: price=${readablePrice.toFixed(6)} (sqrtPriceX96=${currentSqrtPriceX96.toString()})`
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

      this.logger.debug(
        `Market data compilation complete with collateral: ${collateralAddress}`
      );
      return marketDataResult;
    } catch (error) {
      this.logger.error(
        `Error getting market data for marketId ${marketId}:`,
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
      this.logger.info(`Creating LP position for market ${marketId}`);
      this.logger.debug(
        `Params: ticks ${lowerTick}-${upperTick}, targetPrice ${targetPrice}, collateral ${collateralAmount} wei`
      );

      this.logger.debug(`Step 1: Getting market data...`);
      const marketData = await this.getMarketData(marketId);

      // Get token symbol for better logging
      const tokenSymbol = await this.getCollateralTokenSymbol(
        marketData.collateralAddress
      );
      this.logger.debug(
        `Collateral Amount (${tokenSymbol}): ${this.weiToEth(collateralAmount)}`
      );

      this.logger.debug(`Step 2: Clamping ticks to market bounds...`);
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

      this.logger.debug(
        `Tick clamping: original ${originalLowerTick}-${originalUpperTick}, bounds ${marketData.baseAssetMinPriceTick}-${marketData.baseAssetMaxPriceTick}, clamped ${clampedLowerTick}-${clampedUpperTick}`
      );

      if (
        originalLowerTick !== clampedLowerTick ||
        originalUpperTick !== clampedUpperTick
      ) {
        this.logger.warn(`Ticks were clamped to fit market bounds`);
      }

      this.logger.debug(`Step 3: Converting ticks to sqrt prices...`);
      const lowerSqrtPriceX96 = this.tickToSqrtPriceX96(clampedLowerTick);
      const upperSqrtPriceX96 = this.tickToSqrtPriceX96(clampedUpperTick);

      this.logger.debug(
        `Sqrt prices: lower ${lowerSqrtPriceX96.toString()}, upper ${upperSqrtPriceX96.toString()}, current ${marketData.currentSqrtPriceX96.toString()}`
      );

      this.logger.debug(`Step 4: Getting liquidity quote...`);

      // Use quoteLiquidityPositionTokens to calculate token amounts
      const { amount0, amount1, liquidity } =
        await this.sapience.quoteLiquidityPositionTokens(
          marketId,
          collateralAmount,
          marketData.currentSqrtPriceX96,
          lowerSqrtPriceX96,
          upperSqrtPriceX96
        );

      this.logger.info(
        `Quote: amount0=${amount0.toString()} wei, amount1=${amount1.toString()} wei, liquidity=${liquidity.toString()}`
      );

      this.logger.debug(`Step 5: Checking collateral token approval...`);
      // Ensure collateral token approval for liquidity creation
      await this.ensureCollateralApproval(
        collateralAmount,
        marketData.collateralAddress
      );

      this.logger.debug(`Step 6: Preparing liquidity position parameters...`);
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

      this.logger.debug(
        `Final params: marketId=${liquidityParams.marketId}, amount0=${liquidityParams.amountBaseToken.toString()}, amount1=${liquidityParams.amountQuoteToken.toString()}, lower=${liquidityParams.lowerTick}, upper=${liquidityParams.upperTick}, deadline=${new Date(deadline * 1000).toISOString()}`
      );

      this.logger.info(`Submitting createLiquidityPosition transaction...`);
      const tx = await this.sapience.createLiquidityPosition(liquidityParams);
      this.logger.info(`Transaction submitted: ${tx.hash}`);

      this.logger.debug(`Waiting for transaction confirmation...`);
      const receipt = await tx.wait();
      this.logger.info(
        `Transaction confirmed: block=${receipt.blockNumber}, gasUsed=${receipt.gasUsed.toString()}`
      );

      // Extract token ID from receipt
      this.logger.debug(`Extracting NFT token ID from transaction receipt...`);
      const tokenId = this.extractTokenIdFromReceipt(receipt);
      this.logger.info(`Extracted token ID: ${tokenId}`);

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

      this.logger.debug(
        `Position created: id=${position.id}, tokenId=${position.tokenId}, range=${position.lowerTick}-${position.upperTick}, liquidity=${position.liquidity}`
      );

      this.emit('positionCreated', position);
      this.logger.info(`LP position creation complete`);

      return position;
    } catch (error) {
      this.logger.error(
        `Error creating LP position for market ${marketId}:`,
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
      this.logger.info(
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
        this.logger.info(
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
      this.logger.info(`LP position ${position.id} closed successfully`);
    } catch (error) {
      this.logger.error('Error closing LP position:', error);
      throw error;
    }
  }

  async getCurrentLPPosition(marketId: bigint): Promise<LPPosition | null> {
    try {
      this.logger.debug(
        `Checking for existing LP position in market ${marketId}...`
      );
      this.logger.debug(`Wallet address: ${this.wallet.address}`);

      // Check balance of positions for this wallet
      this.logger.debug(`Calling balanceOf(${this.wallet.address})`);
      const positionCount = await this.sapience.balanceOf(this.wallet.address);

      this.logger.debug(
        `Total positions owned by wallet: ${positionCount.toString()}`
      );

      if (positionCount === 0n) {
        this.logger.debug(`No positions found for this wallet`);
        return null;
      }

      this.logger.debug(
        `Iterating through ${Number(positionCount)} positions...`
      );

      // Iterate through positions to find active LP position for this market
      for (let i = 0; i < Number(positionCount); i++) {
        this.logger.debug(`Checking position index ${i}...`);

        const tokenId = await this.sapience.tokenOfOwnerByIndex(
          this.wallet.address,
          i
        );
        this.logger.debug(`Token ID at index ${i}: ${tokenId.toString()}`);

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

        this.logger.debug(`Position ${tokenId.toString()} details:`);
        this.logger.debug(`ID: ${id.toString()}`);
        const kindNum =
          typeof kind === 'bigint' ? Number(kind) : (kind as number);
        this.logger.debug(`Kind: ${kindNum} (1=LP, 2=Trader)`);
        const positionMarketIdStr = positionMarketId.toString();
        const targetMarketIdStr = marketId.toString();
        const sameMarket = positionMarketIdStr === targetMarketIdStr;
        this.logger.debug(`Market ID: ${positionMarketIdStr}`);
        this.logger.debug(`Target Market ID: ${targetMarketIdStr}`);
        this.logger.debug(
          `Deposited Collateral: ${depositedCollateralAmount.toString()}`
        );
        this.logger.debug(`Is Settled: ${isSettled}`);
        this.logger.debug(`vQuote Amount: ${vQuoteAmount.toString()}`);
        this.logger.debug(`vBase Amount: ${vBaseAmount.toString()}`);

        // Check if this is an active LP position for the specified market
        if (kindNum === 1 && !isSettled && sameMarket) {
          this.logger.info(`Found matching active LP position`);

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

          this.logger.debug(
            `Returning existing position id=${position.id}, tokenId=${position.tokenId}, marketId=${position.marketId}, liquidity=${position.liquidity}`
          );

          return position;
        } else {
          this.logger.debug(
            `Position ${tokenId.toString()} doesn't match criteria:`
          );
          if (kindNum !== 1)
            this.logger.debug(`- Wrong kind: ${kindNum} (expected 1 for LP)`);
          if (isSettled) this.logger.debug(`- Position is settled`);
          if (!sameMarket)
            this.logger.debug(
              `- Wrong market: ${positionMarketIdStr} (expected ${targetMarketIdStr})`
            );
        }
      }

      this.logger.info(`No active LP position found for market ${marketId}`);
      return null;
    } catch (error) {
      this.logger.error(
        `Error getting current LP position for market ${marketId}:`,
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
    this.logger.info(`Adjusting LP position ${oldPosition.id}`);

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
    this.logger.debug(`Checking collateral approval for ${collateralAddress}`);
    const tokenSymbol = await this.getCollateralTokenSymbol(collateralAddress);
    this.logger.debug(
      `Required amount: ${collateralAmount} wei (${this.weiToEth(collateralAmount)} ${tokenSymbol})`
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
    this.logger.debug(`Current allowance: ${currentAllowance.toString()} wei`);

    if (currentAllowance < requiredAmount) {
      this.logger.info(`Approving collateral token...`);
      this.logger.debug(`Calling approve(${spender}, MaxUint256)`);

      const approveTx = await collateralContract.approve(
        spender,
        ethers.MaxUint256
      );
      this.logger.info(`Approval transaction submitted: ${approveTx.hash}`);
      await approveTx.wait();
      this.logger.info(`Collateral approval confirmed`);
    } else {
      this.logger.debug(`Sufficient allowance already exists`);
    }
  }

  private extractTokenIdFromReceipt(
    receipt: ethers.TransactionReceipt
  ): number {
    this.logger.debug('Extracting token ID from transaction receipt');

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
