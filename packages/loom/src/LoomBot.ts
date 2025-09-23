import { EventEmitter } from 'events';
import { AttestationParser } from './services/AttestationParser';
import { EventMonitor } from './services/EventMonitor';
import { LPManager } from './services/LPManager';
import { PositionTracker } from './services/PositionTracker';
import {
  AttestationEvent,
  LPPosition,
  LoomConfig,
  LoomEventType,
  ParsedAttestation,
} from './types';

export class LoomBot extends EventEmitter {
  private config: LoomConfig;
  private eventMonitor: EventMonitor;
  private attestationParser: AttestationParser;
  private lpManager: LPManager;
  private positionTracker: PositionTracker;
  private isRunning = false;
  private startTime?: number;
  private processedAttestations: Set<string> = new Set();
  private hasProcessedFirstAttestation: boolean = false;

  constructor(config: LoomConfig) {
    super();
    this.config = config;

    this.eventMonitor = new EventMonitor(config);
    this.attestationParser = new AttestationParser();
    // Note: LPManager needs Sapience contract address, will be created when first attestation received
    this.lpManager = null as any;
    this.positionTracker = new PositionTracker(config);

    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Loom bot is already running');
    }

    console.log('🚀 Starting Loom bot...');
    this.startTime = Date.now();
    this.isRunning = true;

    try {
      console.log(
        '🚧 Starting in monitoring mode (LP manager will initialize on first attestation)...'
      );

      console.log('👂 Starting event monitor...');
      await this.eventMonitor.start();

      console.log(
        '📈 Position tracker ready (will start when LP manager is available)...'
      );

      this.emit('botStarted');
      console.log('✅ Loom bot started successfully');

      this.logStatus();
    } catch (error) {
      console.error('❌ Failed to start Loom bot:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Loom bot...');
    this.isRunning = false;

    this.eventMonitor.stop();
    if (this.positionTracker) {
      this.positionTracker.stop();
    }

    this.emit('botStopped');
    console.log('✅ Loom bot stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getStatus(): {
    isRunning: boolean;
    uptime: number;
    activePositions: number;
    totalPositions: number;
    positionsInCooldown: number;
  } {
    const stats = this.positionTracker.getPositionStats();

    return {
      isRunning: this.isRunning,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      activePositions: stats.activePositions,
      totalPositions: stats.totalPositions,
      positionsInCooldown: stats.positionsInCooldown,
    };
  }

  private setupEventHandlers(): void {
    this.eventMonitor.on(
      'attestationEvent',
      this.handleAttestationEvent.bind(this)
    );
    this.eventMonitor.on('error', this.handleError.bind(this));

    this.positionTracker.on(
      'positionNeedsAdjustment',
      this.handlePositionAdjustment.bind(this)
    );
    this.positionTracker.on('error', this.handleError.bind(this));

    // LP manager event handlers will be set up when LP manager is initialized
    // See setupLPManagerEventHandlers() method
  }

  private setupLPManagerEventHandlers(): void {
    if (this.lpManager) {
      this.lpManager.on(
        'positionCreated',
        this.handlePositionCreated.bind(this)
      );
      this.lpManager.on('positionClosed', this.handlePositionClosed.bind(this));
    }
  }

  private async handleAttestationEvent(event: AttestationEvent): Promise<void> {
    try {
      console.log(
        `🔍 Processing attestation event ${event.id} from ${event.address}`
      );

      // Skip if we've already processed our first attestation (debug mode)
      if (this.hasProcessedFirstAttestation) {
        console.log(
          `⚠️  Already processed first attestation, skipping ${event.id}`
        );
        return;
      }

      // Check if we've already processed this attestation to prevent duplicates
      if (this.processedAttestations.has(event.id)) {
        console.log(`⚠️  Attestation ${event.id} already processed, skipping`);
        return;
      }

      const parsedAttestation = this.attestationParser.parseAttestation(event);
      if (!parsedAttestation) {
        console.log(`⚠️  Could not parse attestation ${event.id}, skipping`);
        return;
      }

      console.log(
        `📝 Parsed likelihood: ${(parsedAttestation.likelihood * 100).toFixed(2)}%`
      );

      // Mark this attestation as processed
      this.processedAttestations.add(event.id);

      // Mark that we've processed our first attestation
      this.hasProcessedFirstAttestation = true;
      console.log(
        `🎯 This is our FIRST attestation - processing for position creation`
      );

      // Clean up old attestations periodically to prevent memory leaks
      if (this.processedAttestations.size > 1000) {
        this.cleanupOldAttestations();
      }

      this.emit('attestationParsed', parsedAttestation);

      await this.processAttestation(parsedAttestation);
    } catch (error) {
      // Let the error bubble up to the main error handler
      throw error;
    }
  }

  private async processAttestation(
    attestation: ParsedAttestation
  ): Promise<void> {
    try {
      console.log(
        `🎯 Processing attestation for market ${attestation.marketId} at ${attestation.marketAddress}`
      );

      // Initialize LP manager if this is our first attestation
      if (!this.lpManager) {
        console.log(
          `🔧 Initializing LP Manager with Sapience contract: ${attestation.marketAddress}`
        );
        this.lpManager = new LPManager(this.config, attestation.marketAddress);

        // Set up event handlers for the newly initialized LP manager
        this.setupLPManagerEventHandlers();

        // Now we can start the position tracker
        this.positionTracker.setLPManager(this.lpManager);
        this.positionTracker.start();
        console.log(`✅ LP Manager initialized, position tracker started`);
      }

      // Check if market has expired or settled before processing
      const marketData = await this.lpManager.getMarketData(
        BigInt(attestation.marketId)
      );

      const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
      const endTime = Number(marketData.endTime);

      if (marketData.settled) {
        console.log(
          `⏰ Market ${attestation.marketId} has already been settled, skipping attestation`
        );
        return;
      }

      if (currentTime > endTime) {
        console.log(
          `⏰ Market ${attestation.marketId} has expired (ended at ${new Date(endTime * 1000).toISOString()}), skipping attestation`
        );
        return;
      }

      if (this.positionTracker.hasMaxPositions()) {
        console.log(
          `⚠️  Maximum positions (${this.config.riskManagement.maxPositions}) reached, skipping new position creation`
        );
        return;
      }

      const targetPrice = this.attestationParser.likelihoodToPrice(
        attestation.likelihood
      );

      // Use market data we already fetched for expiration check
      const currentPrice = this.lpManager.sqrtPriceToPrice(
        marketData.currentSqrtPriceX96
      );

      console.log(
        `🎯 Target price: ${targetPrice}, Current price: ${currentPrice.toFixed(6)}`
      );
      console.log(
        `📊 Attestation details: Market ${attestation.marketId} at ${attestation.marketAddress}`
      );
      console.log(`💭 Reasoning: ${attestation.reasoning}`);

      // Check if we already have a position in this market
      const existingPosition = await this.lpManager.getCurrentLPPosition(
        BigInt(attestation.marketId)
      );
      if (existingPosition) {
        console.log(
          `⚠️  Already have position ${existingPosition.id} in market ${attestation.marketId}, skipping creation`
        );
        return;
      }

      const priceRange = this.lpManager.calculatePriceRange(targetPrice);

      // Convert sqrt price to tick for current price calculation
      const currentTick = Math.floor(Math.log(currentPrice) / Math.log(1.0001));

      const { lowerTick, upperTick } = this.attestationParser.priceToTicks(
        targetPrice,
        currentTick,
        this.config.lpManagement.concentrationRange,
        typeof marketData.baseAssetMinPriceTick === 'bigint'
          ? Number(marketData.baseAssetMinPriceTick)
          : marketData.baseAssetMinPriceTick,
        typeof marketData.baseAssetMaxPriceTick === 'bigint'
          ? Number(marketData.baseAssetMaxPriceTick)
          : marketData.baseAssetMaxPriceTick
      );

      console.log(
        `📊 Creating LP position with range: ${priceRange.lower.toFixed(4)} - ${priceRange.upper.toFixed(4)}`
      );

      const position = await this.lpManager.createLPPosition(
        BigInt(attestation.marketId),
        lowerTick,
        upperTick,
        targetPrice,
        this.config.lpManagement.defaultCollateralAmount
      );

      console.log(
        `✅ Created position ${position.id} for market ${attestation.marketId} based on attestation ${attestation.eventId}`
      );

      this.emit('positionCreatedFromAttestation', { position, attestation });
    } catch (error) {
      // Let the error bubble up to the main error handler
      throw error;
    }
  }

  private async handlePositionAdjustment(
    position: LPPosition,
    currentPrice: number
  ): Promise<void> {
    try {
      if (!this.lpManager) {
        console.error('❌ Cannot adjust position: LP manager not initialized');
        return;
      }

      console.log(
        `🔄 Adjusting position ${position.id} due to price deviation`
      );
      console.log(
        `   Current price: ${currentPrice}, Target: ${position.targetPrice}`
      );

      const newPriceRange = this.lpManager.calculatePriceRange(currentPrice);

      // Convert current price to tick
      const currentTick = Math.floor(Math.log(currentPrice) / Math.log(1.0001));

      // Get market data for tick bounds
      const marketData = await this.lpManager.getMarketData(
        BigInt(position.marketId)
      );

      const { lowerTick, upperTick } = this.attestationParser.priceToTicks(
        currentPrice,
        currentTick,
        this.config.lpManagement.concentrationRange,
        typeof marketData.baseAssetMinPriceTick === 'bigint'
          ? Number(marketData.baseAssetMinPriceTick)
          : marketData.baseAssetMinPriceTick,
        typeof marketData.baseAssetMaxPriceTick === 'bigint'
          ? Number(marketData.baseAssetMaxPriceTick)
          : marketData.baseAssetMaxPriceTick
      );

      const newPosition = await this.lpManager.adjustLPPosition(
        position,
        lowerTick,
        upperTick,
        currentPrice,
        this.config.lpManagement.defaultCollateralAmount
      );

      console.log(`✅ Adjusted position ${position.id} -> ${newPosition.id}`);

      this.positionTracker.removePosition(position.id);
      this.positionTracker.addPosition(newPosition);

      this.emit('positionAdjusted', { oldPosition: position, newPosition });
    } catch (error) {
      // Let the error bubble up to the main error handler
      this.emit('error', error);
    }
  }

  private handlePositionCreated(position: LPPosition): void {
    console.log(`📈 Position created: ${position.id}`);
    this.positionTracker.addPosition(position);

    this.emit('positionEvent', {
      type: LoomEventType.POSITION_CREATED,
      timestamp: Date.now(),
      data: position,
    });
  }

  private handlePositionClosed(position: LPPosition): void {
    console.log(`📉 Position closed: ${position.id}`);
    this.positionTracker.removePosition(position.id);

    this.emit('positionEvent', {
      type: LoomEventType.POSITION_CLOSED,
      timestamp: Date.now(),
      data: position,
    });
  }

  private handleError(error: unknown): void {
    console.error('🚨 Bot error:', error);

    this.emit('error', {
      type: LoomEventType.ERROR,
      timestamp: Date.now(),
      data: error,
    });
  }

  private logStatus(): void {
    const status = this.getStatus();
    console.log('📊 Bot Status:');
    console.log(`   Running: ${status.isRunning}`);
    console.log(`   Active Positions: ${status.activePositions}`);
    console.log(
      `   LP Manager: ${this.lpManager ? 'Initialized' : 'Waiting for attestation'}`
    );
    console.log(
      `   Monitoring: ${this.config.easMonitoring.targetAddresses.length} addresses`
    );
    console.log(
      `   First Attestation Processed: ${this.hasProcessedFirstAttestation ? '✅ Yes' : '⏳ Waiting'}`
    );
  }

  private cleanupOldAttestations(): void {
    // Keep only the most recent 500 attestations to prevent memory leaks
    if (this.processedAttestations.size > 500) {
      const attestationsArray = Array.from(this.processedAttestations);
      // Remove the oldest 200 attestations
      const toRemove = attestationsArray.slice(
        0,
        attestationsArray.length - 500
      );
      toRemove.forEach((id) => this.processedAttestations.delete(id));
      console.log(`🧹 Cleaned up ${toRemove.length} old attestation records`);
    }
  }
}
