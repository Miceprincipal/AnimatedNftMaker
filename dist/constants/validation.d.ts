export declare const VALIDATION_RULES: {
    readonly MAX_FRAME_COUNT: 1000;
    readonly MIN_FRAME_COUNT: 1;
    readonly MAX_DIMENSIONS: 4096;
    readonly MIN_DIMENSIONS: 32;
    readonly MAX_WEIGHT: 10000;
    readonly MIN_WEIGHT: 1;
    readonly MAX_TRAIT_TYPES: 50;
    readonly MAX_TRAITS_PER_TYPE: 1000;
    readonly MAX_NFT_COUNT: 1000000;
    readonly MIN_NFT_COUNT: 1;
    readonly SUPPORTED_IMAGE_FORMATS: readonly [".png"];
    readonly SUPPORTED_ANIMATION_FORMATS: readonly [".gif", ".mp4"];
    readonly MAX_MEMORY_USAGE: number;
    readonly MAX_WORKER_THREADS: 32;
    readonly MIN_WORKER_THREADS: 1;
};
export declare const ERROR_MESSAGES: {
    readonly INVALID_FOLDER_STRUCTURE: "Invalid folder structure: folders cannot contain both files and subfolders";
    readonly INVALID_IMAGE_FORMAT: "Invalid image format: only PNG files are supported";
    readonly MISSING_FRAMES: "Missing required frames: expected {expected} frames, found {actual}";
    readonly INVALID_WEIGHT: "Invalid weight value: must be a positive integer";
    readonly DUPLICATE_COMBINATION: "Duplicate trait combination detected";
    readonly MEMORY_LIMIT_EXCEEDED: "Memory limit exceeded: {used}MB used, {limit}MB limit";
    readonly GPU_NOT_AVAILABLE: "GPU acceleration not available, falling back to CPU";
    readonly WORKER_ERROR: "Worker thread error: {error}";
    readonly CONFIG_VALIDATION_FAILED: "Configuration validation failed: {errors}";
    readonly LAYER_VALIDATION_FAILED: "Layer structure validation failed: {errors}";
};
export declare const WARNING_MESSAGES: {
    readonly LOW_MEMORY: "Low memory warning: {used}MB used, consider reducing batch size";
    readonly SLOW_PERFORMANCE: "Performance warning: using CPU-only mode, consider enabling GPU acceleration";
    readonly HIGH_DUPLICATE_RATE: "High duplicate rate: {rate}% duplicates found, consider adjusting weights";
    readonly LARGE_BATCH_SIZE: "Large batch size warning: {size} NFTs per batch may cause memory issues";
};
//# sourceMappingURL=validation.d.ts.map