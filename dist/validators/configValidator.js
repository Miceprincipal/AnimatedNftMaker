"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigValidator = void 0;
const joi_1 = __importDefault(require("joi"));
const errors_1 = require("../types/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class ConfigValidator {
    constructor() {
        this.schema = joi_1.default.object({
            generation: joi_1.default.object({
                total_nfts: joi_1.default.number().integer().min(1).max(1000000).required(),
                frames_per_animation: joi_1.default.number().integer().min(1).max(1000).required(),
                dimensions: joi_1.default.object({
                    width: joi_1.default.number().integer().min(32).max(4096).required(),
                    height: joi_1.default.number().integer().min(32).max(4096).required()
                }).required(),
                upscaling: joi_1.default.string().valid('nearest_neighbour', 'smooth').required(),
                frame_rate: joi_1.default.number().integer().min(1).max(120).required(),
                output_format: joi_1.default.string().valid('gif', 'mp4').required(),
                batch_size: joi_1.default.number().integer().min(1).max(10000).required(),
                max_concurrent: joi_1.default.number().integer().min(1).max(32).required(),
                resume_from: joi_1.default.number().integer().min(0).allow(null).optional()
            }).required(),
            performance: joi_1.default.object({
                worker_threads: joi_1.default.boolean().required(),
                gpu_acceleration: joi_1.default.string().valid('auto', 'gpu', 'cpu').required(),
                memory_limit: joi_1.default.string().pattern(/^\d+[GMK]B$/).required(),
                cpu_cores: joi_1.default.alternatives().try(joi_1.default.string().valid('auto'), joi_1.default.number().integer().min(1).max(32)).required()
            }).required(),
            animation: joi_1.default.object({
                loop_count: joi_1.default.number().integer().min(0).required(),
                optimization: joi_1.default.string().valid('low', 'medium', 'high').required(),
                color_palette: joi_1.default.string().valid('auto', 'web', 'adaptive').required(),
                dithering: joi_1.default.boolean().required()
            }).required(),
            trait_processing_order: joi_1.default.array().items(joi_1.default.string()).min(1).required(),
            incompatible_traits: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.array().items(joi_1.default.string())).required(),
            forced_pairings: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.array().items(joi_1.default.string())).required(),
            dependent_traits: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.string()).optional(),
            exclusive_groups: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.array().items(joi_1.default.string())).optional(),
            conditional_rarity: joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.object().pattern(joi_1.default.string(), joi_1.default.number().min(0).max(1))).optional(),
            metadata: joi_1.default.object({
                name_prefix: joi_1.default.string().required(),
                description: joi_1.default.string().required(),
                external_url: joi_1.default.string().uri().required(),
                image_base_uri: joi_1.default.string().uri().required(),
                animation_base_uri: joi_1.default.string().uri().required(),
                background_color: joi_1.default.string().pattern(/^[0-9a-fA-F]{6}$/).optional(),
                solana: joi_1.default.object({
                    symbol: joi_1.default.string().required(),
                    seller_fee_basis_points: joi_1.default.number().integer().min(0).max(10000).required(),
                    collection: joi_1.default.object({
                        name: joi_1.default.string().required(),
                        family: joi_1.default.string().required()
                    }).required(),
                    properties: joi_1.default.object({
                        files: joi_1.default.array().items(joi_1.default.object({
                            uri: joi_1.default.string().uri().required(),
                            type: joi_1.default.string().required()
                        })).min(1).required(),
                        category: joi_1.default.string().valid('image', 'video', 'audio', 'vr', 'html').required(),
                        creators: joi_1.default.array().items(joi_1.default.object({
                            address: joi_1.default.string().required(),
                            share: joi_1.default.number().integer().min(0).max(100).required(),
                            verified: joi_1.default.boolean().optional()
                        })).optional()
                    }).required(),
                    wallet: joi_1.default.any().strip() // removed from config; ignore if present
                }).required()
            }).required(),
            validation: joi_1.default.object({
                strict_mode: joi_1.default.boolean().required(),
                validate_images: joi_1.default.boolean().required(),
                check_duplicates: joi_1.default.boolean().required(),
                max_retries: joi_1.default.number().integer().min(0).max(10).required()
            }).required()
        });
    }
    validate(config) {
        try {
            const { error, value } = this.schema.validate(config, {
                abortEarly: false,
                stripUnknown: true
            });
            if (error) {
                const errorMessages = error.details.map(detail => detail.message);
                throw new errors_1.GeneratorError(errors_1.ErrorType.CONFIG_ERROR, 'Configuration validation failed', { errors: errorMessages });
            }
            logger_1.default.info('Configuration validation passed');
            return value;
        }
        catch (error) {
            if (error instanceof errors_1.GeneratorError) {
                throw error;
            }
            throw new errors_1.GeneratorError(errors_1.ErrorType.CONFIG_ERROR, `Configuration validation failed: ${error}`, { error });
        }
    }
    validatePartial(config, section) {
        const sectionSchema = this.schema.extract(section);
        try {
            const { error, value } = sectionSchema.validate(config, {
                abortEarly: false,
                stripUnknown: true
            });
            if (error) {
                const errorMessages = error.details.map(detail => detail.message);
                throw new errors_1.GeneratorError(errors_1.ErrorType.CONFIG_ERROR, `Configuration section '${section}' validation failed`, { errors: errorMessages });
            }
            return value;
        }
        catch (error) {
            if (error instanceof errors_1.GeneratorError) {
                throw error;
            }
            throw new errors_1.GeneratorError(errors_1.ErrorType.CONFIG_ERROR, `Configuration section '${section}' validation failed: ${error}`, { error });
        }
    }
    createDefaultConfig() {
        return {
            generation: {
                total_nfts: 1000,
                frames_per_animation: 24,
                dimensions: {
                    width: 512,
                    height: 512
                },
                upscaling: 'nearest_neighbour',
                frame_rate: 24,
                output_format: 'gif',
                batch_size: 100,
                max_concurrent: 4,
                resume_from: null
            },
            performance: {
                worker_threads: true,
                gpu_acceleration: 'auto',
                memory_limit: '4GB',
                cpu_cores: 'auto'
            },
            animation: {
                loop_count: 0,
                optimization: 'high',
                color_palette: 'auto',
                dithering: true
            },
            trait_processing_order: ['background', 'body', 'clothing', 'hats', 'accessories'],
            incompatible_traits: {},
            forced_pairings: {},
            metadata: {
                name_prefix: 'AnimatedNFT',
                description: 'Unique animated NFT collection',
                external_url: 'https://example.com',
                image_base_uri: 'https://example.com/images/',
                animation_base_uri: 'https://example.com/animations/',
                solana: {
                    symbol: 'ANFT',
                    seller_fee_basis_points: 500,
                    collection: {
                        name: 'Animated NFT Collection',
                        family: 'AnimatedNFT'
                    },
                    properties: {
                        files: [
                            {
                                uri: 'https://example.com/images/',
                                type: 'image/png'
                            },
                            {
                                uri: 'https://example.com/animations/',
                                type: 'image/gif'
                            }
                        ],
                        category: 'image',
                        creators: [
                            {
                                address: 'YourWalletAddressHere',
                                share: 100,
                                verified: true
                            }
                        ]
                    }
                }
            },
            validation: {
                strict_mode: true,
                validate_images: true,
                check_duplicates: true,
                max_retries: 3
            }
        };
    }
}
exports.ConfigValidator = ConfigValidator;
//# sourceMappingURL=configValidator.js.map