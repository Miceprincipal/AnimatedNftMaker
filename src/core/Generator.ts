import fs from 'fs-extra';
import path from 'path';
import { GeneratorConfig } from '../types/config';
import { TraitCombination } from '../types/traits';
import { GeneratorError, ErrorType } from '../types/errors';
import { LayerProcessor } from './LayerProcessor';
import { TraitSelector } from './TraitSelector';
import { AnimationGenerator } from './AnimationGenerator';
import { ConfigValidator } from '../validators/configValidator';
import logger from '../utils/logger';

export interface GenerationOptions {
  resume?: boolean;
  verbose?: boolean;
  batchSize?: number;
  // Optional override for this run; if provided, ignores config.generation.total_nfts
  totalCountOverride?: number | undefined;
}

export class Generator {
  private config: GeneratorConfig;
  private layerProcessor: LayerProcessor;
  private traitSelector: TraitSelector;
  private animationGenerator: AnimationGenerator;
  private configValidator: ConfigValidator;
  private currentCombinations: TraitCombination[] = [];

  constructor(configPath?: string) {
    this.configValidator = new ConfigValidator();
    this.config = this.loadConfig(configPath);
    this.layerProcessor = new LayerProcessor('layers', this.config.generation.frames_per_animation);
    this.traitSelector = new TraitSelector(this.config, this.layerProcessor);
    this.animationGenerator = new AnimationGenerator(this.config);
  }

  private loadConfig(configPath?: string): GeneratorConfig {
    const defaultPath = configPath || 'config/generator_config.json';
    
    try {
      // Use async readFile for better performance
      const configData = fs.readJsonSync(defaultPath);
      return this.configValidator.validate(configData);
    } catch (error) {
      if (error instanceof GeneratorError) {
        throw error;
      }
      throw new GeneratorError(
        ErrorType.CONFIG_ERROR,
        `Failed to load configuration: ${error}`,
        { configPath: defaultPath, error }
      );
    }
  }

  async validate(): Promise<void> {
    logger.info('Starting validation process');

    // Validate configuration
    logger.info('Validating configuration...');
    this.configValidator.validate(this.config);

    // Validate layer structure
    logger.info('Validating layer structure...');
    const layerResult = await this.layerProcessor.validateStructure();
    
    if (!layerResult.isValid) {
      throw new GeneratorError(
        ErrorType.VALIDATION_ERROR,
        'Layer structure validation failed',
        { errors: layerResult.errors }
      );
    }

    logger.info('Validation completed successfully', {
      totalTraits: layerResult.stats.totalTraits,
      totalFrames: layerResult.stats.totalFrames,
      traitTypes: layerResult.stats.traitTypes.length
    });
  }

  async generate(options: GenerationOptions = {}): Promise<void> {
    logger.info('Starting NFT generation process', {
      totalNFTs: options.totalCountOverride ?? this.config.generation.total_nfts,
      batchSize: options.batchSize || this.config.generation.batch_size,
      resume: options.resume || false
    });

    try {
      // Always start from a clean output directory unless resuming
      if (!options.resume) {
        await this.cleanOutput();
      }

      // Validate before generation
      await this.validate();

      // Generate metadata
      await this.generateMetadata(options);

      // Direct-to-frames pipeline (replaces spritesheets + extraction)
      {
        const combinations = this.currentCombinations.length > 0 
          ? this.currentCombinations 
          : await this.loadCombinationsFromMetadata();
        await this.animationGenerator.generateFramesDirectly(combinations);
      }

      // Assemble animations from frames
      await this.assembleAnimations();

      // Cleanup intermediate files
      await this.animationGenerator.cleanupIntermediateFiles();

      logger.info('NFT generation completed successfully');
    } catch (error) {
      logger.error('NFT generation failed', { error });
      throw error;
    }
  }

  async generateMetadata(options: GenerationOptions = {}): Promise<void> {
    logger.info('Starting metadata generation');

    const ethereumDir = path.join(process.cwd(), 'output', 'metadata', 'ethereum');
    const solanaDir = path.join(process.cwd(), 'output', 'metadata', 'solana');
    await fs.ensureDir(ethereumDir);
    await fs.ensureDir(solanaDir);

    try {
      const totalToGenerate = options.totalCountOverride ?? this.config.generation.total_nfts;
      logger.info('Generating combinations', { totalToGenerate });
      const combinations = await this.traitSelector.generateCombinations(totalToGenerate);

      // Store combinations for later use
      this.currentCombinations = combinations;

      // Save individual metadata files in parallel batches
      const metadataBatchSize = Math.min(100, combinations.length);
      for (let i = 0; i < combinations.length; i += metadataBatchSize) {
        const batch = combinations.slice(i, i + metadataBatchSize);
        await Promise.all(batch.map(async (combination) => {
          const ethereumPath = path.join(ethereumDir, `${combination.id}.json`);
          const solanaPath = path.join(solanaDir, `${combination.id}.json`);
          
          await fs.writeJson(ethereumPath, combination.metadata.ethereum, { spaces: 2 });
          await fs.writeJson(solanaPath, combination.metadata.solana, { spaces: 2 });
        }));
      }

      // Save collection metadata for both formats
      const ethereumCollection = this.generateCollectionMetadata(combinations, 'ethereum');
      const solanaCollection = this.generateCollectionMetadata(combinations, 'solana');
      
      const ethereumCollectionPath = path.join(process.cwd(), 'output', 'ethereum_collection_metadata.json');
      const solanaCollectionPath = path.join(process.cwd(), 'output', 'solana_collection_metadata.json');
      
      await fs.writeJson(ethereumCollectionPath, ethereumCollection, { spaces: 2 });
      await fs.writeJson(solanaCollectionPath, solanaCollection, { spaces: 2 });

      logger.info('Metadata generation completed', {
        totalGenerated: combinations.length,
        ethereumDir,
        solanaDir
      });
    } catch (error) {
      logger.error('Metadata generation failed', { error });
      throw error;
    }
  }

  // Removed legacy spritesheet pipeline in favor of direct-to-frames

  async extractFrames(): Promise<void> {
    logger.info('Starting frame extraction');

    try {
      const combinations = this.currentCombinations.length > 0 
        ? this.currentCombinations 
        : await this.loadCombinationsFromMetadata();
      await this.animationGenerator.extractFrames(combinations);

      logger.info('Frame extraction completed');
    } catch (error) {
      logger.error('Frame extraction failed', { error });
      throw error;
    }
  }

  async assembleAnimations(): Promise<void> {
    logger.info('Starting animation assembly');

    try {
      const combinations = this.currentCombinations.length > 0 
        ? this.currentCombinations 
        : await this.loadCombinationsFromMetadata();
      await this.animationGenerator.assembleAnimations(combinations);

      logger.info('Animation assembly completed');
    } catch (error) {
      logger.error('Animation assembly failed', { error });
      throw error;
    }
  }

  async previewTraits(count: number): Promise<TraitCombination[]> {
    logger.info('Generating trait preview', { count });

    try {
      // Validate layer structure first
      await this.layerProcessor.validateStructure();
      
      return await this.traitSelector.generateCombinations(count);
    } catch (error) {
      logger.error('Trait preview failed', { error });
      throw error;
    }
  }

  async calculateRarities(inputDir: string): Promise<void> {
    logger.info('Calculating trait rarities', { inputDir });

    try {
      // Check if inputDir is a specific format folder or the general metadata folder
      let dir = path.isAbsolute(inputDir) ? inputDir : path.join(process.cwd(), inputDir);
      
      // If it's the general metadata folder, default to ethereum
      if (dir.endsWith('metadata') && !dir.endsWith('ethereum') && !dir.endsWith('solana')) {
        dir = path.join(dir, 'ethereum');
        logger.info('Using ethereum metadata for rarity calculation', { dir });
      }
      
      if (!await fs.pathExists(dir)) {
        throw new GeneratorError(ErrorType.FILE_ERROR, `Metadata directory not found: ${dir}`, { dir });
      }

      const files = await fs.readdir(dir);
      const jsonFiles = files.filter((f: string) => f.endsWith('.json'));
      if (jsonFiles.length === 0) {
        throw new GeneratorError(ErrorType.FILE_ERROR, 'No metadata JSON files found', { dir });
      }

      // rarityCounts[trait_type][value] = count
      const rarityCounts: Record<string, Record<string, number>> = {};
      let totalItems = 0;

      for (const file of jsonFiles) {
        const fp = path.join(dir, file);
        const meta = await fs.readJson(fp);
        const attributes = Array.isArray(meta.attributes) ? meta.attributes : [];
        for (const attr of attributes) {
          const type = String(attr.trait_type || '').trim();
          const value = String(attr.value || '').trim();
          if (!type || !value) continue;
          if (!rarityCounts[type]) rarityCounts[type] = {};
          rarityCounts[type][value] = (rarityCounts[type][value] || 0) + 1;
        }
        totalItems++;
      }

      // Convert counts to percentages
      const rarityPercentages: Record<string, { value: string; count: number; percent: number }[]> = {};
      for (const traitType of Object.keys(rarityCounts)) {
        const typeCounts = rarityCounts[traitType] || {};
        const entries = Object.entries(typeCounts)
          .map(([value, count]) => ({ value, count: count as number, percent: +(100 * (count as number) / totalItems).toFixed(4) }))
          .sort((a, b) => a.percent - b.percent);
        rarityPercentages[traitType] = entries;
      }

      // Write report
      const statsDir = path.join(process.cwd(), 'output', 'stats');
      await fs.ensureDir(statsDir);
      const reportPath = path.join(statsDir, 'rarity.json');
      await fs.writeJson(reportPath, {
        total: totalItems,
        traits: rarityPercentages
      }, { spaces: 2 });

      // Print concise summary
      logger.info('Rarity calculation completed', { total: totalItems, reportPath });
      for (const [traitType, list] of Object.entries(rarityPercentages)) {
        const top = list.slice(0, Math.min(3, list.length));
        const bottom = list.slice(Math.max(0, list.length - 3));
        console.log(`\n${traitType}:`);
        console.log(`  Rarest: ${top.map(i => `${i.value} (${i.percent}%)`).join(', ')}`);
        console.log(`  Common: ${bottom.map(i => `${i.value} (${i.percent}%)`).join(', ')}`);
      }
    } catch (error) {
      logger.error('Rarity calculation failed', { error });
      throw error;
    }
  }

  async cleanOutput(options: { keepMetadata?: boolean } = {}): Promise<void> {
    logger.info('Cleaning output directory', { keepMetadata: options.keepMetadata });

    try {
      const outputDir = path.join(process.cwd(), 'output');
      
      await fs.ensureDir(outputDir);

      if (options.keepMetadata) {
        // Keep metadata, clean everything else (preserve logs folder to avoid file locks)
        const entries = await fs.readdir(outputDir);
        for (const entry of entries) {
          const entryPath = path.join(outputDir, String(entry));
          if (String(entry).toLowerCase() === 'metadata') continue;
          if (String(entry).toLowerCase() === 'logs') {
            // Try to empty logs rather than remove; ignore errors if files are locked
            try { await fs.emptyDir(entryPath); } catch (_) {}
            continue;
          }
          try { await fs.remove(entryPath); } catch (e) { logger.warn('Failed to remove entry during clean', { entry: entryPath, error: e }); }
        }
      } else {
        // Clean everything (preserve logs directory itself to avoid rmdir on locked handle)
        const entries = await fs.readdir(outputDir);
        for (const entry of entries) {
          const entryPath = path.join(outputDir, String(entry));
          if (String(entry).toLowerCase() === 'logs') {
            // Empty logs content best-effort and move on
            try { await fs.emptyDir(entryPath); } catch (_) {}
            continue;
          }
          try { await fs.remove(entryPath); } catch (e) { logger.warn('Failed to remove entry during clean', { entry: entryPath, error: e }); }
        }
      }

      logger.info('Output directory cleaned');
    } catch (error) {
      logger.error('Cleanup failed', { error });
      throw error;
    }
  }

  async resume(): Promise<void> {
    logger.info('Resuming generation from checkpoint');

    try {
      // This would be implemented to resume from the last checkpoint
      logger.info('Resume functionality not yet implemented');
    } catch (error) {
      logger.error('Resume failed', { error });
      throw error;
    }
  }

  async debug(options: { traitType?: string } = {}): Promise<void> {
    logger.info('Debug mode enabled', { traitType: options.traitType });

    try {
      // This would be implemented to provide debug information
      logger.info('Debug functionality not yet implemented');
    } catch (error) {
      logger.error('Debug failed', { error });
      throw error;
    }
  }

  private async loadCombinationsFromMetadata(): Promise<TraitCombination[]> {
    const metadataDir = path.join(process.cwd(), 'output', 'metadata');
    
    if (!await fs.pathExists(metadataDir)) {
      throw new GeneratorError(
        ErrorType.FILE_ERROR,
        'Metadata directory not found. Run metadata generation first.',
        { metadataDir }
      );
    }

    const files = await fs.readdir(metadataDir);
    const jsonFiles = files.filter((file: string) => file.endsWith('.json'));
    
    const combinations: TraitCombination[] = [];
    
    for (const file of jsonFiles) {
      const filePath = path.join(metadataDir, file);
      const metadata = await fs.readJson(filePath);
      
      // Extract ID from filename
      const id = parseInt(path.basename(file, '.json'));
      
      combinations.push({
        id,
        traits: [], // This would be populated from the metadata
        rarity: { overall: 0, traits: [], rank: 0, percentile: 0 },
        metadata,
        generatedAt: new Date()
      });
    }

    return combinations.sort((a, b) => a.id - b.id);
  }

  private generateCollectionMetadata(combinations: TraitCombination[], format: 'ethereum' | 'solana'): any {
    const base = {
      name: this.config.metadata.name_prefix,
      description: this.config.metadata.description,
      image: this.config.metadata.image_base_uri,
      external_url: this.config.metadata.external_url,
      total_supply: combinations.length,
      created_at: new Date().toISOString(),
      traits: [] // This would be populated with trait statistics
    };

    if (format === 'solana') {
      const solanaConfig = this.config.metadata.solana || {};
      return {
        ...base,
        symbol: solanaConfig.symbol || 'NFT',
        seller_fee_basis_points: solanaConfig.seller_fee_basis_points || 0,
        collection: solanaConfig.collection || { name: 'NFT Collection', family: 'NFT' },
        properties: {
          category: (solanaConfig.properties && solanaConfig.properties.category) || 'image',
          creators: (solanaConfig.properties && solanaConfig.properties.creators) || [],
          files: (solanaConfig.properties && solanaConfig.properties.files) || []
        }
      };
    }

    // Ethereum format
    return {
      ...base,
      seller_fee_basis_points: 0,
      fee_recipient: ''
    };
  }
}
