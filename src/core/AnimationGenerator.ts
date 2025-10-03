import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { TraitCombination } from '../types/traits';
import { GeneratorConfig } from '../types/config';
import { GeneratorError, ErrorType } from '../types/errors';
import logger from '../utils/logger';

export class AnimationGenerator {
  private config: GeneratorConfig;
  // private sharp: typeof sharp;
  private gpuAvailable: boolean = false;
  private imageCache: Map<string, Buffer> = new Map();
  private maxCacheSize: number = 1000; // Limit cache size to prevent memory issues
  private ffmpegHwAccel: boolean = true;
  
  private getPngCompressionLevel(): number {
    const opt = this.config.animation?.optimization || 'high';
    if (opt === 'low') return 2;
    if (opt === 'medium') return 4;
    return 6; // high
  }

  constructor(config: GeneratorConfig) {
    this.config = config;
    // this.sharp = sharp;
    this.detectGPU();
    // Configure sharp concurrency based on cpu_cores if numeric
    try {
      if (typeof this.config.performance?.cpu_cores === 'number' && this.config.performance.cpu_cores > 0) {
        // @ts-ignore - sharp.concurrency exists at runtime
        sharp.concurrency(this.config.performance.cpu_cores as number);
      }
    } catch {}
    // Decide hwaccel behavior from performance.gpu_acceleration
    const accel = this.config.performance?.gpu_acceleration || 'auto';
    this.ffmpegHwAccel = accel !== 'cpu';
  }

  // New: Direct per-frame compositing (no giant spritesheets)
  async generateFramesDirectly(combinations: TraitCombination[]): Promise<void> {
    const framesRoot = path.join(process.cwd(), 'output', 'frames');
    await fs.ensureDir(framesRoot);

    // Optional warm cache: read & resize once per unique frame path
    await this.prewarmImageCache(combinations);

    const maxConcurrent = this.config.generation.max_concurrent || 4;
    for (let i = 0; i < combinations.length; i += maxConcurrent) {
      const batch = combinations.slice(i, i + maxConcurrent);
      const results = await Promise.allSettled(batch.map(async (combination) => {
        const comboDir = path.join(framesRoot, combination.id.toString());
        await fs.ensureDir(comboDir);

        const { width, height } = this.config.generation.dimensions;
        const framesPerAnimation = this.config.generation.frames_per_animation;

        // Reuse a transparent base buffer for all frames of this combination
        const baseTransparent = await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        }).png().toBuffer();

        let previousCompositeKey = '';
        for (let frameIndex = 0; frameIndex < framesPerAnimation; frameIndex++) {
          const composites = await this.getFrameComposites(combination, frameIndex);
          const frameOutput = path.join(comboDir, `frame_${String(frameIndex + 1).padStart(3, '0')}.png`);

          // Skip identical frames: build a simple signature of inputs
          const compositeKey = composites.map(c => (c.input as Buffer).byteLength).join(',');
          if (compositeKey === previousCompositeKey && frameIndex > 0) {
            const prevOutput = path.join(comboDir, `frame_${String(frameIndex).padStart(3, '0')}.png`);
            try { await fs.copy(prevOutput, frameOutput); continue; } catch {}
          }

          await sharp(baseTransparent)
          .composite(composites)
          .png({ compressionLevel: this.getPngCompressionLevel(), adaptiveFiltering: false, force: true })
          .toFile(frameOutput);

          previousCompositeKey = compositeKey;
        }

        return { success: true, id: combination.id };
      }));

      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      if (failed === batch.length) {
        throw new GeneratorError(ErrorType.PROCESSING_ERROR, 'All frame composites failed in batch', { batchIds: batch.map(b => b.id) });
      }
      console.log(`🎨 Direct frames: +${succeeded} ok, ${failed} failed (total ${i + batch.length}/${combinations.length})`);
    }

    logger.info('Direct frame generation completed', { total: combinations.length });
  }

  // Preload and resize all unique images referenced by combinations
  private async prewarmImageCache(combinations: TraitCombination[]): Promise<void> {
    const uniquePaths = new Set<string>();
    const { width, height } = this.config.generation.dimensions;

    for (const combo of combinations) {
      for (const trait of combo.traits) {
        if (!trait.path || !trait.frames || trait.frames.length === 0) continue;
        for (const fname of trait.frames) {
          const p = path.join(trait.path, fname);
          const key = `${p}_${width}x${height}_${this.config.generation.upscaling}`;
          if (!this.imageCache.has(key)) uniquePaths.add(p);
        }
      }
    }

    const paths = Array.from(uniquePaths);
    const maxConcurrent = Math.max(1, Math.min(this.config.generation.max_concurrent || 4, 16));
    for (let i = 0; i < paths.length; i += maxConcurrent) {
      const batch = paths.slice(i, i + maxConcurrent);
      await Promise.allSettled(batch.map(async (p) => {
        try {
          const buf = await fs.readFile(p);
          const img = sharp(buf);
          const resized = await img
            .resize(width, height, {
              kernel: this.config.generation.upscaling === 'smooth' ? sharp.kernel.lanczos3 : sharp.kernel.nearest
            })
            .png({ compressionLevel: this.getPngCompressionLevel(), adaptiveFiltering: false })
            .toBuffer();
          const key = `${p}_${width}x${height}_${this.config.generation.upscaling}`;
          if (this.imageCache.size >= this.maxCacheSize) {
            const firstKey = this.imageCache.keys().next().value;
            if (firstKey) this.imageCache.delete(firstKey);
          }
          this.imageCache.set(key, resized);
        } catch {}
      }));
    }
  }

  private detectGPU(): void {
    try {
      // Check if Sharp has OpenCL support
      this.gpuAvailable = false; // OpenCL detection not available in current Sharp version
      logger.info('GPU detection completed', { gpuAvailable: this.gpuAvailable });
    } catch (error) {
      this.gpuAvailable = false;
      logger.warn('GPU detection failed, falling back to CPU', { error });
    }
  }

  // Legacy spritesheet methods removed (replaced by direct frame compositing)

  private async getFrameComposites(combination: TraitCombination, frameIndex: number): Promise<any[]> {
    const composites = [];
    
    logger.debug('Processing frame composites', { 
      combinationId: combination.id, 
      frameIndex, 
      traitCount: combination.traits.length 
    });
    
    for (const trait of combination.traits) {
      if (trait.frames && trait.frames.length > 0) {
        // If only one frame exists for this trait, use it for all frame indices
        const chosenFileName = trait.frames.length === 1 ? trait.frames[0] : trait.frames[frameIndex];
        
        try {
          if (!chosenFileName) {
            logger.warn('No frame filename found', { 
              combinationId: combination.id, 
              frameIndex, 
              traitType: trait.type, 
              traitName: trait.name 
            });
            continue;
          }
          
          // Validate trait path exists
          if (!trait.path) {
            logger.warn('Trait path is missing', { 
              combinationId: combination.id, 
              frameIndex, 
              traitType: trait.type, 
              traitName: trait.name 
            });
            continue;
          }
          
          // Construct the full path using the trait's path and frame filename
          const framePath = path.join(trait.path, chosenFileName);
          
          // Check if file exists
          if (!await fs.pathExists(framePath)) {
            logger.warn('Frame file does not exist', { 
              combinationId: combination.id, 
              frameIndex, 
              traitType: trait.type, 
              traitName: trait.name,
              framePath 
            });
            continue;
          }
          
          logger.debug('Processing trait frame', { 
            combinationId: combination.id, 
            frameIndex, 
            traitType: trait.type, 
            traitName: trait.name,
            framePath 
          });
          
          // Check cache first
          const cacheKey = `${framePath}_${this.config.generation.dimensions.width}x${this.config.generation.dimensions.height}_${this.config.generation.upscaling}`;
          let resizedImage: Buffer;
          
          if (this.imageCache.has(cacheKey)) {
            logger.debug('Using cached image', { combinationId: combination.id, framePath });
            resizedImage = this.imageCache.get(cacheKey)!;
          } else {
            logger.debug('Reading and processing image', { combinationId: combination.id, framePath });
            const frameBuffer = await fs.readFile(framePath);
            logger.debug('File read complete, creating Sharp instance', { combinationId: combination.id, framePath });
            const frameImage = sharp(frameBuffer);
            
            // Resize if needed
            const { width, height } = this.config.generation.dimensions;
            logger.debug('Starting Sharp resize operation', { combinationId: combination.id, framePath, width, height });
            resizedImage = await frameImage
              .resize(width, height, {
                kernel: this.config.generation.upscaling === 'smooth' 
                  ? sharp.kernel.lanczos3 
                  : sharp.kernel.nearest
              })
              .png()
              .toBuffer();
            logger.debug('Sharp resize complete', { combinationId: combination.id, framePath });
              
            // Cache the result with size management
            if (this.imageCache.size >= this.maxCacheSize) {
              // Clear oldest entries (Map maintains insertion order)
              const firstKey = this.imageCache.keys().next().value;
              if (firstKey) {
                this.imageCache.delete(firstKey);
              }
            }
            this.imageCache.set(cacheKey, resizedImage);
          }

          composites.push({
            input: resizedImage,
            blend: 'over'
          });
          
          logger.debug('Added composite', {
            trait: `${trait.type}:${trait.name}`,
            frameIndex,
            compositeCount: composites.length
          });
        } catch (error) {
          // Fallback: if directory contains exactly one image, use it regardless of name
          try {
            const dirEntries = await fs.readdir(trait.path);
            const imageFiles = dirEntries.filter((entry: string) =>
              ['.png', '.jpg', '.jpeg', '.webp'].some(ext => entry.toLowerCase().endsWith(ext))
            );
            if (imageFiles.length === 1) {
              const fallbackPath = path.join(trait.path, imageFiles[0] || '0.png');
              const fallbackCacheKey = `${fallbackPath}_${this.config.generation.dimensions.width}x${this.config.generation.dimensions.height}_${this.config.generation.upscaling}`;
              let resizedImage: Buffer;
              
              if (this.imageCache.has(fallbackCacheKey)) {
                resizedImage = this.imageCache.get(fallbackCacheKey)!;
              } else {
                const fbBuffer = await fs.readFile(fallbackPath);
                const fbImage = sharp(fbBuffer);
                const { width, height } = this.config.generation.dimensions;
                resizedImage = await fbImage
                  .resize(width, height, {
                    kernel: this.config.generation.upscaling === 'smooth'
                      ? sharp.kernel.lanczos3
                      : sharp.kernel.nearest
                  })
                  .png()
                  .toBuffer();
                  
                // Cache the result with size management
                if (this.imageCache.size >= this.maxCacheSize) {
                  const firstKey = this.imageCache.keys().next().value;
                  if (firstKey) {
                    this.imageCache.delete(firstKey);
                  }
                }
                this.imageCache.set(fallbackCacheKey, resizedImage);
              }

              composites.push({ input: resizedImage, blend: 'over' });
              logger.warn('Frame missing, used single-image fallback', {
                trait: `${trait.type}:${trait.name}`,
                frameIndex,
                fallbackPath,
                availableFiles: dirEntries
              });
              continue;
            }
          } catch (fallbackError) {
            logger.warn('Fallback also failed', {
              trait: `${trait.type}:${trait.name}`,
              frameIndex,
              fallbackError: fallbackError instanceof Error ? fallbackError.message : fallbackError
            });
          }

          logger.warn('Failed to process frame', {
            trait: `${trait.type}:${trait.name}`,
            frameIndex,
            framePath: path.join(trait.path, (trait.frames[frameIndex] || trait.frames[0] || '')),
            error: error instanceof Error ? error.message : error
          });
        }
      }
    }

    // Removed debug logging for performance

    return composites;
  }

  async extractFrames(combinations: TraitCombination[]): Promise<void> {
    const framesDir = path.join(process.cwd(), 'output', 'frames');
    await fs.ensureDir(framesDir);

    logger.info('Starting frame extraction', {
      totalCombinations: combinations.length
    });

    // Respect configured concurrency
    const batchSize = this.config.generation.max_concurrent || 4;
    let completed = 0;

    for (let i = 0; i < combinations.length; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(batch.map(async (combination) => {
        try {
          await this.extractFramesForCombination(combination, framesDir);
          return { success: true, combinationId: combination.id };
        } catch (error) {
          logger.error('Failed to extract frames', {
            combinationId: combination.id,
            error: error instanceof Error ? error.message : error
          });
          return { success: false, combinationId: combination.id, error };
        }
      }));

      // Check if any extractions failed and throw if all failed
      const failedResults = batchResults.filter(result => 
        result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)
      );
      
      if (failedResults.length === batch.length) {
        const errors = failedResults.map(result => 
          result.status === 'rejected' ? result.reason : result.value.error
        );
        throw new GeneratorError(
          ErrorType.PROCESSING_ERROR,
          `All frame extractions in batch failed`,
          { errors }
        );
      }

      // Count successful extractions
      const successful = batchResults.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;
      
      completed += successful;
      
      // Progress feedback
      const failedCount = batch.length - successful;
      if (failedCount > 0) {
        console.log(`🎬 Frames: ${completed}/${combinations.length} (${Math.round((completed / combinations.length) * 100)}%) - ${failedCount} failed in this batch`);
      } else {
        console.log(`🎬 Frames: ${completed}/${combinations.length} (${Math.round((completed / combinations.length) * 100)}%)`);
      }
    }

    logger.info('Frame extraction completed', {
      totalProcessed: combinations.length
    });
  }

  private async extractFramesForCombination(combination: TraitCombination, outputDir: string): Promise<void> {
    const combinationDir = path.join(outputDir, combination.id.toString());
    await fs.ensureDir(combinationDir);

    const spritesheetPath = path.join(process.cwd(), 'output', 'spritesheets', `${combination.id}.png`);
    
    if (!await fs.pathExists(spritesheetPath)) {
      throw new GeneratorError(
        ErrorType.FILE_ERROR,
        `Spritesheet not found: ${spritesheetPath}`,
        { spritesheetPath }
      );
    }

    const { width, height } = this.config.generation.dimensions;
    const framesPerAnimation = this.config.generation.frames_per_animation;

    try {
      // Process frames one at a time to prevent system overload
      const frameBatchSize = 1;
      
      for (let frameStart = 0; frameStart < framesPerAnimation; frameStart += frameBatchSize) {
        const framePromises = [];
        for (let frameIndex = frameStart; frameIndex < Math.min(frameStart + frameBatchSize, framesPerAnimation); frameIndex++) {
          const left = frameIndex * width;
          const framePath = path.join(combinationDir, `frame_${String(frameIndex + 1).padStart(3, '0')}.png`);
          
          framePromises.push(
            sharp(spritesheetPath)
              .extract({ left, top: 0, width, height })
              .png({ 
                compressionLevel: 6,
                adaptiveFiltering: false,
                force: true
              })
              .toFile(framePath)
          );
        }
        
        await Promise.all(framePromises);
      }
      
      // Verify frames were created
      const createdFrames = await fs.readdir(combinationDir);
      const pngFrames = createdFrames.filter(file => file.endsWith('.png'));
      
      if (pngFrames.length === 0) {
        throw new GeneratorError(
          ErrorType.PROCESSING_ERROR,
          `No frames were extracted for combination ${combination.id}`,
          { combinationId: combination.id, combinationDir, spritesheetPath }
        );
      }
      
      logger.debug('Frames extracted successfully', {
        combinationId: combination.id,
        frameCount: pngFrames.length,
        expectedCount: framesPerAnimation
      });
      
    } catch (error) {
      logger.error('Frame extraction failed', {
        combinationId: combination.id,
        spritesheetPath,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async assembleAnimations(combinations: TraitCombination[]): Promise<void> {
    const animationsDir = path.join(process.cwd(), 'output', 'animations');
    await fs.ensureDir(animationsDir);

    logger.info('Starting animation assembly', {
      totalCombinations: combinations.length,
      outputFormat: this.config.generation.output_format
    });

    // Respect configured concurrency
    const batchSize = this.config.generation.max_concurrent || 4;
    let completed = 0;

    for (let i = 0; i < combinations.length; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(batch.map(async (combination) => {
        try {
          await this.assembleAnimation(combination, animationsDir);
          return { success: true, combinationId: combination.id };
        } catch (error) {
          logger.error('Failed to assemble animation', {
            combinationId: combination.id,
            error: error instanceof Error ? error.message : error
          });
          return { success: false, combinationId: combination.id, error };
        }
      }));

      // Count successful assemblies
      const successful = batchResults.filter(result => 
        result.status === 'fulfilled' && result.value.success
      ).length;
      
      completed += successful;
      
      // Progress feedback
      const failed = batch.length - successful;
      if (failed > 0) {
        console.log(`🎞️ Animations: ${completed}/${combinations.length} (${Math.round((completed / combinations.length) * 100)}%) - ${failed} failed in this batch`);
      } else {
        console.log(`🎞️ Animations: ${completed}/${combinations.length} (${Math.round((completed / combinations.length) * 100)}%)`);
      }
    }

    logger.info('Animation assembly completed', {
      totalGenerated: combinations.length
    });
  }

  private async assembleAnimation(combination: TraitCombination, outputDir: string): Promise<void> {
    const framesDir = path.join(process.cwd(), 'output', 'frames', combination.id.toString());
    
    if (!await fs.pathExists(framesDir)) {
      throw new GeneratorError(
        ErrorType.FILE_ERROR,
        `Frames directory not found: ${framesDir}`,
        { framesDir }
      );
    }

    const frames = await fs.readdir(framesDir);
    const frameFiles = frames
      .filter((file: string) => file.endsWith('.png'))
      .sort((a: string, b: string) => {
        // Extract frame numbers from filenames like "frame_001.png", "frame_002.png", etc.
        const getFrameNumber = (filename: string): number => {
          const match = filename.match(/frame_(\d+)\.png$/);
          return match && match[1] ? parseInt(match[1], 10) : 0;
        };
        
        return getFrameNumber(a) - getFrameNumber(b);
      });

    if (frameFiles.length === 0) {
      throw new GeneratorError(
        ErrorType.FILE_ERROR,
        `No frame files found in: ${framesDir}`,
        { framesDir }
      );
    }

    const outputPath = path.join(outputDir, `${combination.id}.${this.config.generation.output_format}`);

    if (this.config.generation.output_format === 'gif') {
      await this.createGIF(frameFiles, framesDir, outputPath);
    } else if (this.config.generation.output_format === 'mp4') {
      await this.createMP4(frameFiles, framesDir, outputPath);
    }
  }

  private async createGIF(_frameFiles: string[], framesDir: string, outputPath: string): Promise<void> {
    try {
      const frameRate = this.config.generation.frame_rate;
      const inputPattern = path.join(framesDir, 'frame_%03d.png');
      const loopCount = typeof this.config.animation?.loop_count === 'number' ? this.config.animation.loop_count : 0;
      const dithering = this.config.animation?.dithering !== false; // default true
      // const palette = this.config.animation?.color_palette || 'auto'; // reserved for future palette config
      const statsMode = 'full';
      const paletteGenOpts = `palettegen=stats_mode=${statsMode}`;
      const paletteUseOpts = dithering ? 'paletteuse=dither=sierra2_4a' : 'paletteuse=dither=none';
      
      // Use FFmpeg to create GIF from frames with optimized settings
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(inputPattern)
          .inputOptions([
            '-f', 'image2',
            '-pattern_type', 'sequence',
            '-start_number', '1',
            '-framerate', String(frameRate),
            ...(this.ffmpegHwAccel ? ['-hwaccel', 'auto'] : [])
          ])
          .outputOptions([
            '-vf', `fps=${frameRate},scale=${this.config.generation.dimensions.width}:${this.config.generation.dimensions.height}:flags=lanczos,split[s0][s1];[s0]${paletteGenOpts}[p];[s1][p]${paletteUseOpts}`,
            '-loop', String(loopCount),
            '-y',
            '-threads', `${typeof this.config.performance?.cpu_cores === 'number' ? this.config.performance.cpu_cores : 0}`,
            '-preset', 'ultrafast' // Fastest encoding preset
          ])
          .output(outputPath)
          .on('error', (error) => {
            logger.error('FFmpeg GIF error', { error: error.message });
            reject(error);
          })
          .on('end', () => {
            resolve();
          })
          .run();
      });
    } catch (error) {
      logger.error('Failed to create GIF', { outputPath, error });
      throw new GeneratorError(
        ErrorType.PROCESSING_ERROR,
        `Failed to create GIF: ${error instanceof Error ? error.message : error}`,
        { outputPath, error }
      );
    }
  }

  private async createMP4(_frameFiles: string[], framesDir: string, outputPath: string): Promise<void> {
    try {
      const frameRate = this.config.generation.frame_rate;
      
      // Create a temporary input pattern for FFmpeg
      const inputPattern = path.join(framesDir, 'frame_%03d.png');
      const optimization = this.config.animation?.optimization || 'high';
      const crf = optimization === 'low' ? '23' : optimization === 'medium' ? '20' : '18';
      const preset = optimization === 'low' ? 'ultrafast' : optimization === 'medium' ? 'fast' : 'slow';
      const threads = typeof this.config.performance?.cpu_cores === 'number' ? String(this.config.performance.cpu_cores) : '0';
      
      // Use FFmpeg to create MP4 from frames with optimized settings
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          // Hardware accel must be specified as an INPUT option (before input)
          .inputOptions([...(this.ffmpegHwAccel ? ['-hwaccel', 'auto'] : [])])
          .input(inputPattern)
          .inputFPS(frameRate)
          .outputOptions([
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-crf', crf,
            '-preset', preset,
            '-threads', threads,
            '-tune', 'fastdecode', // Optimize for fast decoding
            '-y'
          ])
          .output(outputPath)
          .on('error', (error) => {
            logger.error('FFmpeg error', { error: error.message });
            reject(error);
          })
          .on('end', () => {
            resolve();
          })
          .run();
      });
    } catch (error) {
      logger.error('Failed to create MP4', { outputPath, error });
      throw new GeneratorError(
        ErrorType.PROCESSING_ERROR,
        `Failed to create MP4: ${error instanceof Error ? error.message : error}`,
        { outputPath, error }
      );
    }
  }

  async cleanupIntermediateFiles(): Promise<void> {
    // Temporarily disabled for debugging - keep intermediate files
    logger.info('Skipping cleanup of intermediate files for debugging');
    return;

    if (!this.config.validation?.strict_mode) {
      return;
    }

    const spritesheetDir = path.join(process.cwd(), 'output', 'spritesheets');
    const framesDir = path.join(process.cwd(), 'output', 'frames');

    try {
      if (await fs.pathExists(spritesheetDir)) {
        await fs.remove(spritesheetDir);
        logger.info('Spritesheets cleaned up');
      }

      if (await fs.pathExists(framesDir)) {
        await fs.remove(framesDir);
        logger.info('Frames cleaned up');
      }
    } catch (error) {
      logger.warn('Failed to cleanup intermediate files', { error });
    }
  }
}
