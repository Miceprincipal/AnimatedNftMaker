import { GeneratorError, ErrorType } from '../types/errors';
import { Trait, TraitCombination } from '../types/traits';
import { GeneratorConfig } from '../types/config';
import { LayerProcessor } from './LayerProcessor';
import { RarityCalculator } from './RarityCalculator';
import logger from '../utils/logger';

// NOTE: This implementation assumes LayerProcessor has a method:
// getTraitByKeys(type: string, name: string): Trait | undefined
// to resolve dependent and forced traits into full Trait objects.

export class TraitSelector {
  private usedCombinations: Set<string> = new Set();
  private rarityTracker: RarityCalculator;
  private config: GeneratorConfig;
  private layerProcessor: LayerProcessor;
  private traitCache: Map<string, Trait[]> = new Map();

  constructor(config: GeneratorConfig, layerProcessor: LayerProcessor) {
    this.config = config;
    this.layerProcessor = layerProcessor;
    this.rarityTracker = new RarityCalculator();
  }

  // Helper to normalize trait names (removes #XX suffix and generates keys)
  private getTraitKeys(trait: Trait): { nameOnly: string, withType: string } | null {
    // Splits by '#' and takes the first part, then trims whitespace
    // Added (trait.name || '') for safety against possible undefined/null
    const cleanName = (trait.name || '').split('#')[0]?.trim() || ''; 
    if (!cleanName) return null;
    return { 
      nameOnly: cleanName,
      withType: `${trait.type}:${cleanName}`
    };
  }
  
  // Helper to safely extract the name part of a config key (e.g., 'Type:Name' -> 'Name' or 'Name' -> 'Name')
  private getTraitNameFromConfigKey(key: string): string {
      const parts = key.split(':');
      // If there is a colon, return the part after it; otherwise, return the whole key.
      return parts.length > 1 ? (parts[1] || '').trim() : (parts[0] || '').trim();
  }

  // --- Main Generator Loop (Fixed Flow) ---
  async generateCombinations(count: number): Promise<TraitCombination[]> {
    const combinations: TraitCombination[] = [];
    let attempts = 0;
    let duplicates = 0;

    // Generate combinations in parallel batches for massive speedup
    const batchSize = Math.min(50, count);
    const maxAttempts = count * 10;

    while (combinations.length < count && attempts < maxAttempts) {
      const remaining = count - combinations.length;
      const currentBatchSize = Math.min(batchSize, remaining);
      
      // Generate batch in parallel
      const batchPromises = [];
      for (let i = 0; i < currentBatchSize; i++) {
        batchPromises.push(this.generateSingleCombination(combinations.length + i + 1));
      }
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process results
      for (const result of batchResults) {
        attempts++;
        
        if (result.status === 'fulfilled') {
          const combination = result.value;
          const key = this.getCombinationKey(combination);
          
          if (!this.usedCombinations.has(key)) {
            this.usedCombinations.add(key);
            combinations.push(combination);
            // Skip progress tracking for massive speedup - it's just file I/O
          } else {
            duplicates++;
          }
        } else {
          // Check for retryable errors
          const error = result.reason;
          if (error instanceof GeneratorError && error.recoverable) {
            // Soft failure, continue
            continue;
          }
          logger.error(`Fatal error during generation attempt ${attempts}:`, error);
        }
      }
    }

    if (combinations.length < count) {
      logger.error(`Could only generate ${combinations.length} unique combinations out of ${count} requested after ${attempts} attempts.`);
    }

    // Complete progress tracking
    logger.info(`Trait combination generation completed`, {
      generated: combinations.length,
      attempts,
      duplicates
    });
    return combinations;
  }

  private async generateSingleCombination(id: number): Promise<TraitCombination> {
    let selectedTraits: Trait[] = [];
     // Use the correct config property name
     const layerOrder = this.config.trait_processing_order;

    for (const traitType of layerOrder) {
        
      // 1. Get all base traits for the layer (with caching)
      let traits = this.traitCache.get(traitType);
      if (!traits) {
        traits = await this.layerProcessor.getAvailableTraits(traitType);
        this.traitCache.set(traitType, traits);
      }

      // 2. Apply Forced Pairings (MUST happen before all other rules)
      const forcedTrait = await this.applyForcedPairings(traitType, selectedTraits);
      if (forcedTrait) {
          selectedTraits.push(forcedTrait);
          continue; // Skip the rest of the checks and selection for this layer
      }

      // 3. Apply Dependent Traits (Adds traits for potentially other layers, but may fulfill current)
      const dependentTraits = await this.applyDependentTraits(selectedTraits);
      if (dependentTraits.length > 0) {
          // Add all resolved dependent traits to the selected list
          selectedTraits.push(...dependentTraits); 

          // Check if the current layer (traitType) was fulfilled by a dependent trait
          if (dependentTraits.some(t => t.type === traitType)) {
              continue; // Layer fulfilled, skip selection
          }
      }

      // 4. Apply Incompatibility Rules
      traits = this.applyIncompatibilityRules(traits, selectedTraits);

      // 5. Apply Exclusive Group Rules
      traits = this.applyExclusiveGroupRules(traitType, traits, selectedTraits);

      // 6. Apply Conditional Rarity (Modifies weights based on selected traits)
      traits = this.applyConditionalRarity(traits, selectedTraits);

       // Handle cases where all traits were filtered out (likely due to too many rules)
       if (traits.length === 0) {
           throw new GeneratorError(
             ErrorType.PROCESSING_ERROR, 
             `All traits filtered out for layer ${traitType}. Retrying combination.`,
             { recoverable: true }
           );
       }

      // 7. Perform Weighted Random Selection
      const selectedTrait = this.weightedRandomSelect(traits);
      selectedTraits.push(selectedTrait);
    }

    return this.createTraitCombination(id, selectedTraits);
  }

  // --- RULE IMPLEMENTATIONS ---

  /**
   * 1. Incompatibility Rules: Filters out traits that conflict with any already selected trait.
   * This implements a clean, bidirectional check.
   */
  private applyIncompatibilityRules(availableTraits: Trait[], selectedTraits: Trait[]): Trait[] {
    if (!this.config.incompatible_traits) {
        return availableTraits;
    }

    return availableTraits.filter(trait => {
        const traitKeys = this.getTraitKeys(trait);
        if (!traitKeys) return true; // Skip if no valid keys

        const isExcluded = selectedTraits.some(selected => {
            const selectedKeys = this.getTraitKeys(selected);
            if (!selectedKeys) return false; // Skip if no valid keys

            // A. Get rules for the SELECTED trait
            const selectedRules = this.config.incompatible_traits![selectedKeys.withType] ||
                                  this.config.incompatible_traits![selectedKeys.nameOnly];
            
            // B. Get rules for the AVAILABLE trait (trait currently being filtered)
            const availableRules = this.config.incompatible_traits![traitKeys.withType] ||
                                   this.config.incompatible_traits![traitKeys.nameOnly];

            // Check 1 (SELECTED -> AVAILABLE): Does the SELECTED trait list the AVAILABLE trait?
            const check1 = selectedRules && 
                           (selectedRules.includes(traitKeys.withType) || 
                            selectedRules.includes(traitKeys.nameOnly));
            
            // Check 2 (AVAILABLE -> SELECTED): Does the AVAILABLE trait list the SELECTED trait?
            const check2 = availableRules && 
                           (availableRules.includes(selectedKeys.withType) || 
                            availableRules.includes(selectedKeys.nameOnly));

            // If either direction shows incompatibility, exclude the trait
            return check1 || check2;
        });

        return !isExcluded;
    });
  }

  /**
   * 2. Dependent Traits: Checks if a selected trait triggers a dependency that must be added.
   * Fixes the issue by resolving the full Trait object.
   */
  private async applyDependentTraits(selectedTraits: Trait[]): Promise<Trait[]> {
    const dependentTraits: Trait[] = [];

    if (!this.config.dependent_traits) {
        return dependentTraits;
    }

    for (const [triggerKey, dependentKey] of Object.entries(this.config.dependent_traits)) {
        
        // 1. Check if the trigger trait is currently selected
        const triggerIsSelected = selectedTraits.some(t => {
            const keys = this.getTraitKeys(t);
            if (!keys) return false;
            // Used getTraitNameFromConfigKey for safe string splitting
            return keys.withType === triggerKey || keys.nameOnly === this.getTraitNameFromConfigKey(triggerKey);
        });

        if (triggerIsSelected) {
            const dependentParts = dependentKey.split(':');
            const dependentType = dependentParts[0];
            const dependentName = dependentParts.length > 1 ? dependentParts[1] : dependentParts[0];

             // 2. Check if the dependent trait is already selected (to prevent duplicates)
             const isAlreadySelected = selectedTraits.some(t => {
                 const keys = this.getTraitKeys(t);
                 if (!keys) return false;
                 // Check against Type:Name and Name only
                 return keys.withType === dependentKey || keys.nameOnly === dependentName;
             });
            
            // 3. Only proceed if the dependent trait is not yet selected
            if (!isAlreadySelected) {
                 // Get the actual, resolved Trait object from the layer processor
                 const dependentTraits = await this.layerProcessor.getAvailableTraits(dependentType || '');
                 const dependentTrait = dependentTraits.find(t => 
                   t.name.split('#')[0] === dependentName
                 );
                 
                 if (dependentTrait) {
                   dependentTraits.push(dependentTrait);
                   logger.debug(`Dependent trait added: ${dependentType}:${dependentName}`);
                 }
            }
        }
    }
    
    return dependentTraits;
  }

  /**
   * 3. Exclusive Group Rules: Filters out traits that belong to an exclusive group 
   * if another trait from that same group has already been selected.
   */
   private applyExclusiveGroupRules(traitType: string, availableTraits: Trait[], selectedTraits: Trait[]): Trait[] {
     if (!this.config.exclusive_groups) {
       return availableTraits;
     }

     // Find the group that contains this trait type
     const group = Object.entries(this.config.exclusive_groups).find(([_, traits]) => 
       traits.includes(traitType)
     )?.[1];
     
     if (!group) {
       return availableTraits;
     }

    // Check if ANY selected trait belongs to the exclusive group
    const selectedFromGroup = selectedTraits.some(selected => {
        const keys = this.getTraitKeys(selected);
        if (!keys) return false;
        return group.includes(keys.nameOnly) || group.includes(keys.withType);
    });

    if (selectedFromGroup) {
        // If an exclusive trait is already selected, filter out all other traits 
        // that are also part of that exclusive group from the available list.
        return availableTraits.filter(trait => {
            const keys = this.getTraitKeys(trait);
            if (!keys) return true;
            return !group.includes(keys.nameOnly) && !group.includes(keys.withType);
        });
    }

    return availableTraits;
  }

  /**
   * 4. Conditional Rarity: Adjusts the weight of available traits based on 
   * what has already been selected.
   */
  private applyConditionalRarity(availableTraits: Trait[], selectedTraits: Trait[]): Trait[] {
    if (!this.config.conditional_rarity) {
        return availableTraits;
    }

    // Create a deep clone to safely modify weights for this selection pass
    const adjustedTraits: Trait[] = JSON.parse(JSON.stringify(availableTraits));
    
    // Iterate over all conditional rarity rules
    for (const [conditionKey, adjustments] of Object.entries(this.config.conditional_rarity)) {
         // 1. Check if the condition (trigger trait) is selected
         const conditionIsMet = selectedTraits.some(selected => {
             const keys = this.getTraitKeys(selected);
             if (!keys) return false;
             // Used getTraitNameFromConfigKey for safe string splitting
             return keys.withType === conditionKey || keys.nameOnly === this.getTraitNameFromConfigKey(conditionKey);
         });

        if (conditionIsMet) {
            // 2. Apply all adjustments defined under this condition
            for (const [targetKey, newWeight] of Object.entries(adjustments)) {
                const [targetType, targetName] = targetKey.split(':');

                // Find the target trait in the adjusted list
                const targetTrait = adjustedTraits.find(trait => {
                    const keys = this.getTraitKeys(trait);
                    if (!keys) return false;
                    // Match either by full key or name only AND ensure type matches
                    return keys.withType === targetKey || (keys.nameOnly === targetName && trait.type === targetType);
                });

                if (targetTrait) {
                    // Adjust the weight (setting to 0 effectively excludes it)
                    targetTrait.weight = newWeight;
                    logger.debug(`Conditional Rarity: ${targetKey} weight set to ${newWeight} due to selection of ${conditionKey}`);
                }
            }
        }
    }
    
    return adjustedTraits;
  }
  
  // --- EXISTING/PLACEHOLDER METHODS (Included for completeness) ---

  /**
   * 5. Forced Pairings: Checks if a selected trait forces the selection of a specific trait 
   * for the CURRENT layer being processed.
   */
  private async applyForcedPairings(traitType: string, selectedTraits: Trait[]): Promise<Trait | null> {
    if (!this.config.forced_pairings) {
        return null;
    }

    for (const [triggerKey, forcedKey] of Object.entries(this.config.forced_pairings)) {
        
         // 1. Check if the trigger trait is currently selected
         const triggerIsSelected = selectedTraits.some(selected => {
             const keys = this.getTraitKeys(selected);
             if (!keys) return false;
             // Used getTraitNameFromConfigKey for safe string splitting
             return keys.withType === triggerKey || keys.nameOnly === this.getTraitNameFromConfigKey(triggerKey);
         });

        if (triggerIsSelected) {
            
            // Explicitly split to avoid compiler confusion on destructuring array size
            const forcedParts = String(forcedKey).split(':');
            const forcedType = forcedParts[0];
            const forcedName = forcedParts.length > 1 ? forcedParts[1] : forcedParts[0];

            // 2. Check if the forced trait is for the CURRENT layer being processed
            if (forcedType === traitType) {
                
                 // 3. Check if the forced trait is already selected (prevent duplicates)
                 const isAlreadySelected = selectedTraits.some(t => {
                     const keys = this.getTraitKeys(t);
                     if (!keys) return false;
                     return keys.withType === String(forcedKey) || keys.nameOnly === forcedName;
                 });
                
                if (!isAlreadySelected) {
                    // 4. Get the actual, resolved Trait object
                    const availableTraits = await this.layerProcessor.getAvailableTraits(traitType);
                    const forcedTrait = availableTraits.find(t => 
                      t.name.split('#')[0] === forcedName
                    );
                    
                    if (forcedTrait) {
                      logger.debug(`Forced pairing applied for layer ${traitType}: ${forcedKey}`);
                      return forcedTrait; // Return the trait for the current layer
                    }
                }
            }
        }
    }
    
    return null; // No forced pairing found for this specific traitType
  }

  private weightedRandomSelect(traits: Trait[]): Trait {
    if (traits.length === 0) {
      throw new GeneratorError(
        ErrorType.PROCESSING_ERROR,
        'No traits available for selection'
      );
    }

    if (traits.length === 1) {
      return traits[0]!;
    }

    const totalWeight = traits.reduce((sum, trait) => sum + trait.weight, 0);
    let random = Math.random() * totalWeight;

    for (const trait of traits) {
      random -= trait.weight;
      if (random <= 0) {
        return trait;
      }
    }

    // Fallback to last trait (should only happen due to floating point precision errors)
    return traits[traits.length - 1]!;
  }

  private createTraitCombination(id: number, traits: Trait[]): TraitCombination {
    const rarity = this.rarityTracker.calculateRarity(traits);
    
    return {
      id,
      traits,
      rarity,
      metadata: this.generateMetadata(id, traits),
      generatedAt: new Date()
    };
  }

  private generateMetadata(id: number, traits: Trait[]): { ethereum: any; solana: any } {
    const attributes = traits.map(trait => ({
      trait_type: trait.type,
      value: trait.name.split('#')[0],
      rarity: trait.rarity
    }));

    const format = this.config.generation.output_format;
    let imageUrl: string;
    let animationUrl: string | undefined;
    if (format === 'gif') {
      imageUrl = `${this.config.metadata.image_base_uri}${id}.gif`;
      animationUrl = imageUrl; // prefer explicit animation_url for platforms that autoplay from this field
    } else {
      imageUrl = `${this.config.metadata.image_base_uri}${id}.png`;
      animationUrl = `${this.config.metadata.animation_base_uri}${id}.mp4`;
    }

    // Generate Ethereum metadata
    const ethereum: any = {
      name: `${this.config.metadata.name_prefix} #${id}`,
      description: this.config.metadata.description,
      external_url: this.config.metadata.external_url,
      image: imageUrl,
      attributes
    };
    if (animationUrl) ethereum.animation_url = animationUrl;
    if (this.config.metadata.background_color) {
      ethereum.background_color = this.config.metadata.background_color;
    }

    // Generate Solana metadata using config values
    const solanaConfig = this.config.metadata.solana || {};
    const configCreators = (solanaConfig.properties && solanaConfig.properties.creators) || [];
    const finalCreators = Array.isArray(configCreators) ? configCreators : [];
    const solana: any = {
      name: `${this.config.metadata.name_prefix} #${id}`,
      description: this.config.metadata.description,
      image: imageUrl,
      attributes,
      symbol: solanaConfig.symbol || 'NFT',
      seller_fee_basis_points: solanaConfig.seller_fee_basis_points || 0,
      collection: solanaConfig.collection || { name: 'NFT Collection', family: 'NFT' },
      properties: {
        category: (solanaConfig.properties && solanaConfig.properties.category) || 'image',
        creators: finalCreators,
        files: [
          { uri: imageUrl, type: format === 'gif' ? 'image/gif' : 'image/png' },
          ...(animationUrl && format !== 'gif' ? [{ uri: animationUrl, type: 'video/mp4' }] : [])
        ]
      }
    };
    if (animationUrl) solana.animation_url = animationUrl;
    // Warn if royalties are set but no creators provided
    try {
      const fee = solana.seller_fee_basis_points || 0;
      const creators = (solana.properties && solana.properties.creators) || [];
      if (fee > 0 && (!Array.isArray(creators) || creators.length === 0)) {
        logger.warn('Solana royalties set but creators array is empty. Add at least one creator for royalties to be tracked.');
      }
    } catch (_) {}

    return { ethereum, solana };
  }
  
  private getCombinationKey(combination: TraitCombination): string {
    return combination.traits.map(t => `${t.type}:${t.name.split('#')[0]}`).sort().join('|');
  }
}

