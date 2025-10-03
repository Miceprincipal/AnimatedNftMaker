import { ConfigValidator } from '../../src/validators/configValidator';
import { GeneratorError, ErrorType } from '../../src/types/errors';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = new ConfigValidator();
  });

  describe('validate', () => {
    it('should validate a correct configuration', () => {
      const validConfig = {
        generation: {
          total_nfts: 1000,
          frames_per_animation: 24,
          dimensions: { width: 512, height: 512 },
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
        trait_processing_order: ['background', 'body'],
        incompatible_traits: {},
        forced_pairings: {},
        metadata: {
          name_prefix: 'TestNFT',
          description: 'Test collection',
          external_url: 'https://example.com',
          image_base_uri: 'https://example.com/images/',
          animation_base_uri: 'https://example.com/animations/'
        },
        validation: {
          strict_mode: true,
          validate_images: true,
          check_duplicates: true,
          max_retries: 3
        }
      };

      expect(() => validator.validate(validConfig)).not.toThrow();
    });

    it('should reject invalid configuration', () => {
      const invalidConfig = {
        generation: {
          total_nfts: -1, // Invalid: negative number
          frames_per_animation: 24,
          dimensions: { width: 512, height: 512 },
          upscaling: 'nearest_neighbour',
          frame_rate: 24,
          output_format: 'gif',
          batch_size: 100,
          max_concurrent: 4
        }
      };

      expect(() => validator.validate(invalidConfig)).toThrow(GeneratorError);
    });

    it('should reject missing required fields', () => {
      const incompleteConfig = {
        generation: {
          total_nfts: 1000
          // Missing other required fields
        }
      };

      expect(() => validator.validate(incompleteConfig)).toThrow(GeneratorError);
    });
  });

  describe('createDefaultConfig', () => {
    it('should create a valid default configuration', () => {
      const defaultConfig = validator.createDefaultConfig();
      expect(() => validator.validate(defaultConfig)).not.toThrow();
    });
  });
});

