export class PriceModel {
  private isValidLikelihood(likelihood: number): boolean {
    return likelihood >= 0 && likelihood <= 1 && !isNaN(likelihood);
  }

  likelihoodToPrice(
    likelihood: number,
    minPrice = 0.01,
    maxPrice = 0.99
  ): number {
    if (!this.isValidLikelihood(likelihood)) {
      throw new Error(`Invalid likelihood: ${likelihood}`);
    }

    const clampedLikelihood = Math.max(
      minPrice,
      Math.min(maxPrice, likelihood)
    );
    return clampedLikelihood;
  }

  priceToTicks(
    targetPrice: number,
    currentTick: number,
    concentrationRange: number = 0.05,
    baseAssetMinPriceTick?: number,
    baseAssetMaxPriceTick?: number
  ): { lowerTick: number; upperTick: number } {
    try {
      const tickSpacing = 200;

      // Interpret concentrationRange as FULL width: [target - range/2, target + range/2]
      const epsilon = 1e-6; // avoid log(0)
      const halfRange = concentrationRange / 2;
      const lowerPrice = Math.max(epsilon, targetPrice - halfRange);
      const upperPrice = Math.min(1 - epsilon, targetPrice + halfRange);

      const rawLowerTick = Math.log(lowerPrice) / Math.log(1.0001);
      const rawUpperTick = Math.log(upperPrice) / Math.log(1.0001);

      let lowerTick = this.nearestUsableTick(
        Math.floor(rawLowerTick),
        tickSpacing
      );
      let upperTick = this.nearestUsableTick(
        Math.ceil(rawUpperTick),
        tickSpacing
      );

      if (
        baseAssetMinPriceTick !== undefined &&
        baseAssetMaxPriceTick !== undefined
      ) {
        const originalLowerTick = lowerTick;
        const originalUpperTick = upperTick;
        lowerTick = Math.max(lowerTick, baseAssetMinPriceTick);
        upperTick = Math.min(upperTick, baseAssetMaxPriceTick);
        if (lowerTick >= upperTick) {
          lowerTick = baseAssetMinPriceTick;
          upperTick = baseAssetMaxPriceTick;
        }
      }

      if (lowerTick >= upperTick) {
        throw new Error(
          `Invalid tick range: lower ${lowerTick} >= upper ${upperTick}`
        );
      }

      return { lowerTick, upperTick };
    } catch (error) {
      if (
        baseAssetMinPriceTick !== undefined &&
        baseAssetMaxPriceTick !== undefined
      ) {
        return {
          lowerTick: baseAssetMinPriceTick,
          upperTick: baseAssetMaxPriceTick,
        };
      }

      const tickSpacing = 200;
      const fallbackRange = Math.floor(1000 / tickSpacing) * tickSpacing;
      const fallbackLower = this.nearestUsableTick(
        currentTick - fallbackRange,
        tickSpacing
      );
      const fallbackUpper = this.nearestUsableTick(
        currentTick + fallbackRange,
        tickSpacing
      );
      return { lowerTick: fallbackLower, upperTick: fallbackUpper };
    }
  }

  private nearestUsableTick(tick: number, tickSpacing: number): number {
    return Math.round(tick / tickSpacing) * tickSpacing;
  }
}
