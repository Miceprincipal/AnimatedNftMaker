"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RarityCalculator = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class RarityCalculator {
    constructor() {
        this.traitFrequencies = new Map();
        this.combinationFrequencies = new Map();
        this.totalCombinations = 0;
    }
    calculateRarity(traits) {
        const traitRarities = traits.map(trait => this.calculateTraitRarity(trait));
        const overallRarity = this.calculateOverallRarity(traitRarities);
        return {
            overall: overallRarity,
            traits: traitRarities,
            rank: 0, // Will be calculated after all combinations are generated
            percentile: 0 // Will be calculated after all combinations are generated
        };
    }
    recordCombination(combination) {
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
        logger_1.default.debug('Recorded combination for rarity calculation', {
            combinationId: combination.id,
            totalCombinations: this.totalCombinations
        });
    }
    calculateTraitRarity(trait) {
        const key = `${trait.type}:${trait.name}`;
        const frequency = this.traitFrequencies.get(key) || 0;
        if (this.totalCombinations === 0) {
            return 0;
        }
        return frequency / this.totalCombinations;
    }
    calculateOverallRarity(traitRarities) {
        if (traitRarities.length === 0) {
            return 0;
        }
        // Calculate geometric mean of trait rarities
        const product = traitRarities.reduce((acc, rarity) => acc * rarity, 1);
        return Math.pow(product, 1 / traitRarities.length);
    }
    calculateFinalRarities(combinations) {
        // Calculate ranks and percentiles for all combinations
        const sortedCombinations = [...combinations].sort((a, b) => b.rarity.overall - a.rarity.overall);
        sortedCombinations.forEach((combination, index) => {
            combination.rarity.rank = index + 1;
            combination.rarity.percentile = ((index + 1) / combinations.length) * 100;
        });
        logger_1.default.info('Final rarity calculation completed', {
            totalCombinations: combinations.length,
            uniqueTraits: this.traitFrequencies.size
        });
    }
    getTraitStats() {
        const stats = new Map();
        for (const [key, frequency] of this.traitFrequencies) {
            const rarity = this.totalCombinations > 0 ? frequency / this.totalCombinations : 0;
            stats.set(key, { frequency, rarity });
        }
        return stats;
    }
    getCombinationStats() {
        const stats = new Map();
        for (const [key, frequency] of this.combinationFrequencies) {
            const rarity = this.totalCombinations > 0 ? frequency / this.totalCombinations : 0;
            stats.set(key, { frequency, rarity });
        }
        return stats;
    }
    reset() {
        this.traitFrequencies.clear();
        this.combinationFrequencies.clear();
        this.totalCombinations = 0;
        logger_1.default.debug('Rarity calculator reset');
    }
}
exports.RarityCalculator = RarityCalculator;
//# sourceMappingURL=RarityCalculator.js.map