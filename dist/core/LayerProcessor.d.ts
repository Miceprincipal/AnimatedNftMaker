import { TraitHierarchy, ValidationResult } from '../types/traits';
export declare class LayerProcessor {
    private layersPath;
    private validationResult;
    private requiredFrameCount;
    private traitCache;
    private hierarchy;
    constructor(layersPath: string, requiredFrameCount?: number);
    validateStructure(): Promise<ValidationResult>;
    parseTraitHierarchy(rootPath: string, errors: string[]): Promise<TraitHierarchy>;
    private parseTraitType;
    private hasImageFiles;
    private hasSubdirectories;
    private getImageFiles;
    private validateLeafDirectory;
    private loopFramesToRequiredCount;
    private calculateStats;
    getValidationResult(): ValidationResult | null;
    getAvailableTraits(traitType: string): Promise<any[]>;
    private collectLeafTraits;
}
//# sourceMappingURL=LayerProcessor.d.ts.map