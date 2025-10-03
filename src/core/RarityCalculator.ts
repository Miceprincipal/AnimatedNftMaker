import { Trait, RarityScore } from '../types/traits';
import { TraitCombination } from '../types/traits';
import logger from '../utils/logger';

export class RarityCalculator {
  private traitFrequencies: Map<string, number> = new Map();
  private combinationFrequencies: Map<string, number> = new Map();
  private totalCombinations = 0;

  calculateRarity(traits: Trait[]): RarityScore {
    const traitRarities = traits.map(trait => this.calculateTraitRarity(trait));
    const overallRarity = this.calculateOverallRarity(traitRarities);
    
    return {
      overall: overallRarity,
      traits: traitRarities,
      rank: 0, // Will be calculated after all combinations are generated
      percentile: 0 // Will be calculated after all combinations are generated
    };
  }

  recordCombination(combination: TraitCombination): void {
    this.totalCombinations++;
    
    // Record trait frequencies
    for (const trait of combination.traits) {
      const key = `${trait.type}:${trait.name}`;
      const current = this.traitFrequencies.get(key) || 0;
      this.traitFrequencies.set(key, current + 1);
    }

    // Record combination frequency
    const combinationKey = combination.traits
      .map(trait => `${trait.type}:${trait.name}`)
      .sort()
      .join('|');
    
    const current = this.combinationFrequencies.get(combinationKey) || 0;
    this.combinationFrequencies.set(combinationKey, current + 1);

    logger.debug('Recorded combination for rarity calculation', {
      combinationId: combination.id,
      totalCombinations: this.totalCombinations
    });
  }

  private calculateTraitRarity(trait: Trait): number {
    const key = `${trait.type}:${trait.name}`;
    const frequency = this.traitFrequencies.get(key) || 0;
    
    if (this.totalCombinations === 0) {
      return 0;
    }

    return frequency / this.totalCombinations;
  }

  private calculateOverallRarity(traitRarities: number[]): number {
    if (traitRarities.length === 0) {
      return 0;
    }

    // Calculate geometric mean of trait rarities
    const product = traitRarities.reduce((acc, rarity) => acc * rarity, 1);
    return Math.pow(product, 1 / traitRarities.length);
  }

  calculateFinalRarities(combinations: TraitCombination[]): void {
    // Calculate ranks and percentiles for all combinations
    const sortedCombinations = [...combinations].sort((a, b) => 
      b.rarity.overall - a.rarity.overall
    );

    sortedCombinations.forEach((combination, index) => {
      combination.rarity.rank = index + 1;
      combination.rarity.percentile = ((index + 1) / combinations.length) * 100;
    });

    logger.info('Final rarity calculation completed', {
      totalCombinations: combinations.length,
      uniqueTraits: this.traitFrequencies.size
    });
  }

  getTraitStats(): Map<string, { frequency: number; rarity: number }> {
    const stats = new Map<string, { frequency: number; rarity: number }>();
    
    for (const [key, frequency] of this.traitFrequencies) {
      const rarity = this.totalCombinations > 0 ? frequency / this.totalCombinations : 0;
      stats.set(key, { frequency, rarity });
    }

    return stats;
  }

  getCombinationStats(): Map<string, { frequency: number; rarity: number }> {
    const stats = new Map<string, { frequency: number; rarity: number }>();
    
    for (const [key, frequency] of this.combinationFrequencies) {
      const rarity = this.totalCombinations > 0 ? frequency / this.totalCombinations : 0;
      stats.set(key, { frequency, rarity });
    }

    return stats;
  }

  reset(): void {
    this.traitFrequencies.clear();
    this.combinationFrequencies.clear();
    this.totalCombinations = 0;
    
    logger.debug('Rarity calculator reset');
  }
}

