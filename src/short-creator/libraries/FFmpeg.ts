// src/short-creator/libraries/FFmpeg.ts

import ffmpeg from "fluent-ffmpeg";
import { Readable } from "node:stream";
import { logger } from "../../logger";
import { exec } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import smartcrop from 'smartcrop-sharp';
import cuid from 'cuid';
import { Config } from "../../config";

export class FFMpeg {
  constructor(private config: Config) {}

  static async init(config: Config): Promise<FFMpeg> {
    return import("@ffmpeg-installer/ffmpeg").then((ffmpegInstaller) => {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      logger.info("FFmpeg path set to:", ffmpegInstaller.path);
      return new FFMpeg(config);
    });
  }

  async saveNormalizedAudio(
    audio: ArrayBuffer,
    outputPath: string,
  ): Promise<string> {
    logger.debug("Normalizing audio for Whisper");
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);

    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("pcm_s16le")
        .audioChannels(1)
        .audioFrequency(16000)
        .toFormat("wav")
        .on("end", () => {
          logger.debug("Audio normalization complete");
          resolve(outputPath);
        })
        .on("error", (error: unknown) => {
          logger.error(error, "Error normalizing audio:");
          reject(error);
        })
        .save(outputPath);
    });
  }

  async createMp3DataUri(audio: ArrayBuffer): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      const chunk: Buffer[] = [];

      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .on("error", (err) => {
          reject(err);
        })
        .pipe()
        .on("data", (data: Buffer) => {
          chunk.push(data);
        })
        .on("end", () => {
          const buffer = Buffer.concat(chunk);
          resolve(`data:audio/mp3;base64,${buffer.toString("base64")}`);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async saveToMp3(audio: ArrayBuffer, filePath: string): Promise<string> {
    const inputStream = new Readable();
    inputStream.push(Buffer.from(audio));
    inputStream.push(null);
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(inputStream)
        .audioCodec("libmp3lame")
        .audioBitrate(128)
        .audioChannels(2)
        .toFormat("mp3")
        .save(filePath)
        .on("end", () => {
          logger.debug("Audio conversion complete");
          resolve(filePath);
        })
        .on("error", (err) => {
          reject(err);
        });
    });
  }

  async getVideoDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          logger.error(err, "Error getting video duration");
          return reject(err);
        }
        resolve(metadata.format.duration || 0);
      });
    });
  }

  async dynamicCrop(inputPath: string, outputPath: string, width: number, height: number, startTime: number, duration: number, aspectRatio?: number): Promise<string> {
    const subClipDuration = duration / 5;
    const tempDir = path.join(this.config.tempDirPath, cuid());
    fs.ensureDirSync(tempDir);
    const croppedSubClipPaths = [];

    for (let i = 0; i < 5; i++) {
        const subClipStartTime = startTime + i * subClipDuration;
        const subClipPath = path.join(tempDir, `subclip-${i}.mp4`);
        await this.extractClip(inputPath, subClipPath, subClipStartTime, subClipDuration);

        const croppedSubClipPath = path.join(tempDir, `cropped-subclip-${i}.mp4`);
        await this.smartCrop(subClipPath, croppedSubClipPath, width, height, 0, subClipDuration, aspectRatio);
        croppedSubClipPaths.push(croppedSubClipPath);
    }

    const concatFilePath = path.join(tempDir, 'concat.txt');
    const fileContent = croppedSubClipPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatFilePath, fileContent);

    return new Promise<string>((resolve, reject) => {
        ffmpeg()
            .input(concatFilePath)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions('-c', 'copy')
            .output(outputPath)
            .on('end', () => {
                fs.removeSync(tempDir);
                resolve(outputPath);
            })
            .on('error', (err) => {
                fs.removeSync(tempDir);
                reject(err);
            })
            .run();
    });
  }

  async smartCrop(inputPath: string, outputPath: string, width: number, height: number, startTime: number, duration: number, aspectRatio?: number): Promise<string> {
    logger.debug({ inputPath }, "Starting smart crop");

    const framePath = path.join(this.config.tempDirPath, `temp-frame-${cuid()}.png`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .screenshots({
          timestamps: ['50%'],
          filename: path.basename(framePath),
          folder: path.dirname(framePath),
        })
        .on('end', () => resolve())
        .on('error', reject);
    });

    const result = await smartcrop.crop(framePath, { width, height });
    let crop = result.topCrop;

    if (aspectRatio) {
        const currentRatio = crop.width / crop.height;
        if (currentRatio > aspectRatio) {
            const newWidth = Math.floor(crop.height * aspectRatio);
            crop.x += Math.floor((crop.width - newWidth) / 2);
            crop.width = newWidth;
        } else {
            const newHeight = Math.floor(crop.width / aspectRatio);
            crop.y += Math.floor((crop.height - newHeight) / 2);
            crop.height = newHeight;
        }
    }

    logger.debug({ crop }, "Optimal crop determined by smartcrop.js");

    // Sanitize the crop values to be integers and divisible by 2
    const safeCrop = {
        x: Math.round(crop.x),
        y: Math.round(crop.y),
        width: Math.floor(crop.width / 2) * 2,
        height: Math.floor(crop.height / 2) * 2,
    };

    logger.debug({ safeCrop }, "Sanitized crop values for ffmpeg");

    return new Promise<string>((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .videoFilter(`crop=${safeCrop.width}:${safeCrop.height}:${safeCrop.x}:${safeCrop.y},scale=${width}:${height}`)
        .outputOptions('-c:v libx264')
        .outputOptions('-preset fast')
        .outputOptions('-pix_fmt yuv420p') // This is the fix for the white band
        .output(outputPath)
        .on('start', (commandLine) => {
          logger.info({ commandLine }, "FFmpeg command started");
          fs.writeFileSync('ffmpeg-command.log', commandLine);
        })
        .on('end', () => {
          logger.debug("Video successfully cropped.");
          fs.unlinkSync(framePath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(err, "Error cropping video with ffmpeg");
          fs.unlinkSync(framePath);
          reject(err);
        });

      command.run();
    });
  }

  async extractClip(inputPath: string, outputPath: string, startTime: number, duration: number): Promise<string> {
    logger.debug({ inputPath, outputPath, startTime, duration }, "Extracting video clip");
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions('-c:v libx264')
        .outputOptions('-preset fast')
        .output(outputPath)
        .on('end', () => {
          logger.debug("Clip extraction complete");
          resolve(outputPath);
        })
        .on('error', (err) => {
          logger.error(err, "Error extracting clip");
          reject(err);
        })
        .run();
    });
  }
}
