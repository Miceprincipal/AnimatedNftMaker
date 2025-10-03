export enum ErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  FILE_ERROR = 'FILE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  DUPLICATE_ERROR = 'DUPLICATE_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR',
  GPU_ERROR = 'GPU_ERROR',
  WORKER_ERROR = 'WORKER_ERROR'
}

export class GeneratorError extends Error {
  public readonly type: ErrorType;
  public readonly context?: any;
  public readonly recoverable: boolean;

  constructor(
    type: ErrorType,
    message: string,
    context?: any,
    recoverable: boolean = false
  ) {
    super(message);
    this.name = 'GeneratorError';
    this.type = type;
    this.context = context;
    this.recoverable = recoverable;
  }
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

