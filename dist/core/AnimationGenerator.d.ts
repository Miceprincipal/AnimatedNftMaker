import { TraitCombination } from '../types/traits';
import { GeneratorConfig } from '../types/config';
export declare class AnimationGenerator {
    private config;
    private gpuAvailable;
    private imageCache;
    private maxCacheSize;
    private ffmpegHwAccel;
    private getPngCompressionLevel;
    constructor(config: GeneratorConfig);
    generateFramesDirectly(combinations: TraitCombination[]): Promise<void>;
    private prewarmImageCache;
    private detectGPU;
    private getFrameComposites;
    extractFrames(combinations: TraitCombination[]): Promise<void>;
    private extractFramesForCombination;
    assembleAnimations(combinations: TraitCombination[]): Promise<void>;
    private assembleAnimation;
    private createGIF;
    private createMP4;
    cleanupIntermediateFiles(): Promise<void>;
}
//# sourceMappingURL=AnimationGenerator.d.ts.map