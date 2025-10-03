import { TraitCombination } from '../types/traits';
export interface GenerationOptions {
    resume?: boolean;
    verbose?: boolean;
    batchSize?: number;
    totalCountOverride?: number | undefined;
}
export declare class Generator {
    private config;
    private layerProcessor;
    private traitSelector;
    private animationGenerator;
    private configValidator;
    private currentCombinations;
    constructor(configPath?: string);
    private loadConfig;
    validate(): Promise<void>;
    generate(options?: GenerationOptions): Promise<void>;
    generateMetadata(options?: GenerationOptions): Promise<void>;
    extractFrames(): Promise<void>;
    assembleAnimations(): Promise<void>;
    previewTraits(count: number): Promise<TraitCombination[]>;
    calculateRarities(inputDir: string): Promise<void>;
    cleanOutput(options?: {
        keepMetadata?: boolean;
    }): Promise<void>;
    resume(): Promise<void>;
    debug(options?: {
        traitType?: string;
    }): Promise<void>;
    private loadCombinationsFromMetadata;
    private generateCollectionMetadata;
}
//# sourceMappingURL=Generator.d.ts.map