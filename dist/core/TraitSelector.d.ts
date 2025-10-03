import { TraitCombination } from '../types/traits';
import { GeneratorConfig } from '../types/config';
import { LayerProcessor } from './LayerProcessor';
export declare class TraitSelector {
    private usedCombinations;
    private rarityTracker;
    private config;
    private layerProcessor;
    private traitCache;
    constructor(config: GeneratorConfig, layerProcessor: LayerProcessor);
    private getTraitKeys;
    private getTraitNameFromConfigKey;
    generateCombinations(count: number): Promise<TraitCombination[]>;
    private generateSingleCombination;
    /**
     * 1. Incompatibility Rules: Filters out traits that conflict with any already selected trait.
     * This implements a clean, bidirectional check.
     */
    private applyIncompatibilityRules;
    /**
     * 2. Dependent Traits: Checks if a selected trait triggers a dependency that must be added.
     * Fixes the issue by resolving the full Trait object.
     */
    private applyDependentTraits;
    /**
     * 3. Exclusive Group Rules: Filters out traits that belong to an exclusive group
     * if another trait from that same group has already been selected.
     */
    private applyExclusiveGroupRules;
    /**
     * 4. Conditional Rarity: Adjusts the weight of available traits based on
     * what has already been selected.
     */
    private applyConditionalRarity;
    /**
     * 5. Forced Pairings: Checks if a selected trait forces the selection of a specific trait
     * for the CURRENT layer being processed.
     */
    private applyForcedPairings;
    private weightedRandomSelect;
    private createTraitCombination;
    private generateMetadata;
    private getCombinationKey;
}
//# sourceMappingURL=TraitSelector.d.ts.map