import fs from 'fs-extra';
import path from 'path';
import { GeneratorError, ErrorType } from '../types/errors';
import { TraitHierarchy, ValidationResult, Trait } from '../types/traits';
import { VALIDATION_RULES } from '../constants/validation';
import logger from '../utils/logger';

export class LayerProcessor {
  private layersPath: string;
  private validationResult: ValidationResult | null = null;
  private requiredFrameCount: number = 12; // Default, will be set from config
  private traitCache: Map<string, Trait[]> = new Map();
  private hierarchy: TraitHierarchy = {};

  constructor(layersPath: string, requiredFrameCount?: number) {
    this.layersPath = layersPath;
    if (requiredFrameCount) {
      this.requiredFrameCount = requiredFrameCount;
    }
  }

  async validateStructure(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalTraits = 0;
    let totalFrames = 0;
    const traitTypes: string[] = [];

    try {
      if (!await fs.pathExists(this.layersPath)) {
        throw new GeneratorError(
          ErrorType.VALIDATION_ERROR,
          `Layers directory does not exist: ${this.layersPath}`
        );
      }

      const hierarchy = await this.parseTraitHierarchy(this.layersPath, errors);
      this.hierarchy = hierarchy; // Cache the hierarchy
    const stats = this.calculateStats(hierarchy);
    
    totalTraits = stats.totalTraits;
    totalFrames = stats.totalFrames;
    traitTypes.push(...stats.traitTypes);
    
    logger.info('Layer structure stats', {
      totalTraits,
      totalFrames,
      traitTypes: traitTypes.length
    });

      // Frame count consistency is now handled by looping frames to required count
      // No need to validate frame count consistency since we normalize all traits to the same count

      // Validate dimensions
      if (stats.dimensions.length > 0) {
        const uniqueDimensions = [...new Set(stats.dimensions.map(d => `${d.width}x${d.height}`))];
        if (uniqueDimensions.length > 1) {
          warnings.push(`Inconsistent dimensions: ${uniqueDimensions.join(', ')}`);
        }
      }

    } catch (error) {
      if (error instanceof GeneratorError) {
        throw error;
      }
      errors.push(`Unexpected error during validation: ${error}`);
    }

    const isValid = errors.length === 0;
    
    this.validationResult = {
      isValid,
      errors,
      warnings,
      stats: {
        totalTraits,
        totalFrames,
        traitTypes
      }
    };

    logger.info('Layer structure validation completed', {
      isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
      totalTraits,
      totalFrames
    });

    return this.validationResult;
  }

  async parseTraitHierarchy(rootPath: string, errors: string[]): Promise<TraitHierarchy> {
    const hierarchy: TraitHierarchy = {};
    
    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });
      logger.debug('Parsing trait hierarchy', { rootPath, entryCount: entries.length });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          errors.push(`Invalid structure: ${entry.name} is a file in trait type directory`);
          continue;
        }

        const traitType = entry.name;
        const traitTypePath = path.join(rootPath, traitType);
        
        const traits = await this.parseTraitType(traitTypePath, errors);
        hierarchy[traitType] = traits;
        logger.debug('Added trait type to hierarchy', { traitType, traitCount: Object.keys(traits).length });
      }
      
      logger.debug('Trait hierarchy built', { traitTypeCount: Object.keys(hierarchy).length, traitTypes: Object.keys(hierarchy) });
    } catch (error) {
      errors.push(`Error reading trait type directory: ${error}`);
    }

    return hierarchy;
  }

  private async parseTraitType(traitTypePath: string, errors: string[]): Promise<any> {
    const traits: any = {};
    
    try {
      const entries = await fs.readdir(traitTypePath, { withFileTypes: true });
      logger.debug('Parsing trait type directory', { traitTypePath, entryCount: entries.length });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          errors.push(`Invalid structure: ${entry.name} is a file in trait directory`);
          continue;
        }

        const traitName = entry.name;
        const traitPath = path.join(traitTypePath, traitName);
        
        // Parse weight from folder name
        const weightMatch = traitName.match(/^(.+)\((\d+)\)$/);
        const cleanName = weightMatch ? weightMatch[1] : traitName;
        const weight = weightMatch ? parseInt(weightMatch[2]!) : 1;

        if (weight < VALIDATION_RULES.MIN_WEIGHT || weight > VALIDATION_RULES.MAX_WEIGHT) {
          errors.push(`Invalid weight for ${traitName}: ${weight} (must be between ${VALIDATION_RULES.MIN_WEIGHT} and ${VALIDATION_RULES.MAX_WEIGHT})`);
        }

        // Check if this is a leaf directory (contains images)
        const hasImages = await this.hasImageFiles(traitPath);
        const hasSubdirs = await this.hasSubdirectories(traitPath);

        if (hasImages && hasSubdirs) {
          errors.push(`Invalid structure: ${traitName} contains both files and subdirectories`);
          continue;
        }

        if (hasImages) {
          // Leaf directory - contains frames
          const originalFrames = await this.getImageFiles(traitPath);
          
          // Validate for actual problems (double extensions, etc.) but allow single files
          const validationErrors = await this.validateLeafDirectory(traitPath, traitName, originalFrames);
          errors.push(...validationErrors);
          
          const frames = this.loopFramesToRequiredCount(originalFrames);
          logger.debug('Found leaf trait', { 
            traitName, 
            cleanName, 
            originalFrameCount: originalFrames.length, 
            finalFrameCount: frames.length,
            requiredFrameCount: this.requiredFrameCount
          });
          traits[cleanName!] = {
            weight,
            path: traitPath,
            frames
          };
        } else if (hasSubdirs) {
          // Intermediate directory - recurse
          logger.debug('Found intermediate trait', { traitName, cleanName });
          traits[cleanName!] = {
            weight,
            path: traitPath,
            frames: [],
            subTraits: await this.parseTraitType(traitPath, errors)
          };
        } else {
          errors.push(`Empty trait directory: ${traitName}`);
        }
      }
      
      logger.debug('Parsed trait type', { traitTypePath, traitCount: Object.keys(traits).length, traits: Object.keys(traits) });
    } catch (error) {
      errors.push(`Error reading trait directory: ${error}`);
    }

    return traits;
  }

  private async hasImageFiles(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries.some((entry: string) => 
        VALIDATION_RULES.SUPPORTED_IMAGE_FORMATS.some(ext => 
          entry.toLowerCase().endsWith(ext)
        )
      );
    } catch {
      return false;
    }
  }

  private async hasSubdirectories(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return entries.some((entry: any) => entry.isDirectory());
    } catch {
      return false;
    }
  }

  private async getImageFiles(dirPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dirPath);
      return entries
        .filter((entry: string) => 
          VALIDATION_RULES.SUPPORTED_IMAGE_FORMATS.some(ext => 
            entry.toLowerCase().endsWith(ext)
          )
        )
        .sort((a: string, b: string) => {
          // Extract numbers from filenames for numerical sorting
          const getNumber = (filename: string): number => {
            const match = filename.match(/(\d+)\./);
            return match && match[1] ? parseInt(match[1], 10) : 0;
          };
          return getNumber(a) - getNumber(b);
        });
    } catch {
      return [];
    }
  }

  private async validateLeafDirectory(traitPath: string, traitName: string, frames: string[]): Promise<string[]> {
    const errors: string[] = [];
    
    try {
      const entries = await fs.readdir(traitPath);
      
      // Check for double extensions (e.g., .png.png)
      const doubleExtensions = entries.filter(entry => 
        entry.includes('.png.png') || entry.includes('.jpg.jpg') || entry.includes('.jpeg.jpeg')
      );
      if (doubleExtensions.length > 0) {
        errors.push(`Double file extensions found in ${traitName}: ${doubleExtensions.join(', ')}`);
      }
      
      // Check for non-image files
      const nonImageFiles = entries.filter(entry => 
        !['.png', '.jpg', '.jpeg', '.webp'].some(ext => entry.toLowerCase().endsWith(ext))
      );
      if (nonImageFiles.length > 0) {
        errors.push(`Non-image files found in ${traitName}: ${nonImageFiles.join(', ')}`);
      }
      
      // Warn if single file (but don't error - this is allowed)
      if (frames.length === 1) {
        logger.debug('Single file trait detected', { traitName, file: frames[0] });
      }
      
    } catch (error) {
      errors.push(`Error reading directory ${traitName}: ${error}`);
    }
    
    return errors;
  }

  private loopFramesToRequiredCount(originalFrames: string[]): string[] {
    if (originalFrames.length === 0) {
      return [];
    }

    if (originalFrames.length >= this.requiredFrameCount) {
      // If we have enough or more frames, just return the required amount
      return originalFrames.slice(0, this.requiredFrameCount);
    }

    // If we have fewer frames than required, loop them
    const loopedFrames: string[] = [];
    for (let i = 0; i < this.requiredFrameCount; i++) {
      const frameIndex = i % originalFrames.length;
      const frame = originalFrames[frameIndex];
      if (frame) {
        loopedFrames.push(frame);
      }
    }

    logger.debug('Looped frames', {
      originalCount: originalFrames.length,
      requiredCount: this.requiredFrameCount,
      finalCount: loopedFrames.length
    });

    return loopedFrames;
  }

  private calculateStats(hierarchy: TraitHierarchy): {
    totalTraits: number;
    totalFrames: number;
    traitTypes: string[];
    frameCounts: number[];
    dimensions: Array<{ width: number; height: number }>;
  } {
    let totalTraits = 0;
    let totalFrames = 0;
    const traitTypes = Object.keys(hierarchy);
    const frameCounts: number[] = [];
    const dimensions: Array<{ width: number; height: number }> = [];

    const traverse = (traits: any) => {
      for (const [name, trait] of Object.entries(traits)) {
        const traitObj = trait as any;
        logger.debug('Processing trait', { name, hasFrames: !!traitObj.frames, frameCount: traitObj.frames?.length || 0, hasSubTraits: !!traitObj.subTraits });
        
        // Check if this is a leaf trait (has frames)
        if (traitObj.frames && traitObj.frames.length > 0) {
          totalTraits++;
          totalFrames += traitObj.frames.length;
          frameCounts.push(traitObj.frames.length);
          logger.debug('Added trait', { name, frameCount: traitObj.frames.length, totalTraits, totalFrames });
        }
        // Check if this is an intermediate trait (has sub-traits)
        else if (traitObj.subTraits) {
          logger.debug('Traversing sub-traits', { name, subTraitCount: Object.keys(traitObj.subTraits).length });
          traverse(traitObj.subTraits);
        }
        // If neither, this might be a trait type container - traverse its contents
        else if (typeof traitObj === 'object' && traitObj !== null) {
          logger.debug('Traversing trait type container', { name, traitCount: Object.keys(traitObj).length });
          traverse(traitObj);
        }
      }
    };

    traverse(hierarchy);

    return {
      totalTraits,
      totalFrames,
      traitTypes,
      frameCounts,
      dimensions
    };
  }

  getValidationResult(): ValidationResult | null {
    return this.validationResult;
  }

  async getAvailableTraits(traitType: string): Promise<any[]> {
    // Check cache first
    if (this.traitCache.has(traitType)) {
      return this.traitCache.get(traitType)!;
    }

    if (!this.validationResult?.isValid) {
      throw new GeneratorError(
        ErrorType.VALIDATION_ERROR,
        'Layer structure must be validated before getting available traits'
      );
    }

    // Use cached hierarchy instead of re-parsing
    const hierarchy = this.hierarchy || await this.parseTraitHierarchy(this.layersPath, []);
    
    const traitTypeTraits = hierarchy[traitType];
    
    if (!traitTypeTraits) {
      logger.warn('Trait type not found', { traitType, availableTypes: Object.keys(hierarchy) });
      this.traitCache.set(traitType, []);
      return [];
    }

    // Convert the trait type object to an array of traits
    const traits: any[] = [];
    this.collectLeafTraits(traitTypeTraits, traitType, traits);

    // Cache the result
    this.traitCache.set(traitType, traits);

    logger.debug('Retrieved available traits', { traitType, count: traits.length });
    return traits;
  }

  private collectLeafTraits(traitData: any, traitType: string, traits: any[]): void {
    for (const [traitName, trait] of Object.entries(traitData)) {
      const traitObj = trait as any;
      
      // If this trait has frames, it's a leaf trait
      if (traitObj.frames && traitObj.frames.length > 0) {
        traits.push({
          type: traitType,
          name: traitName,
          weight: traitObj.weight,
          path: traitObj.path,
          frames: traitObj.frames
        });
      }
      // If this trait has sub-traits, recurse into them
      else if (traitObj.subTraits) {
        this.collectLeafTraits(traitObj.subTraits, traitType, traits);
      }
    }
  }
}
