#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const Generator_1 = require("./core/Generator");
// import { ConfigValidator } from './validators/configValidator';
const LayerProcessor_1 = require("./core/LayerProcessor");
const logger_1 = __importDefault(require("./utils/logger"));
const program = new commander_1.Command();
program
    .name('animnft')
    .description('Animated NFT Generator with weighted trait selection')
    .version('1.0.0');
// Generate command
program
    .command('generate')
    .description('Generate animated NFTs')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .option('-b, --batch-size <number>', 'Batch size for processing', '100')
    .option('--count <number>', 'Number of NFTs to generate (overrides config)')
    .option('-r, --resume', 'Resume from last checkpoint')
    .option('-v, --verbose', 'Verbose output')
    .option('--dry-run', 'Validate without generating')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Initializing generator...').start();
    try {
        const generator = new Generator_1.Generator(options.config);
        if (options.dryRun) {
            spinner.text = 'Validating configuration and layers...';
            await generator.validate();
            spinner.succeed('Validation completed successfully');
            return;
        }
        spinner.text = 'Starting generation...';
        await generator.generate({
            resume: options.resume,
            verbose: options.verbose,
            batchSize: parseInt(options.batchSize),
            totalCountOverride: options.count ? parseInt(options.count) : undefined
        });
        spinner.succeed('Generation completed successfully');
        console.log(chalk_1.default.green('\n🎉 All NFTs generated successfully!'));
        console.log(chalk_1.default.blue('📁 Check the output/animations/ folder for your GIFs'));
        process.exit(0);
    }
    catch (error) {
        spinner.fail('Generation failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Metadata command
program
    .command('metadata')
    .description('Generate metadata only')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .option('-r, --resume', 'Resume from last checkpoint')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Generating metadata...').start();
    try {
        const generator = new Generator_1.Generator(options.config);
        await generator.generateMetadata({ resume: options.resume });
        spinner.succeed('Metadata generation completed');
    }
    catch (error) {
        spinner.fail('Metadata generation failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Removed legacy "spritesheets" and "extract-frames" commands
// Animate command
program
    .command('animate')
    .description('Assemble animations from frames')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Assembling animations...').start();
    try {
        const generator = new Generator_1.Generator(options.config);
        await generator.assembleAnimations();
        spinner.succeed('Animation assembly completed');
    }
    catch (error) {
        spinner.fail('Animation assembly failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Validate layers command
program
    .command('validate-layers')
    .description('Validate layer structure')
    .option('-l, --layers <path>', 'Layers directory path', 'layers')
    .option('--strict', 'Enable strict validation')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Validating layer structure...').start();
    try {
        const processor = new LayerProcessor_1.LayerProcessor(options.layers);
        const result = await processor.validateStructure();
        if (result.isValid) {
            spinner.succeed('Layer validation passed');
            console.log(chalk_1.default.green(`✓ ${result.stats.totalTraits} traits found`));
            console.log(chalk_1.default.green(`✓ ${result.stats.totalFrames} frames found`));
            console.log(chalk_1.default.green(`✓ ${result.stats.traitTypes.length} trait types found`));
            if (result.warnings.length > 0) {
                console.log(chalk_1.default.yellow('\nWarnings:'));
                result.warnings.forEach(warning => console.log(chalk_1.default.yellow(`  ⚠ ${warning}`)));
            }
        }
        else {
            spinner.fail('Layer validation failed');
            console.log(chalk_1.default.red('\nErrors:'));
            result.errors.forEach(error => console.log(chalk_1.default.red(`  ✗ ${error}`)));
            process.exit(1);
        }
    }
    catch (error) {
        spinner.fail('Layer validation failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Preview traits command
program
    .command('preview-traits')
    .description('Preview trait combinations')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .option('--count <number>', 'Number of combinations to preview', '10')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Generating trait preview...').start();
    try {
        const generator = new Generator_1.Generator(options.config);
        const combinations = await generator.previewTraits(parseInt(options.count));
        spinner.succeed('Trait preview generated');
        console.log(chalk_1.default.blue('\nTrait Combinations:'));
        combinations.forEach((combo, index) => {
            console.log(chalk_1.default.cyan(`\n${index + 1}. ${combo.metadata.name}`));
            combo.traits.forEach(trait => {
                console.log(chalk_1.default.gray(`   ${trait.type}: ${trait.name}`));
            });
        });
    }
    catch (error) {
        spinner.fail('Trait preview failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Clean output command
program
    .command('clean-output')
    .description('Clean output directory')
    .option('--keep-metadata', 'Keep metadata files')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Cleaning output directory...').start();
    try {
        const generator = new Generator_1.Generator();
        await generator.cleanOutput({ keepMetadata: options.keepMetadata });
        spinner.succeed('Output directory cleaned');
    }
    catch (error) {
        spinner.fail('Cleanup failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Calculate rarity command
program
    .command('calculate-rarity')
    .description('Calculate trait rarities')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .option('-i, --input <path>', 'Input metadata directory (ethereum or solana)', 'output/metadata/ethereum')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Calculating rarities...').start();
    try {
        const generator = new Generator_1.Generator(options.config);
        await generator.calculateRarities(options.input);
        spinner.succeed('Rarity calculation completed');
    }
    catch (error) {
        spinner.fail('Rarity calculation failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Resume command
program
    .command('resume')
    .description('Resume generation from checkpoint')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .action(async (options) => {
    const spinner = (0, ora_1.default)('Resuming generation...').start();
    try {
        const generator = new Generator_1.Generator(options.config);
        await generator.resume();
        spinner.succeed('Generation resumed and completed');
    }
    catch (error) {
        spinner.fail('Resume failed');
        console.error(chalk_1.default.red('Error:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Debug command
program
    .command('debug')
    .description('Debug mode with verbose output')
    .option('-c, --config <path>', 'Config file path', 'config/generator_config.json')
    .option('-t, --trait <type>', 'Debug specific trait type')
    .action(async (options) => {
    console.log(chalk_1.default.blue('Debug mode enabled'));
    console.log(chalk_1.default.gray('Configuration:'), options.config);
    console.log(chalk_1.default.gray('Trait type:'), options.trait || 'all');
    try {
        const generator = new Generator_1.Generator(options.config);
        await generator.debug({ traitType: options.trait });
    }
    catch (error) {
        console.error(chalk_1.default.red('Debug failed:'), error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Error handling
process.on('unhandledRejection', (reason, promise) => {
    logger_1.default.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
process.on('uncaughtException', (error) => {
    logger_1.default.error('Uncaught Exception:', error);
    process.exit(1);
});
// Parse command line arguments
program.parse();
//# sourceMappingURL=index.js.map