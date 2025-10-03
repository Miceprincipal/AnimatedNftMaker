import Joi from 'joi';
import { GeneratorConfig } from '../types/config';
import { GeneratorError, ErrorType } from '../types/errors';
import logger from '../utils/logger';

export class ConfigValidator {
  private schema: Joi.ObjectSchema;

  constructor() {
    this.schema = Joi.object({
      generation: Joi.object({
        total_nfts: Joi.number().integer().min(1).max(1000000).required(),
        frames_per_animation: Joi.number().integer().min(1).max(1000).required(),
        dimensions: Joi.object({
          width: Joi.number().integer().min(32).max(4096).required(),
          height: Joi.number().integer().min(32).max(4096).required()
        }).required(),
        upscaling: Joi.string().valid('nearest_neighbour', 'smooth').required(),
        frame_rate: Joi.number().integer().min(1).max(120).required(),
        output_format: Joi.string().valid('gif', 'mp4').required(),
        batch_size: Joi.number().integer().min(1).max(10000).required(),
        max_concurrent: Joi.number().integer().min(1).max(32).required(),
        resume_from: Joi.number().integer().min(0).allow(null).optional()
      }).required(),
      
      performance: Joi.object({
        worker_threads: Joi.boolean().required(),
        gpu_acceleration: Joi.string().valid('auto', 'gpu', 'cpu').required(),
        memory_limit: Joi.string().pattern(/^\d+[GMK]B$/).required(),
        cpu_cores: Joi.alternatives().try(
          Joi.string().valid('auto'),
          Joi.number().integer().min(1).max(32)
        ).required()
      }).required(),
      
      animation: Joi.object({
        loop_count: Joi.number().integer().min(0).required(),
        optimization: Joi.string().valid('low', 'medium', 'high').required(),
        color_palette: Joi.string().valid('auto', 'web', 'adaptive').required(),
        dithering: Joi.boolean().required()
      }).required(),
      
      trait_processing_order: Joi.array().items(Joi.string()).min(1).required(),
      
      incompatible_traits: Joi.object().pattern(
        Joi.string(),
        Joi.array().items(Joi.string())
      ).required(),
      
      forced_pairings: Joi.object().pattern(
        Joi.string(),
        Joi.array().items(Joi.string())
      ).required(),
      
      dependent_traits: Joi.object().pattern(
        Joi.string(),
        Joi.string()
      ).optional(),
      
      exclusive_groups: Joi.object().pattern(
        Joi.string(),
        Joi.array().items(Joi.string())
      ).optional(),
      
      conditional_rarity: Joi.object().pattern(
        Joi.string(),
        Joi.object().pattern(
          Joi.string(),
          Joi.number().min(0).max(1)
        )
      ).optional(),
      
      metadata: Joi.object({
        name_prefix: Joi.string().required(),
        description: Joi.string().required(),
        external_url: Joi.string().uri().required(),
        image_base_uri: Joi.string().uri().required(),
        animation_base_uri: Joi.string().uri().required(),
        background_color: Joi.string().pattern(/^[0-9a-fA-F]{6}$/).optional(),
        solana: Joi.object({
          symbol: Joi.string().required(),
          seller_fee_basis_points: Joi.number().integer().min(0).max(10000).required(),
          collection: Joi.object({
            name: Joi.string().required(),
            family: Joi.string().required()
          }).required(),
          properties: Joi.object({
            files: Joi.array().items(Joi.object({
              uri: Joi.string().uri().required(),
              type: Joi.string().required()
            })).min(1).required(),
            category: Joi.string().valid('image', 'video', 'audio', 'vr', 'html').required(),
            creators: Joi.array().items(Joi.object({
              address: Joi.string().required(),
              share: Joi.number().integer().min(0).max(100).required(),
              verified: Joi.boolean().optional()
            })).optional()
          }).required(),
          wallet: Joi.any().strip() // removed from config; ignore if present
        }).required()
      }).required(),
      
      validation: Joi.object({
        strict_mode: Joi.boolean().required(),
        validate_images: Joi.boolean().required(),
        check_duplicates: Joi.boolean().required(),
        max_retries: Joi.number().integer().min(0).max(10).required()
      }).required()
    });
  }

  validate(config: any): GeneratorConfig {
    try {
      const { error, value } = this.schema.validate(config, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        throw new GeneratorError(
          ErrorType.CONFIG_ERROR,
          'Configuration validation failed',
          { errors: errorMessages }
        );
      }

      logger.info('Configuration validation passed');
      return value as GeneratorConfig;
    } catch (error) {
      if (error instanceof GeneratorError) {
        throw error;
      }
      throw new GeneratorError(
        ErrorType.CONFIG_ERROR,
        `Configuration validation failed: ${error}`,
        { error }
      );
    }
  }

  validatePartial(config: any, section: string): any {
    const sectionSchema = this.schema.extract(section);
    
    try {
      const { error, value } = sectionSchema.validate(config, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        throw new GeneratorError(
          ErrorType.CONFIG_ERROR,
          `Configuration section '${section}' validation failed`,
          { errors: errorMessages }
        );
      }

      return value;
    } catch (error) {
      if (error instanceof GeneratorError) {
        throw error;
      }
      throw new GeneratorError(
        ErrorType.CONFIG_ERROR,
        `Configuration section '${section}' validation failed: ${error}`,
        { error }
      );
    }
  }

  createDefaultConfig(): GeneratorConfig {
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

