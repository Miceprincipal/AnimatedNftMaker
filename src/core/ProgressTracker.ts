import fs from 'fs-extra';
import path from 'path';
import { GenerationProgress } from '../types/config';
import { GeneratorError, ErrorType } from '../types/errors';
import logger from '../utils/logger';

export class ProgressTracker {
  private checkpointFile: string;
  private progress: GenerationProgress | null = null;

  constructor() {
    this.checkpointFile = path.join(process.cwd(), 'output', 'checkpoints', 'generation_progress.json');
  }

  async saveProgress(completed: number, total: number): Promise<void> {
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
      await fs.ensureDir(path.dirname(this.checkpointFile));
      await fs.writeJson(this.checkpointFile, this.progress, { spaces: 2 });
      
      logger.debug('Progress saved', {
        completed,
        total,
        percentage: ((completed / total) * 100).toFixed(2)
      });
    } catch (error) {
      logger.error('Failed to save progress', { error });
    }
  }

  async loadProgress(): Promise<GenerationProgress | null> {
    try {
      if (await fs.pathExists(this.checkpointFile)) {
        this.progress = await fs.readJson(this.checkpointFile);
        logger.info('Progress loaded from checkpoint', {
          currentStep: this.progress?.currentStep,
          completed: this.progress?.completed,
          total: this.progress?.total
        });
        return this.progress;
      }
    } catch (error) {
      logger.error('Failed to load progress', { error });
    }
    
    return null;
  }

  async updateStep(step: GenerationProgress['currentStep']): Promise<void> {
    if (!this.progress) {
      throw new GeneratorError(
        ErrorType.PROCESSING_ERROR,
        'Progress tracker not initialized'
      );
    }

    this.progress.currentStep = step;
    await this.saveProgress(this.progress.completed, this.progress.total);
    
    logger.info('Generation step updated', { step });
  }

  async addError(error: GeneratorError): Promise<void> {
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
    
    logger.warn('Error added to progress tracker', {
      errorType: error.type,
      message: error.message
    });
  }

  getProgress(): GenerationProgress | null {
    return this.progress;
  }

  async clearProgress(): Promise<void> {
    try {
      if (await fs.pathExists(this.checkpointFile)) {
        await fs.remove(this.checkpointFile);
      }
      this.progress = null;
      logger.info('Progress cleared');
    } catch (error) {
      logger.error('Failed to clear progress', { error });
    }
  }

  getElapsedTime(): number {
    if (!this.progress) {
      return 0;
    }

    return Date.now() - this.progress.startTime.getTime();
  }

  getEstimatedTimeRemaining(): number {
    if (!this.progress || this.progress.completed === 0) {
      return 0;
    }

    const elapsed = this.getElapsedTime();
    const rate = this.progress.completed / elapsed;
    const remaining = this.progress.total - this.progress.completed;
    
    return remaining / rate;
  }
}

