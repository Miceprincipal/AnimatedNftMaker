export const VALIDATION_RULES = {
  MAX_FRAME_COUNT: 1000,
  MIN_FRAME_COUNT: 1,
  MAX_DIMENSIONS: 4096,
  MIN_DIMENSIONS: 32,
  MAX_WEIGHT: 10000,
  MIN_WEIGHT: 1,
  MAX_TRAIT_TYPES: 50,
  MAX_TRAITS_PER_TYPE: 1000,
  MAX_NFT_COUNT: 1000000,
  MIN_NFT_COUNT: 1,
  SUPPORTED_IMAGE_FORMATS: ['.png'],
  SUPPORTED_ANIMATION_FORMATS: ['.gif', '.mp4'],
  MAX_MEMORY_USAGE: 8 * 1024 * 1024 * 1024, // 8GB
  MAX_WORKER_THREADS: 32,
  MIN_WORKER_THREADS: 1
} as const;

export const ERROR_MESSAGES = {
  INVALID_FOLDER_STRUCTURE: 'Invalid folder structure: folders cannot contain both files and subfolders',
  INVALID_IMAGE_FORMAT: 'Invalid image format: only PNG files are supported',
  MISSING_FRAMES: 'Missing required frames: expected {expected} frames, found {actual}',
  INVALID_WEIGHT: 'Invalid weight value: must be a positive integer',
  DUPLICATE_COMBINATION: 'Duplicate trait combination detected',
  MEMORY_LIMIT_EXCEEDED: 'Memory limit exceeded: {used}MB used, {limit}MB limit',
  GPU_NOT_AVAILABLE: 'GPU acceleration not available, falling back to CPU',
  WORKER_ERROR: 'Worker thread error: {error}',
  CONFIG_VALIDATION_FAILED: 'Configuration validation failed: {errors}',
  LAYER_VALIDATION_FAILED: 'Layer structure validation failed: {errors}'
} as const;

export const WARNING_MESSAGES = {
  LOW_MEMORY: 'Low memory warning: {used}MB used, consider reducing batch size',
  SLOW_PERFORMANCE: 'Performance warning: using CPU-only mode, consider enabling GPU acceleration',
  HIGH_DUPLICATE_RATE: 'High duplicate rate: {rate}% duplicates found, consider adjusting weights',
  LARGE_BATCH_SIZE: 'Large batch size warning: {size} NFTs per batch may cause memory issues'
} as const;

