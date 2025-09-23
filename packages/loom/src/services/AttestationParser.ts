import { decodeAbiParameters, parseAbiParameters } from 'viem';
import { AttestationEvent, ParsedAttestation, EASAttestation } from '../types';

export class AttestationParser {
  
  parseAttestation(event: AttestationEvent): ParsedAttestation | null {
    try {
      console.log(`🔍 [AttestationParser] ===== PARSING ATTESTATION =====`);
      console.log(`📝 [AttestationParser] Attestation ID: ${event.id}`);
      console.log(`👤 [AttestationParser] Attester: ${event.data.attester}`);
      console.log(`⏰ [AttestationParser] Timestamp: ${new Date(event.data.time * 1000).toISOString()}`);
      console.log(`🧱 [AttestationParser] Block: ${event.blockNumber}`);
      console.log(`📜 [AttestationParser] Transaction: ${event.transactionHash}`);
      
      const easData = event.data;
      
      console.log(`🔎 [AttestationParser] Checking if attestation has pre-parsed fields...`);
      
      // If the attestation already has parsed fields, use them
      if (easData.marketAddress && easData.marketId && easData.prediction) {
        console.log(`✅ [AttestationParser] Using pre-parsed fields from EAS data:`);
        console.log(`   • Market Address: ${easData.marketAddress}`);
        console.log(`   • Market ID: ${easData.marketId}`);
        console.log(`   • Prediction (raw): ${easData.prediction}`);
        console.log(`   • Comment: ${easData.comment || 'None'}`);
        
        console.log(`🧮 [AttestationParser] Decoding probability from prediction value...`);
        const likelihood = this.decodeProbability(easData.prediction);
        
        if (likelihood === null) {
          console.warn(`⚠️  [AttestationParser] Could not decode prediction from attestation ${event.id}`);
          return null;
        }

        console.log(`✅ [AttestationParser] Probability decoded: ${likelihood} (${(likelihood * 100).toFixed(2)}%)`);

        const parsedAttestation = {
          eventId: event.id,
          attester: easData.attester,
          marketAddress: easData.marketAddress,
          marketId: easData.marketId,
          likelihood,
          confidence: 0.8, // Default confidence - could be enhanced
          reasoning: easData.comment || 'No reasoning provided',
          timestamp: easData.time * 1000, // Convert to milliseconds
          rawData: easData
        };

        console.log(`🎉 [AttestationParser] Parsed attestation (pre-parsed route):`);
        console.log(`   • Event ID: ${parsedAttestation.eventId}`);
        console.log(`   • Attester: ${parsedAttestation.attester}`);
        console.log(`   • Market Address: ${parsedAttestation.marketAddress}`);
        console.log(`   • Market ID: ${parsedAttestation.marketId}`);
        console.log(`   • Likelihood: ${parsedAttestation.likelihood} (${(parsedAttestation.likelihood * 100).toFixed(2)}%)`);
        console.log(`   • Confidence: ${parsedAttestation.confidence}`);
        console.log(`   • Reasoning: ${parsedAttestation.reasoning}`);
        console.log(`   • Timestamp: ${new Date(parsedAttestation.timestamp).toISOString()}`);

        return parsedAttestation;
      }

      console.log(`🔧 [AttestationParser] No pre-parsed fields found, decoding from raw data...`);
      console.log(`🔍 [AttestationParser] Raw data field: ${easData.data}`);
      
      // Otherwise, decode from the raw data field
      const decoded = this.decodeEASData(easData.data);
      if (!decoded) {
        console.warn(`⚠️  [AttestationParser] Could not decode EAS data for attestation ${event.id}`);
        return null;
      }

      console.log(`✅ [AttestationParser] Raw data decoded successfully:`);
      console.log(`   • Market Address: ${decoded.marketAddress}`);
      console.log(`   • Market ID: ${decoded.marketId.toString()}`);
      console.log(`   • Question ID: ${decoded.questionId}`);
      console.log(`   • Prediction (raw): ${decoded.prediction}`);
      console.log(`   • Comment: ${decoded.comment}`);

      console.log(`🧮 [AttestationParser] Decoding probability from raw prediction value...`);
      const likelihood = this.decodeProbability(decoded.prediction);
      if (likelihood === null) {
        console.warn(`⚠️  [AttestationParser] Could not decode probability from attestation ${event.id}`);
        return null;
      }

      console.log(`✅ [AttestationParser] Probability decoded: ${likelihood} (${(likelihood * 100).toFixed(2)}%)`);

      const parsedAttestation = {
        eventId: event.id,
        attester: easData.attester,
        marketAddress: decoded.marketAddress,
        marketId: decoded.marketId.toString(),
        likelihood,
        confidence: 0.8, // Default confidence
        reasoning: decoded.comment || 'No reasoning provided',
        timestamp: easData.time * 1000,
        rawData: easData
      };

      console.log(`🎉 [AttestationParser] Parsed attestation (raw decode route):`);
      console.log(`   • Event ID: ${parsedAttestation.eventId}`);
      console.log(`   • Attester: ${parsedAttestation.attester}`);
      console.log(`   • Market Address: ${parsedAttestation.marketAddress}`);
      console.log(`   • Market ID: ${parsedAttestation.marketId}`);
      console.log(`   • Likelihood: ${parsedAttestation.likelihood} (${(parsedAttestation.likelihood * 100).toFixed(2)}%)`);
      console.log(`   • Confidence: ${parsedAttestation.confidence}`);
      console.log(`   • Reasoning: ${parsedAttestation.reasoning}`);
      console.log(`   • Timestamp: ${new Date(parsedAttestation.timestamp).toISOString()}`);
      
      console.log(`✅ [AttestationParser] ===== ATTESTATION PARSING COMPLETE =====`);
      return parsedAttestation;
    } catch (error) {
      console.error(`💥 [AttestationParser] Error parsing attestation ${event.id}:`, error);
      return null;
    }
  }

  private decodeEASData(data: string): {
    marketAddress: string;
    marketId: bigint;
    questionId: string;
    prediction: string;
    comment: string;
  } | null {
    try {
      // EAS schema: 'address marketAddress,uint256 marketId,bytes32 questionId,uint160 prediction,string comment'
      const decoded = decodeAbiParameters(
        parseAbiParameters(
          'address marketAddress, uint256 marketId, bytes32 questionId, uint160 prediction, string comment'
        ),
        data as `0x${string}`
      );

      return {
        marketAddress: decoded[0],
        marketId: decoded[1],
        questionId: decoded[2],
        prediction: decoded[3].toString(),
        comment: decoded[4]
      };
    } catch (error) {
      console.error('Failed to decode EAS data:', error);
      return null;
    }
  }

  private decodeProbability(predictionValue: string): number | null {
    try {
      // The prediction value is stored as a uint160 representing sqrtPriceX96
      // From Sage's buildAttestationCalldata:
      // 1. Convert probability (0-100) to price (0-1): price = prediction.probability / 100
      // 2. Calculate sqrtPrice: Math.sqrt(price) * 10^18  
      // 3. Convert to sqrtPriceX96: sqrtPrice * Q96 / 10^18
      
      const predictionBigInt = BigInt(predictionValue);
      const Q96 = BigInt('79228162514264337593543950336'); // 2^96
      
      // Reverse the calculation:
      // sqrtPrice = (predictionBigInt * 10^18) / Q96
      const sqrtPrice = Number((predictionBigInt * BigInt(10 ** 18)) / Q96) / 10 ** 18;
      
      // price = sqrtPrice^2
      const price = sqrtPrice * sqrtPrice;
      
      // Convert back to percentage (0-100) then to decimal (0-1)
      const probabilityPercent = price * 100;
      const likelihood = probabilityPercent / 100;
      
      // Clamp to valid range (0-1)
      const clampedLikelihood = Math.max(0, Math.min(1, likelihood));
      
      console.log(`Decoded prediction: ${predictionValue} -> sqrtPrice: ${sqrtPrice} -> price: ${price} -> likelihood: ${clampedLikelihood}`);
      
      return clampedLikelihood;
    } catch (error) {
      console.error(`Failed to decode probability ${predictionValue}:`, error);
      return null;
    }
  }

  private isValidLikelihood(likelihood: number): boolean {
    return likelihood >= 0 && likelihood <= 1 && !isNaN(likelihood);
  }

  likelihoodToPrice(likelihood: number, minPrice = 0.01, maxPrice = 0.99): number {
    if (!this.isValidLikelihood(likelihood)) {
      throw new Error(`Invalid likelihood: ${likelihood}`);
    }
    
    const clampedLikelihood = Math.max(minPrice, Math.min(maxPrice, likelihood));
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
      console.log(`🎯 [AttestationParser] ===== CONVERTING PRICE TO TICKS =====`);
      console.log(`💰 [AttestationParser] Target price: ${targetPrice}`);
      console.log(`📊 [AttestationParser] Current tick: ${currentTick}`);
      console.log(`📏 [AttestationParser] Concentration range: ${concentrationRange * 100}%`);
      console.log(`🔒 [AttestationParser] Market bounds: ${baseAssetMinPriceTick} to ${baseAssetMaxPriceTick}`);
      
      // Use Foil protocol tick spacing (200)
      const tickSpacing = 200;
      console.log(`⚖️  [AttestationParser] Using Foil protocol tick spacing: ${tickSpacing}`);
      
      // Calculate the price range around our target
      const halfRange = concentrationRange / 2;
      const lowerPrice = targetPrice * (1 - halfRange);
      const upperPrice = targetPrice * (1 + halfRange);
      
      console.log(`📐 [AttestationParser] Price range calculation:`);
      console.log(`   • Half range: ${halfRange} (${halfRange * 100}%)`);
      console.log(`   • Lower price: ${targetPrice} * (1 - ${halfRange}) = ${lowerPrice.toFixed(6)}`);
      console.log(`   • Upper price: ${targetPrice} * (1 + ${halfRange}) = ${upperPrice.toFixed(6)}`);
      
      // Convert prices to ticks using Uniswap V3 formula
      // tick = log(price) / log(1.0001)
      console.log(`🧮 [AttestationParser] Converting prices to ticks using formula: tick = log(price) / log(1.0001)`);
      
      const rawLowerTick = Math.log(lowerPrice) / Math.log(1.0001);
      const rawUpperTick = Math.log(upperPrice) / Math.log(1.0001);
      
      console.log(`🔢 [AttestationParser] Raw tick calculations:`);
      console.log(`   • log(${lowerPrice.toFixed(6)}) / log(1.0001) = ${rawLowerTick.toFixed(2)}`);
      console.log(`   • log(${upperPrice.toFixed(6)}) / log(1.0001) = ${rawUpperTick.toFixed(2)}`);
      
      let lowerTick = this.nearestUsableTick(Math.floor(rawLowerTick), tickSpacing);
      let upperTick = this.nearestUsableTick(Math.ceil(rawUpperTick), tickSpacing);
      
      console.log(`📊 [AttestationParser] Tick spacing adjustment:`);
      console.log(`   • Floor(${rawLowerTick.toFixed(2)}) → ${Math.floor(rawLowerTick)} → ${lowerTick} (nearest usable)`);
      console.log(`   • Ceil(${rawUpperTick.toFixed(2)}) → ${Math.ceil(rawUpperTick)} → ${upperTick} (nearest usable)`);
      
      // Clamp ticks to market bounds if provided
      if (baseAssetMinPriceTick !== undefined && baseAssetMaxPriceTick !== undefined) {
        console.log(`🔒 [AttestationParser] Applying market bounds clamping...`);
        
        const originalLowerTick = lowerTick;
        const originalUpperTick = upperTick;
        
        lowerTick = Math.max(lowerTick, baseAssetMinPriceTick);
        upperTick = Math.min(upperTick, baseAssetMaxPriceTick);
        
        console.log(`📊 [AttestationParser] Clamping results:`);
        console.log(`   • Lower: ${originalLowerTick} → ${lowerTick} (max with ${baseAssetMinPriceTick})`);
        console.log(`   • Upper: ${originalUpperTick} → ${upperTick} (min with ${baseAssetMaxPriceTick})`);
        
        // Ensure we still have a valid range after clamping
        if (lowerTick >= upperTick) {
          console.log(`⚠️  [AttestationParser] Clamping resulted in invalid range (${lowerTick} >= ${upperTick})`);
          // If clamping results in invalid range, use the full market range
          lowerTick = baseAssetMinPriceTick;
          upperTick = baseAssetMaxPriceTick;
          console.log(`🔧 [AttestationParser] Using full market range: ${lowerTick} to ${upperTick}`);
        }
      }
      
      // Ensure ticks are valid and in correct order
      if (lowerTick >= upperTick) {
        throw new Error(`Invalid tick range: lower ${lowerTick} >= upper ${upperTick}`);
      }
      
      // Convert final ticks back to prices for verification
      const finalLowerPrice = Math.pow(1.0001, lowerTick);
      const finalUpperPrice = Math.pow(1.0001, upperTick);
      const tickRange = upperTick - lowerTick;
      
      console.log(`✅ [AttestationParser] Final tick calculation results:`);
      console.log(`   • Lower tick: ${lowerTick} (price: ${finalLowerPrice.toFixed(6)})`);
      console.log(`   • Upper tick: ${upperTick} (price: ${finalUpperPrice.toFixed(6)})`);
      console.log(`   • Tick range: ${tickRange} ticks`);
      console.log(`   • Price range: ${finalLowerPrice.toFixed(6)} - ${finalUpperPrice.toFixed(6)}`);
      console.log(`   • Tick spacing: ${tickSpacing}`);
      console.log(`🎯 [AttestationParser] ===== PRICE TO TICKS CONVERSION COMPLETE =====`);
      
      return { lowerTick, upperTick };
    } catch (error) {
      console.error(`💥 [AttestationParser] Error converting price to ticks:`, error);
      
      // Fallback to market bounds if available, otherwise use default range
      if (baseAssetMinPriceTick !== undefined && baseAssetMaxPriceTick !== undefined) {
        console.log(`🔧 [AttestationParser] Using market bounds as fallback: ${baseAssetMinPriceTick} to ${baseAssetMaxPriceTick}`);
        return {
          lowerTick: baseAssetMinPriceTick,
          upperTick: baseAssetMaxPriceTick
        };
      }
      
      // Fallback to a default range around current tick
      const tickSpacing = 200;
      const fallbackRange = Math.floor(1000 / tickSpacing) * tickSpacing;
      
      const fallbackLower = this.nearestUsableTick(currentTick - fallbackRange, tickSpacing);
      const fallbackUpper = this.nearestUsableTick(currentTick + fallbackRange, tickSpacing);
      
      console.log(`🔧 [AttestationParser] Using default fallback range: ${fallbackLower} to ${fallbackUpper}`);
      
      return {
        lowerTick: fallbackLower,
        upperTick: fallbackUpper
      };
    }
  }

  private nearestUsableTick(tick: number, tickSpacing: number): number {
    // Round tick to nearest valid tick based on spacing
    return Math.round(tick / tickSpacing) * tickSpacing;
  }
}