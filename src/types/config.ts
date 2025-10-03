export interface GenerationConfig {
  total_nfts: number;
  frames_per_animation: number;
  dimensions: {
    width: number;
    height: number;
  };
  upscaling: 'nearest_neighbour' | 'smooth';
  frame_rate: number;
  output_format: 'gif' | 'mp4';
  batch_size: number;
  max_concurrent: number;
  resume_from?: number | null;
}

export interface PerformanceConfig {
  worker_threads: boolean;
  gpu_acceleration: 'auto' | 'gpu' | 'cpu';
  memory_limit: string;
  cpu_cores: 'auto' | number;
}

export interface AnimationConfig {
  loop_count: number;
  optimization: 'low' | 'medium' | 'high';
  color_palette: 'auto' | 'web' | 'adaptive';
  dithering: boolean;
}

export interface ValidationConfig {
  strict_mode: boolean;
  validate_images: boolean;
  check_duplicates: boolean;
  max_retries: number;
}

export interface MetadataConfig {
  name_prefix: string;
  description: string;
  external_url: string;
  image_base_uri: string;
  animation_base_uri: string;
  background_color?: string; // optional hex (without #), used by ETH metadata
  // Solana-specific fields
  solana: {
    symbol: string;
    seller_fee_basis_points: number;
    collection: {
      name: string;
      family: string;
    };
    properties: {
      files: Array<{
        uri: string;
        type: string;
      }>;
      category: string;
      creators: Array<{
        address: string;
        share: number;
        verified?: boolean;
      }>;
    };
  };
}

export interface GeneratorConfig {
  generation: GenerationConfig;
  performance: PerformanceConfig;
  animation: AnimationConfig;
  trait_processing_order: string[];
  incompatible_traits: Record<string, string[]>;
  forced_pairings: Record<string, string[]>;
  dependent_traits?: Record<string, string>;
  exclusive_groups?: Record<string, string[]>;
  conditional_rarity?: Record<string, Record<string, number>>;
  metadata: MetadataConfig;
  validation: ValidationConfig;
}

export interface PerformanceCapabilities {
  workerThreads: boolean;
  gpuAcceleration: boolean;
  openclSupport: boolean;
  cudaSupport: boolean;
  memoryLimit: number;
  cpuCores: number;
}

export interface GenerationProgress {
  currentStep: 'metadata' | 'spritesheets' | 'frames' | 'animate';
  completed: number;
  total: number;
  startTime: Date;
  lastCheckpoint: Date;
  errors: any[];
}
