"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressTracker = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
const errors_1 = require("../types/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class ProgressTracker {
    constructor() {
        this.progress = null;
        this.checkpointFile = path_1.default.join(process.cwd(), 'output', 'checkpoints', 'generation_progress.json');
    }
    async saveProgress(completed, total) {
        if (!this.progress) {
            this.progress = {
                currentStep: 'metadata',
                completed: 0,
                total: 0,
                startTime: new Date(),
                lastCheckpoint: new Date(),
                errors: []
            };
        }
        this.progress.completed = completed;
        this.progress.total = total;
        this.progress.lastCheckpoint = new Date();
        try {
            await fs_extra_1.default.ensureDir(path_1.default.dirname(this.checkpointFile));
            await fs_extra_1.default.writeJson(this.checkpointFile, this.progress, { spaces: 2 });
            logger_1.default.debug('Progress saved', {
                completed,
                total,
                percentage: ((completed / total) * 100).toFixed(2)
            });
        }
        catch (error) {
            logger_1.default.error('Failed to save progress', { error });
        }
    }
    async loadProgress() {
        try {
            if (await fs_extra_1.default.pathExists(this.checkpointFile)) {
                this.progress = await fs_extra_1.default.readJson(this.checkpointFile);
                logger_1.default.info('Progress loaded from checkpoint', {
                    currentStep: this.progress?.currentStep,
                    completed: this.progress?.completed,
                    total: this.progress?.total
                });
                return this.progress;
            }
        }
        catch (error) {
            logger_1.default.error('Failed to load progress', { error });
        }
        return null;
    }
    async updateStep(step) {
        if (!this.progress) {
            throw new errors_1.GeneratorError(errors_1.ErrorType.PROCESSING_ERROR, 'Progress tracker not initialized');
        }
        this.progress.currentStep = step;
        await this.saveProgress(this.progress.completed, this.progress.total);
        logger_1.default.info('Generation step updated', { step });
    }
    async addError(error) {
        if (!this.progress) {
            this.progress = {
                currentStep: 'metadata',
                completed: 0,
                total: 0,
                startTime: new Date(),
                lastCheckpoint: new Date(),
                errors: []
            };
        }
        this.progress.errors.push(error);
        await this.saveProgress(this.progress.completed, this.progress.total);
        logger_1.default.warn('Error added to progress tracker', {
            errorType: error.type,
            message: error.message
        });
    }
    getProgress() {
        return this.progress;
    }
    async clearProgress() {
        try {
            if (await fs_extra_1.default.pathExists(this.checkpointFile)) {
                await fs_extra_1.default.remove(this.checkpointFile);
            }
            this.progress = null;
            logger_1.default.info('Progress cleared');
        }
        catch (error) {
            logger_1.default.error('Failed to clear progress', { error });
        }
    }
    getElapsedTime() {
        if (!this.progress) {
            return 0;
        }
        return Date.now() - this.progress.startTime.getTime();
    }
    getEstimatedTimeRemaining() {
        if (!this.progress || this.progress.completed === 0) {
            return 0;
        }
        const elapsed = this.getElapsedTime();
        const rate = this.progress.completed / elapsed;
        const remaining = this.progress.total - this.progress.completed;
        return remaining / rate;
    }
}
exports.ProgressTracker = ProgressTracker;
//# sourceMappingURL=ProgressTracker.js.map