import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import fs from "fs-extra";
import path from "path";
import axios from "axios";
import { validateCreateShortInput } from "../validator";
import type { ShortCreator } from "../../short-creator/ShortCreator";
import { logger } from "../../logger";
import type { Config } from "../../config";
import { PlexApi } from "../../short-creator/libraries/PlexApi";
import type { ProgressTracker } from "../ProgressTracker";
import type { SettingsManager } from "../SettingsManager";
import type { TTSService } from "../../short-creator/libraries/TTSService";
import { VeniceAI } from "../../short-creator/libraries/VeniceAI";

export class APIRouter {
  public router: express.Router;
  private shortCreator: ShortCreator;
  private config: Config;
  private plexApi: PlexApi;
  private progressTracker: ProgressTracker;
  private settingsManager: SettingsManager;
  private ttsService: TTSService;

  /**
   * Format model ID to human-readable name
   * Examples: "llama-3.3-70b" -> "Llama 3.3 70B", "gpt-4o" -> "GPT-4o"
   */
  constructor(
    config: Config,
    shortCreator: ShortCreator,
    progressTracker: ProgressTracker,
    settingsManager: SettingsManager,
    ttsService: TTSService
  ) {
    this.config = config;
    this.router = express.Router();
    this.shortCreator = shortCreator;
    this.plexApi = new PlexApi(process.env.PLEX_URL || "", process.env.PLEX_TOKEN || "");
    this.progressTracker = progressTracker;
    this.settingsManager = settingsManager;
    this.ttsService = ttsService;
    this.router.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    this.router.post(
      "/short-video",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const input = validateCreateShortInput(req.body);
          logger.info({ input }, "Creating short video");
          const videoId = this.shortCreator.addToQueue(
            input.scenes,
            input.config,
          );
          res.status(201).json({
            videoId,
          });
        } catch (error: unknown) {
          logger.error(error, "Error validating input");
          if (error instanceof Error && error.message.startsWith("{")) {
            try {
              const errorData = JSON.parse(error.message);
              res.status(400).json({
                error: "Validation failed",
                message: errorData.message,
                missingFields: errorData.missingFields,
              });
              return;
            } catch (parseError: unknown) {
              logger.error(parseError, "Error parsing validation error");
            }
          }
          res.status(400).json({
            error: "Invalid input",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/short-video/:videoId/status",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        const status = this.shortCreator.status(videoId);
        res.status(200).json({
          status,
        });
      },
    );

    this.router.get(
      "/short-video/:videoId/progress",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }

        // Add SSE connection for progress updates
        this.progressTracker.addConnection(videoId, res);
      },
    );

    this.router.get(
      "/music-tags",
      (_req: ExpressRequest, res: ExpressResponse) => {
        res.status(200).json(this.shortCreator.ListAvailableMusicTags());
      },
    );

    this.router.get("/voices", (_req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json(this.shortCreator.ListAvailableVoices());
    });

    this.router.post(
      "/voices/preview",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { voice, text } = req.body;

          if (!voice) {
            res.status(400).json({
              error: "voice is required",
            });
            return;
          }

          const sampleText = text || "Hello! This is a sample of this voice.";

          logger.info({ voice, text: sampleText }, "Generating voice preview");

          const audio = await this.shortCreator.generateVoicePreview(
            sampleText,
            voice
          );

          res.setHeader("Content-Type", "audio/wav");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=preview-${voice}.wav`,
          );
          res.send(Buffer.from(audio));
        } catch (error: unknown) {
          logger.error(error, "Error generating voice preview");
          res.status(500).json({
            error: "Failed to generate voice preview",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.get(
      "/short-videos",
      (_req: ExpressRequest, res: ExpressResponse) => {
        const videos = this.shortCreator.listAllVideos();
        res.status(200).json({
          videos,
        });
      },
    );

    this.router.delete(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { videoId } = req.params;
        if (!videoId) {
          res.status(400).json({
            error: "videoId is required",
          });
          return;
        }
        this.shortCreator.deleteVideo(videoId);
        res.status(200).json({
          success: true,
        });
      },
    );

    this.router.get(
      "/tmp/:tmpFile",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { tmpFile } = req.params;
        if (!tmpFile) {
          res.status(400).json({
            error: "tmpFile is required",
          });
          return;
        }
        const tmpFilePath = path.join(this.config.tempDirPath, tmpFile);
        if (!fs.existsSync(tmpFilePath)) {
          res.status(404).json({
            error: "tmpFile not found",
          });
          return;
        }
        if (tmpFile.endsWith(".mp3")) {
          res.setHeader("Content-Type", "audio/mpeg");
        }
        if (tmpFile.endsWith(".wav")) {
          res.setHeader("Content-Type", "audio/wav");
        }
        if (tmpFile.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
        }
        const tmpFileStream = fs.createReadStream(tmpFilePath);
        tmpFileStream.on("error", (error) => {
          logger.error(error, "Error reading tmp file");
          res.status(500).json({
            error: "Error reading tmp file",
            tmpFile,
          });
        });
        tmpFileStream.pipe(res);
      },
    );

    this.router.get(
      "/music/:fileName",
      (req: ExpressRequest, res: ExpressResponse) => {
        const { fileName } = req.params;
        if (!fileName) {
          res.status(400).json({
            error: "fileName is required",
          });
          return;
        }
        const musicFilePath = path.join(this.config.musicDirPath, fileName);
        if (!fs.existsSync(musicFilePath)) {
          res.status(404).json({
            error: "music file not found",
          });
          return;
        }
        const musicFileStream = fs.createReadStream(musicFilePath);
        musicFileStream.on("error", (error) => {
          logger.error(error, "Error reading music file");
          res.status(500).json({
            error: "Error reading music file",
            fileName,
          });
        });
        musicFileStream.pipe(res);
      },
    );

    this.router.get(
      "/short-video/:videoId",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { videoId } = req.params;
          if (!videoId) {
            res.status(400).json({
              error: "videoId is required",
            });
            return;
          }
          const video = this.shortCreator.getVideo(videoId);
          res.setHeader("Content-Type", "video/mp4");
          res.setHeader(
            "Content-Disposition",
            `inline; filename=${videoId}.mp4`,
          );
          res.send(video);
        } catch (error: unknown) {
          logger.error(error, "Error getting video");
          res.status(404).json({
            error: "Video not found",
          });
        }
      },
    );

    this.router.get(
      "/plex/movies",
      async (_req: ExpressRequest, res: ExpressResponse) => {
        try {
          const movies = await this.plexApi.getMovies();
          res.status(200).json({ movies });
        } catch (error) {
          logger.error(error, "Error fetching movies from Plex");
          res.status(500).json({
            error: "Failed to fetch movies from Plex",
          });
        }
      },
    );

    this.router.post(
      "/plex/select-movie",
      async (req: ExpressRequest, res: ExpressResponse) => {
        const { movieId } = req.body;
        if (!movieId) {
          res.status(400).json({
            error: "movieId is required",
          });
          return;
        }
        try {
          const movieFilePath = await this.plexApi.getMovieFilePath(movieId);
          logger.info(`Selected movie file path: ${movieFilePath}`);
          res.status(200).json({ success: true });
        } catch (error) {
          logger.error(error, "Error selecting movie from Plex");
          res.status(500).json({
            error: "Failed to select movie from Plex",
          });
        }
      },
    );

    this.router.get(
      "/settings",
      (_req: ExpressRequest, res: ExpressResponse) => {
        try {
          const settings = this.settingsManager.getSettings();
          res.status(200).json(settings);
        } catch (error) {
          logger.error(error, "Error getting settings");
          res.status(500).json({
            error: "Failed to get settings",
          });
        }
      },
    );

    this.router.put(
      "/settings",
      (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const settings = this.settingsManager.updateSettings(req.body);

          // Update VeniceAI service if it's being used and settings changed
          if (this.ttsService instanceof VeniceAI) {
            if (req.body.veniceApiKey) {
              this.ttsService.setApiKey(req.body.veniceApiKey);
            }
            if (req.body.veniceChatModel) {
              this.ttsService.setDefaultChatModel(req.body.veniceChatModel);
            }
          }

          res.status(200).json(settings);
        } catch (error) {
          logger.error(error, "Error updating settings");
          res.status(500).json({
            error: "Failed to update settings",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.post(
      "/settings/reset",
      (_req: ExpressRequest, res: ExpressResponse) => {
        try {
          const settings = this.settingsManager.resetSettings();
          res.status(200).json(settings);
        } catch (error) {
          logger.error(error, "Error resetting settings");
          res.status(500).json({
            error: "Failed to reset settings",
          });
        }
      },
    );

    this.router.get(
      "/models/chat",
      async (_req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.debug("Fetching chat models from Venice API");

          // Fetch models from Venice API
          const response = await axios.get("https://api.venice.ai/api/v1/models", {
            headers: {
              'Accept': 'application/json',
            },
          });

          // Filter for chat/completion models
          const models = response.data.data
            .filter((model: any) => {
              // Include models that support chat/completions
              const type = model.type || '';
              return !['image', 'video', 'embedding', 'speech', 'transcription', 'tts'].includes(type) &&
                     model.model_spec &&
                     model.model_spec.name;
            })
            .map((model: any) => ({
              id: model.id,
              name: model.model_spec.name,
              supportsResponseSchema: model.model_spec.capabilities?.supportsResponseSchema || false,
              supportsFunctionCalling: model.model_spec.capabilities?.supportsFunctionCalling || false,
            }));

          logger.debug({ modelCount: models.length }, "Fetched chat models from Venice API");
          res.status(200).json({ models });
        } catch (error: unknown) {
          logger.error(error, "Error fetching chat models from Venice API");

          // Fallback to some popular models if API fetch fails
          const fallbackModels = [
            { id: "llama-3.3-70b", name: "Llama 3.3 70B", supportsResponseSchema: true, supportsFunctionCalling: false },
            { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", supportsResponseSchema: true, supportsFunctionCalling: true },
            { id: "llama-3.1-405b", name: "Llama 3.1 405B", supportsResponseSchema: true, supportsFunctionCalling: false },
            { id: "gpt-4o", name: "GPT-4o", supportsResponseSchema: true, supportsFunctionCalling: true },
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", supportsResponseSchema: true, supportsFunctionCalling: true },
          ];

          res.status(200).json({ models: fallbackModels });
        }
      },
    );

    this.router.get(
      "/models/video",
      async (_req: ExpressRequest, res: ExpressResponse) => {
        try {
          logger.debug("Fetching video models from Venice API");

          // Fetch video models from Venice API
          const response = await axios.get("https://api.venice.ai/api/v1/models?type=video", {
            headers: {
              'Accept': 'application/json',
            },
          });

          // Filter for text-to-video models using the model_spec.constraints.model_type field
          // This is more reliable than parsing the model ID suffix
          const models = response.data.data
            .filter((model: any) => {
              return model.model_spec?.constraints?.model_type === "text-to-video";
            })
            .map((model: any) => ({
              id: model.id,
              name: model.model_spec.name,
            }));

          logger.debug({ modelCount: models.length }, "Fetched video models from Venice API");
          res.status(200).json({ models });
        } catch (error: unknown) {
          logger.error(error, "Error fetching video models from Venice API");

          // Fallback to some known text-to-video models if API fetch fails
          const fallbackModels = [
            { id: "wan-2.6-text-to-video", name: "Wan 2.6" },
            { id: "ltx-2-fast-text-to-video", name: "LTX Video 2.0 Fast" },
            { id: "veo3-fast-text-to-video", name: "Veo 3 Fast" },
          ];

          res.status(200).json({ models: fallbackModels });
        }
      },
    );

    // AI Automation endpoints
    this.router.post(
      "/ai/generate-script",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { topic, duration } = req.body;
          if (!topic) {
            res.status(400).json({ error: "Topic is required" });
            return;
          }

          logger.info({ topic, duration }, "Generating script with AI");
          const script = await this.shortCreator.generateScript(topic, duration || 30, this.config.veniceChatModel);
          res.status(200).json({ script });
        } catch (error) {
          logger.error(error, "Error generating script");
          res.status(500).json({
            error: "Failed to generate script",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.router.post(
      "/ai/generate-search-terms",
      async (req: ExpressRequest, res: ExpressResponse) => {
        try {
          const { text } = req.body;
          if (!text) {
            res.status(400).json({ error: "Text is required" });
            return;
          }

          logger.info({ text }, "Generating search terms with AI");
          const searchTerms = await this.shortCreator.generateSearchTerms(text, this.config.veniceChatModel);
          res.status(200).json({ searchTerms });
        } catch (error) {
          logger.error(error, "Error generating search terms");
          res.status(500).json({
            error: "Failed to generate search terms",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );
  }
}
