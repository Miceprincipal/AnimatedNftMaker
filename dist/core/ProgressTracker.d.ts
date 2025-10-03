import { GenerationProgress } from '../types/config';
import { GeneratorError } from '../types/errors';
export declare class ProgressTracker {
    private checkpointFile;
    private progress;
    constructor();
    saveProgress(completed: number, total: number): Promise<void>;
    loadProgress(): Promise<GenerationProgress | null>;
    updateStep(step: GenerationProgress['currentStep']): Promise<void>;
    addError(error: GeneratorError): Promise<void>;
    getProgress(): GenerationProgress | null;
    clearProgress(): Promise<void>;
    getElapsedTime(): number;
    getEstimatedTimeRemaining(): number;
}
//# sourceMappingURL=ProgressTracker.d.ts.map