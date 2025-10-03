"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LayerProcessor = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const errors_1 = require("../types/errors");
const validation_1 = require("../constants/validation");
const logger_1 = __importDefault(require("../utils/logger"));
class LayerProcessor {
    constructor(layersPath, requiredFrameCount) {
        this.validationResult = null;
        this.requiredFrameCount = 12; // Default, will be set from config
        this.traitCache = new Map();
        this.hierarchy = {};
        this.layersPath = layersPath;
        if (requiredFrameCount) {
            this.requiredFrameCount = requiredFrameCount;
        }
    }
    async validateStructure() {
        const errors = [];
        const warnings = [];
        let totalTraits = 0;
        let totalFrames = 0;
        const traitTypes = [];
        try {
            if (!await fs_extra_1.default.pathExists(this.layersPath)) {
                throw new errors_1.GeneratorError(errors_1.ErrorType.VALIDATION_ERROR, `Layers directory does not exist: ${this.layersPath}`);
            }
            const hierarchy = await this.parseTraitHierarchy(this.layersPath, errors);
            this.hierarchy = hierarchy; // Cache the hierarchy
            const stats = this.calculateStats(hierarchy);
            totalTraits = stats.totalTraits;
            totalFrames = stats.totalFrames;
            traitTypes.push(...stats.traitTypes);
            logger_1.default.info('Layer structure stats', {
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
        }
        catch (error) {
            if (error instanceof errors_1.GeneratorError) {
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
        logger_1.default.info('Layer structure validation completed', {
            isValid,
            errorCount: errors.length,
            warningCount: warnings.length,
            totalTraits,
            totalFrames
        });
        return this.validationResult;
    }
    async parseTraitHierarchy(rootPath, errors) {
        const hierarchy = {};
        try {
            const entries = await fs_extra_1.default.readdir(rootPath, { withFileTypes: true });
            logger_1.default.debug('Parsing trait hierarchy', { rootPath, entryCount: entries.length });
            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    errors.push(`Invalid structure: ${entry.name} is a file in trait type directory`);
                    continue;
                }
                const traitType = entry.name;
                const traitTypePath = path_1.default.join(rootPath, traitType);
                const traits = await this.parseTraitType(traitTypePath, errors);
                hierarchy[traitType] = traits;
                logger_1.default.debug('Added trait type to hierarchy', { traitType, traitCount: Object.keys(traits).length });
            }
            logger_1.default.debug('Trait hierarchy built', { traitTypeCount: Object.keys(hierarchy).length, traitTypes: Object.keys(hierarchy) });
        }
        catch (error) {
            errors.push(`Error reading trait type directory: ${error}`);
        }
        return hierarchy;
    }
    async parseTraitType(traitTypePath, errors) {
        const traits = {};
        try {
            const entries = await fs_extra_1.default.readdir(traitTypePath, { withFileTypes: true });
            logger_1.default.debug('Parsing trait type directory', { traitTypePath, entryCount: entries.length });
            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    errors.push(`Invalid structure: ${entry.name} is a file in trait directory`);
                    continue;
                }
                const traitName = entry.name;
                const traitPath = path_1.default.join(traitTypePath, traitName);
                // Parse weight from folder name
                const weightMatch = traitName.match(/^(.+)\((\d+)\)$/);
                const cleanName = weightMatch ? weightMatch[1] : traitName;
                const weight = weightMatch ? parseInt(weightMatch[2]) : 1;
                if (weight < validation_1.VALIDATION_RULES.MIN_WEIGHT || weight > validation_1.VALIDATION_RULES.MAX_WEIGHT) {
                    errors.push(`Invalid weight for ${traitName}: ${weight} (must be between ${validation_1.VALIDATION_RULES.MIN_WEIGHT} and ${validation_1.VALIDATION_RULES.MAX_WEIGHT})`);
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
                    logger_1.default.debug('Found leaf trait', {
                        traitName,
                        cleanName,
                        originalFrameCount: originalFrames.length,
                        finalFrameCount: frames.length,
                        requiredFrameCount: this.requiredFrameCount
                    });
                    traits[cleanName] = {
                        weight,
                        path: traitPath,
                        frames
                    };
                }
                else if (hasSubdirs) {
                    // Intermediate directory - recurse
                    logger_1.default.debug('Found intermediate trait', { traitName, cleanName });
                    traits[cleanName] = {
                        weight,
                        path: traitPath,
                        frames: [],
                        subTraits: await this.parseTraitType(traitPath, errors)
                    };
                }
                else {
                    errors.push(`Empty trait directory: ${traitName}`);
                }
            }
            logger_1.default.debug('Parsed trait type', { traitTypePath, traitCount: Object.keys(traits).length, traits: Object.keys(traits) });
        }
        catch (error) {
            errors.push(`Error reading trait directory: ${error}`);
        }
        return traits;
    }
    async hasImageFiles(dirPath) {
        try {
            const entries = await fs_extra_1.default.readdir(dirPath);
            return entries.some((entry) => validation_1.VALIDATION_RULES.SUPPORTED_IMAGE_FORMATS.some(ext => entry.toLowerCase().endsWith(ext)));
        }
        catch {
            return false;
        }
    }
    async hasSubdirectories(dirPath) {
        try {
            const entries = await fs_extra_1.default.readdir(dirPath, { withFileTypes: true });
            return entries.some((entry) => entry.isDirectory());
        }
        catch {
            return false;
        }
    }
    async getImageFiles(dirPath) {
        try {
            const entries = await fs_extra_1.default.readdir(dirPath);
            return entries
                .filter((entry) => validation_1.VALIDATION_RULES.SUPPORTED_IMAGE_FORMATS.some(ext => entry.toLowerCase().endsWith(ext)))
                .sort((a, b) => {
                // Extract numbers from filenames for numerical sorting
                const getNumber = (filename) => {
                    const match = filename.match(/(\d+)\./);
                    return match && match[1] ? parseInt(match[1], 10) : 0;
                };
                return getNumber(a) - getNumber(b);
            });
        }
        catch {
            return [];
        }
    }
    async validateLeafDirectory(traitPath, traitName, frames) {
        const errors = [];
        try {
            const entries = await fs_extra_1.default.readdir(traitPath);
            // Check for double extensions (e.g., .png.png)
            const doubleExtensions = entries.filter(entry => entry.includes('.png.png') || entry.includes('.jpg.jpg') || entry.includes('.jpeg.jpeg'));
            if (doubleExtensions.length > 0) {
                errors.push(`Double file extensions found in ${traitName}: ${doubleExtensions.join(', ')}`);
            }
            // Check for non-image files
            const nonImageFiles = entries.filter(entry => !['.png', '.jpg', '.jpeg', '.webp'].some(ext => entry.toLowerCase().endsWith(ext)));
            if (nonImageFiles.length > 0) {
                errors.push(`Non-image files found in ${traitName}: ${nonImageFiles.join(', ')}`);
            }
            // Warn if single file (but don't error - this is allowed)
            if (frames.length === 1) {
                logger_1.default.debug('Single file trait detected', { traitName, file: frames[0] });
            }
        }
        catch (error) {
            errors.push(`Error reading directory ${traitName}: ${error}`);
        }
        return errors;
    }
    loopFramesToRequiredCount(originalFrames) {
        if (originalFrames.length === 0) {
            return [];
        }
        if (originalFrames.length >= this.requiredFrameCount) {
            // If we have enough or more frames, just return the required amount
            return originalFrames.slice(0, this.requiredFrameCount);
        }
        // If we have fewer frames than required, loop them
        const loopedFrames = [];
        for (let i = 0; i < this.requiredFrameCount; i++) {
            const frameIndex = i % originalFrames.length;
            const frame = originalFrames[frameIndex];
            if (frame) {
                loopedFrames.push(frame);
            }
        }
        logger_1.default.debug('Looped frames', {
            originalCount: originalFrames.length,
            requiredCount: this.requiredFrameCount,
            finalCount: loopedFrames.length
        });
        return loopedFrames;
    }
    calculateStats(hierarchy) {
        let totalTraits = 0;
        let totalFrames = 0;
        const traitTypes = Object.keys(hierarchy);
        const frameCounts = [];
        const dimensions = [];
        const traverse = (traits) => {
            for (const [name, trait] of Object.entries(traits)) {
                const traitObj = trait;
                logger_1.default.debug('Processing trait', { name, hasFrames: !!traitObj.frames, frameCount: traitObj.frames?.length || 0, hasSubTraits: !!traitObj.subTraits });
                // Check if this is a leaf trait (has frames)
                if (traitObj.frames && traitObj.frames.length > 0) {
                    totalTraits++;
                    totalFrames += traitObj.frames.length;
                    frameCounts.push(traitObj.frames.length);
                    logger_1.default.debug('Added trait', { name, frameCount: traitObj.frames.length, totalTraits, totalFrames });
                }
                // Check if this is an intermediate trait (has sub-traits)
                else if (traitObj.subTraits) {
                    logger_1.default.debug('Traversing sub-traits', { name, subTraitCount: Object.keys(traitObj.subTraits).length });
                    traverse(traitObj.subTraits);
                }
                // If neither, this might be a trait type container - traverse its contents
                else if (typeof traitObj === 'object' && traitObj !== null) {
                    logger_1.default.debug('Traversing trait type container', { name, traitCount: Object.keys(traitObj).length });
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
    getValidationResult() {
        return this.validationResult;
    }
    async getAvailableTraits(traitType) {
        // Check cache first
        if (this.traitCache.has(traitType)) {
            return this.traitCache.get(traitType);
        }
        if (!this.validationResult?.isValid) {
            throw new errors_1.GeneratorError(errors_1.ErrorType.VALIDATION_ERROR, 'Layer structure must be validated before getting available traits');
        }
        // Use cached hierarchy instead of re-parsing
        const hierarchy = this.hierarchy || await this.parseTraitHierarchy(this.layersPath, []);
        const traitTypeTraits = hierarchy[traitType];
        if (!traitTypeTraits) {
            logger_1.default.warn('Trait type not found', { traitType, availableTypes: Object.keys(hierarchy) });
            this.traitCache.set(traitType, []);
            return [];
        }
        // Convert the trait type object to an array of traits
        const traits = [];
        this.collectLeafTraits(traitTypeTraits, traitType, traits);
        // Cache the result
        this.traitCache.set(traitType, traits);
        logger_1.default.debug('Retrieved available traits', { traitType, count: traits.length });
        return traits;
    }
    collectLeafTraits(traitData, traitType, traits) {
        for (const [traitName, trait] of Object.entries(traitData)) {
            const traitObj = trait;
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
exports.LayerProcessor = LayerProcessor;
//# sourceMappingURL=LayerProcessor.js.map