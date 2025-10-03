import { Trait, RarityScore } from '../types/traits';
import { TraitCombination } from '../types/traits';
export declare class RarityCalculator {
    private traitFrequencies;
    private combinationFrequencies;
    private totalCombinations;
    calculateRarity(traits: Trait[]): RarityScore;
    recordCombination(combination: TraitCombination): void;
    private calculateTraitRarity;
    private calculateOverallRarity;
    calculateFinalRarities(combinations: TraitCombination[]): void;
    getTraitStats(): Map<string, {
        frequency: number;
        rarity: number;
    }>;
    getCombinationStats(): Map<string, {
        frequency: number;
        rarity: number;
    }>;
    reset(): void;
}
//# sourceMappingURL=RarityCalculator.d.ts.map