import { GeneratorConfig } from '../types/config';
export declare class ConfigValidator {
    private schema;
    constructor();
    validate(config: any): GeneratorConfig;
    validatePartial(config: any, section: string): any;
    createDefaultConfig(): GeneratorConfig;
}
//# sourceMappingURL=configValidator.d.ts.map