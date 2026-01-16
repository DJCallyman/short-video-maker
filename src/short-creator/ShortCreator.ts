import { OrientationEnum } from "./../types/shorts";
/* eslint-disable @remotion/deterministic-randomness */
import fs from "fs-extra";
import cuid from "cuid";
import path from "path";
import https from "https";
import type http from "http";

import type { TTSService } from "./libraries/TTSService";
import type { Remotion } from "./libraries/Remotion";
import type { Whisper } from "./libraries/Whisper";
import type { FFMpeg } from "./libraries/FFmpeg";
import type { PexelsAPI } from "./libraries/Pexels";
import type { PlexApi } from "./libraries/PlexApi";
import type { VeniceVideo, VeniceVideoModel } from "./libraries/VeniceVideo";
import { VeniceAI } from "./libraries/VeniceAI";
import type { Config } from "../config";
import { logger } from "../logger";
import type { MusicManager } from "./music";
import type { ProgressTracker } from "../server/ProgressTracker";
import type {
  SceneInput,
  RenderConfig,
  Scene,
  VideoStatus,
  MusicMoodEnum,
  MusicTag,
  MusicForVideo,
} from "../types/shorts";
import { getOrientationConfig } from "../components/utils";

const durationBufferSeconds = 3;

export class ShortCreator {
  private queue: {
    sceneInput: SceneInput[];
    config: RenderConfig;
    id: string;
  }[] = [];
  constructor(
    private config: Config,
    private remotion: Remotion,
    private ttsService: TTSService,
    private whisper: Whisper,
    private ffmpeg: FFMpeg,
    private pexelsApi: PexelsAPI,
    private musicManager: MusicManager,
    private plexApi: PlexApi,
    private progressTracker: ProgressTracker,
    private veniceVideo?: VeniceVideo,
  ) {}

  public status(id: string): VideoStatus {
    const videoPath = this.getVideoPath(id);
    if (this.queue.find((item) => item.id === id)) {
      return "processing";
    }
    if (fs.existsSync(videoPath)) {
      return "ready";
    }
    return "failed";
  }

  public addToQueue(sceneInput: SceneInput[], config: RenderConfig): string {
    const id = cuid();
    this.queue.push({
      sceneInput,
      config,
      id,
    });
    if (this.queue.length === 1) {
      this.processQueue();
    }
    return id;
  }

  /**
   * Generate a video script using AI
   */
  public async generateScript(topic: string, durationSeconds: number = 30, chatModel?: string): Promise<Array<{text: string; searchTerms: string[]}>> {
    if (!(this.ttsService instanceof VeniceAI)) {
      throw new Error("Script generation requires Venice AI TTS provider");
    }
    logger.debug({ topic, durationSeconds }, "Generating script with AI");
    return await this.ttsService.generateScript(topic, durationSeconds, chatModel);
  }

  /**
   * Generate search terms for a text using AI
   */
  public async generateSearchTerms(text: string, chatModel?: string): Promise<string[]> {
    if (!(this.ttsService instanceof VeniceAI)) {
      throw new Error("Search term generation requires Venice AI TTS provider");
    }
    logger.debug({ text }, "Generating search terms with AI");
    return await this.ttsService.generateSearchTerms(text, 3, chatModel);
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }
    const { sceneInput, config, id } = this.queue[0];
    logger.debug(
      { sceneInput, config, id },
      "Processing video item in the queue",
    );
    try {
      await this.createShort(id, sceneInput, config);
      logger.debug({ id }, "Video created successfully");
    } catch (error: unknown) {
      logger.error(error, "Error creating video");

      // Update progress tracker with error
      this.progressTracker.updateProgress({
        videoId: id,
        stage: 'error',
        progress: 0,
        message: 'Failed to create video',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.queue.shift();
      this.processQueue();
    }
  }

  private async createShort(
    videoId: string,
    inputScenes: SceneInput[],
    config: RenderConfig,
  ): Promise<string> {
    logger.debug(
      {
        inputScenes,
        config,
      },
      "Creating short video",
    );

    this.progressTracker.updateProgress({
      videoId,
      stage: 'queued',
      progress: 0,
      message: 'Starting video creation...',
    });

    const scenes: Scene[] = [];
    let totalDuration = 0;
    const excludeVideoIds: string[] = [];
    const tempFiles: string[] = [];

    const orientation: OrientationEnum =
      config.orientation || OrientationEnum.portrait;

    let sourceVideoPath: string | undefined;
    if (config.videoSource === 'plex' && config.plexMovieId) {
      try {
        sourceVideoPath = await this.plexApi.getMovieFilePath(config.plexMovieId);
        logger.debug({ sourceVideoPath }, "Using Plex movie as video source");
      } catch (error) {
        logger.error(error, "Failed to get Plex movie path, falling back to Pexels");
      }
    }

    let movieDuration = 0;
    if (sourceVideoPath) {
        movieDuration = await this.ffmpeg.getVideoDuration(sourceVideoPath);
    }

    let index = 0;
    for (const scene of inputScenes) {
      const sceneProgress = Math.round((index / inputScenes.length) * 70); // 0-70% for scene processing

      this.progressTracker.updateProgress({
        videoId,
        stage: 'generating_audio',
        progress: sceneProgress,
        message: `Generating audio for scene ${index + 1}/${inputScenes.length}...`,
      });

      const audio = await this.ttsService.generate(
        scene.text,
        config.voice ?? "af_heart",
        config.ttsSpeed ?? 1.0,
      );
      let { audioLength } = audio;
      const { audio: audioStream } = audio;

      if (index + 1 === inputScenes.length && config.paddingBack) {
        audioLength += config.paddingBack / 1000;
      }

      const tempId = cuid();
      const tempWavFileName = `${tempId}.wav`;
      const tempMp3FileName = `${tempId}.mp3`;
      const tempWavPath = path.join(this.config.tempDirPath, tempWavFileName);
      const tempMp3Path = path.join(this.config.tempDirPath, tempMp3FileName);
      tempFiles.push(tempWavPath, tempMp3Path);

      await this.ffmpeg.saveNormalizedAudio(audioStream, tempWavPath);

      this.progressTracker.updateProgress({
        videoId,
        stage: 'transcribing',
        progress: sceneProgress + 5,
        message: `Transcribing audio for scene ${index + 1}/${inputScenes.length}...`,
      });

      const captions = await this.whisper.CreateCaption(tempWavPath);
      await this.ffmpeg.saveToMp3(audioStream, tempMp3Path);

      this.progressTracker.updateProgress({
        videoId,
        stage: 'fetching_videos',
        progress: sceneProgress + 10,
        message: `Fetching video for scene ${index + 1}/${inputScenes.length}...`,
      });

      let videoUrl: string;

      if (config.videoSource === 'venice-ai' && this.veniceVideo) {
        logger.debug("Generating video with Venice AI");

        const videoPrompt = scene.text || `Video about ${scene.searchTerms}`;
        const videoModel = (config.veniceVideoModel || 'mochi-1-text-to-video') as VeniceVideoModel;

        // Determine aspect ratio based on orientation
        const aspectRatio = config.orientation === 'portrait' ? '9:16' : '16:9';

        logger.info(`Venice AI video generation - Model: ${videoModel}, Orientation: ${config.orientation}, Aspect Ratio: ${aspectRatio}, Prompt: "${videoPrompt}"`);

        const veniceVideoUrl = await this.veniceVideo.generateTextToVideo(videoPrompt, {
          model: videoModel,
          aspectRatio: aspectRatio as any,
        });

        const tempVideoFileName = `${cuid()}.mp4`;
        const tempVideoPath = path.join(this.config.tempDirPath, tempVideoFileName);
        tempFiles.push(tempVideoPath);

        // Handle data URLs (base64 encoded videos)
        if (veniceVideoUrl.startsWith('data:')) {
          const matches = veniceVideoUrl.match(/^data:(.+?);base64,(.+)$/);
          if (!matches) {
            throw new Error('Invalid data URL format from Venice video API');
          }
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          await fs.promises.writeFile(tempVideoPath, buffer);
          logger.debug(`Decoded base64 video (${buffer.length} bytes) to ${tempVideoPath}`);
        } else {
          // Handle HTTPS URLs
          // Handle HTTPS URLs
          await new Promise<void>((resolve, reject) => {
            const fileStream = fs.createWriteStream(tempVideoPath);
            https
              .get(veniceVideoUrl, (response: http.IncomingMessage) => {
                if (response.statusCode !== 200) {
                  reject(new Error(`Failed to download Venice video: ${response.statusCode}`));
                  return;
                }
                response.pipe(fileStream);
                fileStream.on("finish", () => {
                  fileStream.close();
                  logger.debug(`Venice video downloaded to ${tempVideoPath}`);
                  resolve();
                });
              })
              .on("error", (err: Error) => {
                fs.unlink(tempVideoPath, () => {});
                logger.error(err, "Error downloading Venice video");
                reject(err);
              });
          });
        }

        videoUrl = `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
      } else if (sourceVideoPath && movieDuration > 0) {
        const clipDuration = audioLength + durationBufferSeconds;
        const randomStartTime = Math.random() * (movieDuration - clipDuration);

        const tempClipFileName = `${cuid()}.mp4`;
        const tempClipPath = path.join(this.config.tempDirPath, tempClipFileName);

        const { width, height } = getOrientationConfig(orientation);
        const aspectRatio = width / height;

        await this.ffmpeg.dynamicCrop(sourceVideoPath, tempClipPath, width, height, randomStartTime, clipDuration, aspectRatio);

        tempFiles.push(tempClipPath);
        videoUrl = `http://localhost:${this.config.port}/api/tmp/${tempClipFileName}`;
      } else {
        const pexelsVideo = await this.pexelsApi.findVideo(
          scene.searchTerms,
          audioLength,
          excludeVideoIds,
          orientation,
        );

        logger.debug(`Downloading video from ${pexelsVideo.url}`);

        const tempVideoFileName = `${cuid()}.mp4`;
        const tempVideoPath = path.join(this.config.tempDirPath, tempVideoFileName);
        tempFiles.push(tempVideoPath);

        await new Promise<void>((resolve, reject) => {
          const fileStream = fs.createWriteStream(tempVideoPath);
          https
            .get(pexelsVideo.url, (response: http.IncomingMessage) => {
              if (response.statusCode !== 200) {
                reject(
                  new Error(`Failed to download video: ${response.statusCode}`),
                );
                return;
              }
              response.pipe(fileStream);
              fileStream.on("finish", () => {
                fileStream.close();
                logger.debug(`Video downloaded successfully to ${tempVideoPath}`);
                resolve();
              });
            })
            .on("error", (err: Error) => {
              fs.unlink(tempVideoPath, () => {});
              logger.error(err, "Error downloading video:");
              reject(err);
            });
        });

        excludeVideoIds.push(pexelsVideo.id);
        videoUrl = `http://localhost:${this.config.port}/api/tmp/${tempVideoFileName}`;
      }

      scenes.push({
        captions,
        video: videoUrl,
        audio: {
          url: `http://localhost:${this.config.port}/api/tmp/${tempMp3FileName}`,
          duration: audioLength,
        },
      });

      totalDuration += audioLength;
      index++;
    }

    if (config.paddingBack) {
      totalDuration += config.paddingBack / 1000;
    }

    this.progressTracker.updateProgress({
      videoId,
      stage: 'composing',
      progress: 75,
      message: 'Composing video with music...',
    });

    const selectedMusic = this.findMusic(totalDuration, config.music);
    logger.debug({ selectedMusic }, "Selected music for the video");

    this.progressTracker.updateProgress({
      videoId,
      stage: 'rendering',
      progress: 80,
      message: 'Rendering final video...',
    });

    await this.remotion.render(
      {
        music: selectedMusic,
        scenes,
        config: {
          durationMs: totalDuration * 1000,
          paddingBack: config.paddingBack,
          ...{
            captionBackgroundColor: config.captionBackgroundColor,
            captionPosition: config.captionPosition,
          },
          musicVolume: config.musicVolume,
        },
      },
      videoId,
      orientation,
    );

    this.progressTracker.updateProgress({
      videoId,
      stage: 'complete',
      progress: 100,
      message: 'Video creation complete!',
    });

    for (const file of tempFiles) {
      fs.removeSync(file);
    }

    return videoId;
  }

  public getVideoPath(videoId: string): string {
    return path.join(this.config.videosDirPath, `${videoId}.mp4`);
  }

  public deleteVideo(videoId: string): void {
    const videoPath = this.getVideoPath(videoId);
    fs.removeSync(videoPath);
    logger.debug({ videoId }, "Deleted video file");
  }

  public getVideo(videoId: string): Buffer {
    const videoPath = this.getVideoPath(videoId);
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video ${videoId} not found`);
    }
    return fs.readFileSync(videoPath);
  }

  private findMusic(videoDuration: number, _tag?: MusicMoodEnum): MusicForVideo {
    const musicFiles = this.musicManager.musicList().filter((music) => {
      if (_tag) {
        return music.mood === _tag;
      }
      return true;
    });
    return musicFiles[Math.floor(Math.random() * musicFiles.length)];
  }

  public ListAvailableMusicTags(): MusicTag[] {
    const tags = new Set<MusicTag>();
    this.musicManager.musicList().forEach((music) => {
      tags.add(music.mood as MusicTag);
    });
    return Array.from(tags.values());
  }

  public listAllVideos(): { id: string; status: VideoStatus }[] {
    const videos: { id: string; status: VideoStatus }[] = [];
    if (!fs.existsSync(this.config.videosDirPath)) {
      return videos;
    }
    const files = fs.readdirSync(this.config.videosDirPath);
    for (const file of files) {
      if (file.endsWith(".mp4")) {
        const videoId = file.replace(".mp4", "");
        let status: VideoStatus = "ready";
        const inQueue = this.queue.find((item) => item.id === videoId);
        if (inQueue) {
          status = "processing";
        }
        videos.push({ id: videoId, status });
      }
    }
    for (const queueItem of this.queue) {
      const existingVideo = videos.find((v) => v.id === queueItem.id);
      if (!existingVideo) {
        videos.push({ id: queueItem.id, status: "processing" });
      }
    }
    return videos;
  }

  public ListAvailableVoices(): string[] {
    return this.ttsService.listAvailableVoices();
  }

  public async generateVoicePreview(text: string, voice: string): Promise<ArrayBuffer> {
    logger.debug({ text, voice }, "Generating voice preview");
    const result = await this.ttsService.generate(text, voice);
    return result.audio;
  }
}
