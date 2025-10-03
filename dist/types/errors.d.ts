export declare enum ErrorType {
    VALIDATION_ERROR = "VALIDATION_ERROR",
    PROCESSING_ERROR = "PROCESSING_ERROR",
    FILE_ERROR = "FILE_ERROR",
    CONFIG_ERROR = "CONFIG_ERROR",
    DUPLICATE_ERROR = "DUPLICATE_ERROR",
    MEMORY_ERROR = "MEMORY_ERROR",
    GPU_ERROR = "GPU_ERROR",
    WORKER_ERROR = "WORKER_ERROR"
}
export declare class GeneratorError extends Error {
    readonly type: ErrorType;
    readonly context?: any;
    readonly recoverable: boolean;
    constructor(type: ErrorType, message: string, context?: any, recoverable?: boolean);
}
export interface ErrorContext {
    file?: string;
    line?: number;
    operation?: string;
    traitType?: string;
    combinationId?: number;
    frameNumber?: number;
    workerId?: string;
}
//# sourceMappingURL=errors.d.ts.map