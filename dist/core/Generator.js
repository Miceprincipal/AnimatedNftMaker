"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Generator = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const errors_1 = require("../types/errors");
const LayerProcessor_1 = require("./LayerProcessor");
const TraitSelector_1 = require("./TraitSelector");
const AnimationGenerator_1 = require("./AnimationGenerator");
const configValidator_1 = require("../validators/configValidator");
const logger_1 = __importDefault(require("../utils/logger"));
class Generator {
    constructor(configPath) {
        this.currentCombinations = [];
        this.configValidator = new configValidator_1.ConfigValidator();
        this.config = this.loadConfig(configPath);
        this.layerProcessor = new LayerProcessor_1.LayerProcessor('layers', this.config.generation.frames_per_animation);
        this.traitSelector = new TraitSelector_1.TraitSelector(this.config, this.layerProcessor);
        this.animationGenerator = new AnimationGenerator_1.AnimationGenerator(this.config);
    }
    loadConfig(configPath) {
        const defaultPath = configPath || 'config/generator_config.json';
        try {
            // Use async readFile for better performance
            const configData = fs_extra_1.default.readJsonSync(defaultPath);
            return this.configValidator.validate(configData);
        }
        catch (error) {
            if (error instanceof errors_1.GeneratorError) {
                throw error;
            }
            throw new errors_1.GeneratorError(errors_1.ErrorType.CONFIG_ERROR, `Failed to load configuration: ${error}`, { configPath: defaultPath, error });
        }
    }
    async validate() {
        logger_1.default.info('Starting validation process');
        // Validate configuration
        logger_1.default.info('Validating configuration...');
        this.configValidator.validate(this.config);
        // Validate layer structure
        logger_1.default.info('Validating layer structure...');
        const layerResult = await this.layerProcessor.validateStructure();
        if (!layerResult.isValid) {
            throw new errors_1.GeneratorError(errors_1.ErrorType.VALIDATION_ERROR, 'Layer structure validation failed', { errors: layerResult.errors });
        }
        logger_1.default.info('Validation completed successfully', {
            totalTraits: layerResult.stats.totalTraits,
            totalFrames: layerResult.stats.totalFrames,
            traitTypes: layerResult.stats.traitTypes.length
        });
    }
    async generate(options = {}) {
        logger_1.default.info('Starting NFT generation process', {
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
            logger_1.default.info('NFT generation completed successfully');
        }
        catch (error) {
            logger_1.default.error('NFT generation failed', { error });
            throw error;
        }
    }
    async generateMetadata(options = {}) {
        logger_1.default.info('Starting metadata generation');
        const ethereumDir = path_1.default.join(process.cwd(), 'output', 'metadata', 'ethereum');
        const solanaDir = path_1.default.join(process.cwd(), 'output', 'metadata', 'solana');
        await fs_extra_1.default.ensureDir(ethereumDir);
        await fs_extra_1.default.ensureDir(solanaDir);
        try {
            const totalToGenerate = options.totalCountOverride ?? this.config.generation.total_nfts;
            logger_1.default.info('Generating combinations', { totalToGenerate });
            const combinations = await this.traitSelector.generateCombinations(totalToGenerate);
            // Store combinations for later use
            this.currentCombinations = combinations;
            // Save individual metadata files in parallel batches
            const metadataBatchSize = Math.min(100, combinations.length);
            for (let i = 0; i < combinations.length; i += metadataBatchSize) {
                const batch = combinations.slice(i, i + metadataBatchSize);
                await Promise.all(batch.map(async (combination) => {
                    const ethereumPath = path_1.default.join(ethereumDir, `${combination.id}.json`);
                    const solanaPath = path_1.default.join(solanaDir, `${combination.id}.json`);
                    await fs_extra_1.default.writeJson(ethereumPath, combination.metadata.ethereum, { spaces: 2 });
                    await fs_extra_1.default.writeJson(solanaPath, combination.metadata.solana, { spaces: 2 });
                }));
            }
            // Save collection metadata for both formats
            const ethereumCollection = this.generateCollectionMetadata(combinations, 'ethereum');
            const solanaCollection = this.generateCollectionMetadata(combinations, 'solana');
            const ethereumCollectionPath = path_1.default.join(process.cwd(), 'output', 'ethereum_collection_metadata.json');
            const solanaCollectionPath = path_1.default.join(process.cwd(), 'output', 'solana_collection_metadata.json');
            await fs_extra_1.default.writeJson(ethereumCollectionPath, ethereumCollection, { spaces: 2 });
            await fs_extra_1.default.writeJson(solanaCollectionPath, solanaCollection, { spaces: 2 });
            logger_1.default.info('Metadata generation completed', {
                totalGenerated: combinations.length,
                ethereumDir,
                solanaDir
            });
        }
        catch (error) {
            logger_1.default.error('Metadata generation failed', { error });
            throw error;
        }
    }
    // Removed legacy spritesheet pipeline in favor of direct-to-frames
    async extractFrames() {
        logger_1.default.info('Starting frame extraction');
        try {
            const combinations = this.currentCombinations.length > 0
                ? this.currentCombinations
                : await this.loadCombinationsFromMetadata();
            await this.animationGenerator.extractFrames(combinations);
            logger_1.default.info('Frame extraction completed');
        }
        catch (error) {
            logger_1.default.error('Frame extraction failed', { error });
            throw error;
        }
    }
    async assembleAnimations() {
        logger_1.default.info('Starting animation assembly');
        try {
            const combinations = this.currentCombinations.length > 0
                ? this.currentCombinations
                : await this.loadCombinationsFromMetadata();
            await this.animationGenerator.assembleAnimations(combinations);
            logger_1.default.info('Animation assembly completed');
        }
        catch (error) {
            logger_1.default.error('Animation assembly failed', { error });
            throw error;
        }
    }
    async previewTraits(count) {
        logger_1.default.info('Generating trait preview', { count });
        try {
            // Validate layer structure first
            await this.layerProcessor.validateStructure();
            return await this.traitSelector.generateCombinations(count);
        }
        catch (error) {
            logger_1.default.error('Trait preview failed', { error });
            throw error;
        }
    }
    async calculateRarities(inputDir) {
        logger_1.default.info('Calculating trait rarities', { inputDir });
        try {
            // Check if inputDir is a specific format folder or the general metadata folder
            let dir = path_1.default.isAbsolute(inputDir) ? inputDir : path_1.default.join(process.cwd(), inputDir);
            // If it's the general metadata folder, default to ethereum
            if (dir.endsWith('metadata') && !dir.endsWith('ethereum') && !dir.endsWith('solana')) {
                dir = path_1.default.join(dir, 'ethereum');
                logger_1.default.info('Using ethereum metadata for rarity calculation', { dir });
            }
            if (!await fs_extra_1.default.pathExists(dir)) {
                throw new errors_1.GeneratorError(errors_1.ErrorType.FILE_ERROR, `Metadata directory not found: ${dir}`, { dir });
            }
            const files = await fs_extra_1.default.readdir(dir);
            const jsonFiles = files.filter((f) => f.endsWith('.json'));
            if (jsonFiles.length === 0) {
                throw new errors_1.GeneratorError(errors_1.ErrorType.FILE_ERROR, 'No metadata JSON files found', { dir });
            }
            // rarityCounts[trait_type][value] = count
            const rarityCounts = {};
            let totalItems = 0;
            for (const file of jsonFiles) {
                const fp = path_1.default.join(dir, file);
                const meta = await fs_extra_1.default.readJson(fp);
                const attributes = Array.isArray(meta.attributes) ? meta.attributes : [];
                for (const attr of attributes) {
                    const type = String(attr.trait_type || '').trim();
                    const value = String(attr.value || '').trim();
                    if (!type || !value)
                        continue;
                    if (!rarityCounts[type])
                        rarityCounts[type] = {};
                    rarityCounts[type][value] = (rarityCounts[type][value] || 0) + 1;
                }
                totalItems++;
            }
            // Convert counts to percentages
            const rarityPercentages = {};
            for (const traitType of Object.keys(rarityCounts)) {
                const typeCounts = rarityCounts[traitType] || {};
                const entries = Object.entries(typeCounts)
                    .map(([value, count]) => ({ value, count: count, percent: +(100 * count / totalItems).toFixed(4) }))
                    .sort((a, b) => a.percent - b.percent);
                rarityPercentages[traitType] = entries;
            }
            // Write report
            const statsDir = path_1.default.join(process.cwd(), 'output', 'stats');
            await fs_extra_1.default.ensureDir(statsDir);
            const reportPath = path_1.default.join(statsDir, 'rarity.json');
            await fs_extra_1.default.writeJson(reportPath, {
                total: totalItems,
                traits: rarityPercentages
            }, { spaces: 2 });
            // Print concise summary
            logger_1.default.info('Rarity calculation completed', { total: totalItems, reportPath });
            for (const [traitType, list] of Object.entries(rarityPercentages)) {
                const top = list.slice(0, Math.min(3, list.length));
                const bottom = list.slice(Math.max(0, list.length - 3));
                console.log(`\n${traitType}:`);
                console.log(`  Rarest: ${top.map(i => `${i.value} (${i.percent}%)`).join(', ')}`);
                console.log(`  Common: ${bottom.map(i => `${i.value} (${i.percent}%)`).join(', ')}`);
            }
        }
        catch (error) {
            logger_1.default.error('Rarity calculation failed', { error });
            throw error;
        }
    }
    async cleanOutput(options = {}) {
        logger_1.default.info('Cleaning output directory', { keepMetadata: options.keepMetadata });
        try {
            const outputDir = path_1.default.join(process.cwd(), 'output');
            await fs_extra_1.default.ensureDir(outputDir);
            if (options.keepMetadata) {
                // Keep metadata, clean everything else (preserve logs folder to avoid file locks)
                const entries = await fs_extra_1.default.readdir(outputDir);
                for (const entry of entries) {
                    const entryPath = path_1.default.join(outputDir, String(entry));
                    if (String(entry).toLowerCase() === 'metadata')
                        continue;
                    if (String(entry).toLowerCase() === 'logs') {
                        // Try to empty logs rather than remove; ignore errors if files are locked
                        try {
                            await fs_extra_1.default.emptyDir(entryPath);
                        }
                        catch (_) { }
                        continue;
                    }
                    try {
                        await fs_extra_1.default.remove(entryPath);
                    }
                    catch (e) {
                        logger_1.default.warn('Failed to remove entry during clean', { entry: entryPath, error: e });
                    }
                }
            }
            else {
                // Clean everything (preserve logs directory itself to avoid rmdir on locked handle)
                const entries = await fs_extra_1.default.readdir(outputDir);
                for (const entry of entries) {
                    const entryPath = path_1.default.join(outputDir, String(entry));
                    if (String(entry).toLowerCase() === 'logs') {
                        // Empty logs content best-effort and move on
                        try {
                            await fs_extra_1.default.emptyDir(entryPath);
                        }
                        catch (_) { }
                        continue;
                    }
                    try {
                        await fs_extra_1.default.remove(entryPath);
                    }
                    catch (e) {
                        logger_1.default.warn('Failed to remove entry during clean', { entry: entryPath, error: e });
                    }
                }
            }
            logger_1.default.info('Output directory cleaned');
        }
        catch (error) {
            logger_1.default.error('Cleanup failed', { error });
            throw error;
        }
    }
    async resume() {
        logger_1.default.info('Resuming generation from checkpoint');
        try {
            // This would be implemented to resume from the last checkpoint
            logger_1.default.info('Resume functionality not yet implemented');
        }
        catch (error) {
            logger_1.default.error('Resume failed', { error });
            throw error;
        }
    }
    async debug(options = {}) {
        logger_1.default.info('Debug mode enabled', { traitType: options.traitType });
        try {
            // This would be implemented to provide debug information
            logger_1.default.info('Debug functionality not yet implemented');
        }
        catch (error) {
            logger_1.default.error('Debug failed', { error });
            throw error;
        }
    }
    async loadCombinationsFromMetadata() {
        const metadataDir = path_1.default.join(process.cwd(), 'output', 'metadata');
        if (!await fs_extra_1.default.pathExists(metadataDir)) {
            throw new errors_1.GeneratorError(errors_1.ErrorType.FILE_ERROR, 'Metadata directory not found. Run metadata generation first.', { metadataDir });
        }
        const files = await fs_extra_1.default.readdir(metadataDir);
        const jsonFiles = files.filter((file) => file.endsWith('.json'));
        const combinations = [];
        for (const file of jsonFiles) {
            const filePath = path_1.default.join(metadataDir, file);
            const metadata = await fs_extra_1.default.readJson(filePath);
            // Extract ID from filename
            const id = parseInt(path_1.default.basename(file, '.json'));
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
    generateCollectionMetadata(combinations, format) {
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
exports.Generator = Generator;
//# sourceMappingURL=Generator.js.map