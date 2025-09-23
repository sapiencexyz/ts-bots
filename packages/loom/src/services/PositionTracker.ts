import { EventEmitter } from 'events';
import { LoomConfig, LPPosition } from '../types';
import { LPManager } from './LPManager';

interface PositionState {
  position: LPPosition;
  lastChecked: number;
  consecutiveDeviations: number;
}

export class PositionTracker extends EventEmitter {
  private config: LoomConfig;
  private lpManager?: LPManager;
  private activePositions: Map<string, PositionState> = new Map();
  private isRunning = false;
  private monitoringTimer?: NodeJS.Timeout;
  private cooldownEndTimes: Map<string, number> = new Map();

  constructor(config: LoomConfig, lpManager?: LPManager) {
    super();
    this.config = config;
    this.lpManager = lpManager;
  }

  setLPManager(lpManager: LPManager): void {
    this.lpManager = lpManager;
  }

  start(): void {
    if (this.isRunning) {
      console.log('Position tracker is already running');
      return;
    }

    if (!this.lpManager) {
      console.log('⚠️  Position tracker cannot start without LP manager');
      return;
    }

    this.isRunning = true;
    console.log('Starting position tracker...');
    this.scheduleNextCheck();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.monitoringTimer) {
      clearTimeout(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }
    console.log('Position tracker stopped');
  }

  addPosition(position: LPPosition): void {
    console.log(`Tracking new position: ${position.id}`);
    this.activePositions.set(position.id, {
      position,
      lastChecked: Date.now(),
      consecutiveDeviations: 0
    });
  }

  removePosition(positionId: string): void {
    console.log(`Stopping tracking for position: ${positionId}`);
    this.activePositions.delete(positionId);
    this.cooldownEndTimes.delete(positionId);
  }

  getActivePositions(): LPPosition[] {
    return Array.from(this.activePositions.values()).map(state => state.position);
  }

  hasMaxPositions(): boolean {
    return this.activePositions.size >= this.config.riskManagement.maxPositions;
  }

  isInCooldown(positionId: string): boolean {
    const cooldownEnd = this.cooldownEndTimes.get(positionId);
    return cooldownEnd ? Date.now() < cooldownEnd : false;
  }

  private async checkAllPositions(): Promise<void> {
    if (this.activePositions.size === 0 || !this.lpManager) {
      return;
    }

    console.log(`Checking ${this.activePositions.size} active positions...`);

    try {
      for (const [positionId, state] of this.activePositions) {
        if (!state.position.isActive) {
          this.removePosition(positionId);
          continue;
        }

        if (this.isInCooldown(positionId)) {
          console.log(`Position ${positionId} is in cooldown, skipping check`);
          continue;
        }

        await this.checkPosition(state);
      }
    } catch (error) {
      console.error('Error checking positions:', error);
      this.emit('error', error);
    }
  }

  private async checkPosition(state: PositionState): Promise<void> {
    if (!this.lpManager) return;
    
    const { position } = state;
    
    try {
      // Get current market data for this position
      const marketData = await this.lpManager.getMarketData(BigInt(position.marketId));
      const currentPrice = this.lpManager.sqrtPriceToPrice(marketData.currentSqrtPriceX96);
      
      console.log(`Checking position ${position.id}: current price ${currentPrice.toFixed(6)}, target price ${position.targetPrice}`);

      const needsAdjustment = this.lpManager.isPriceOutsideDeviation(currentPrice, position.targetPrice);
      
      if (needsAdjustment) {
        state.consecutiveDeviations++;
        console.log(`Position ${position.id} deviation detected (${state.consecutiveDeviations} consecutive)`);
        
        if (state.consecutiveDeviations >= this.getRequiredConsecutiveDeviations()) {
          console.log(`Position ${position.id} requires adjustment after ${state.consecutiveDeviations} consecutive deviations`);
          this.emit('positionNeedsAdjustment', position, currentPrice);
          
          this.setCooldown(position.id);
          state.consecutiveDeviations = 0;
        }
      } else {
        if (state.consecutiveDeviations > 0) {
          console.log(`Position ${position.id} back within acceptable range`);
        }
        state.consecutiveDeviations = 0;
      }

      state.lastChecked = Date.now();
    } catch (error) {
      console.error(`Error checking position ${position.id}:`, error);
    }
  }

  private getRequiredConsecutiveDeviations(): number {
    return 2;
  }

  private setCooldown(positionId: string): void {
    const cooldownEnd = Date.now() + this.config.riskManagement.cooldownPeriod;
    this.cooldownEndTimes.set(positionId, cooldownEnd);
    console.log(`Position ${positionId} entered cooldown until ${new Date(cooldownEnd).toISOString()}`);
  }

  private scheduleNextCheck(): void {
    if (!this.isRunning) return;

    const checkInterval = Math.max(5000, this.config.easMonitoring.pollingInterval / 2);
    
    this.monitoringTimer = setTimeout(async () => {
      try {
        await this.checkAllPositions();
      } catch (error) {
        console.error('Error in position monitoring cycle:', error);
      } finally {
        this.scheduleNextCheck();
      }
    }, checkInterval);
  }

  getPositionStats(): {
    totalPositions: number;
    activePositions: number;
    positionsInCooldown: number;
    averageAge: number;
  } {
    const positions = Array.from(this.activePositions.values());
    const activePositions = positions.filter(state => state.position.isActive).length;
    const positionsInCooldown = Array.from(this.activePositions.keys())
      .filter(id => this.isInCooldown(id)).length;

    const averageAge = positions.length > 0
      ? positions.reduce((sum, state) => sum + (Date.now() - state.position.createdAt), 0) / positions.length
      : 0;

    return {
      totalPositions: this.activePositions.size,
      activePositions,
      positionsInCooldown,
      averageAge: Math.round(averageAge / 1000)
    };
  }
}