import type http from "http";
import express from "express";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import path from "path";
import type { ShortCreator } from "../short-creator/ShortCreator";
import { APIRouter } from "./routers/rest";
import { MCPRouter } from "./routers/mcp";
import { logger } from "../logger";
import type { Config } from "../config";
import type { ProgressTracker } from "./ProgressTracker";
import type { SettingsManager } from "./SettingsManager";
import type { TTSService } from "../short-creator/libraries/TTSService";

export class Server {
  private app: express.Application;
  private config: Config;
  private progressTracker: ProgressTracker;
  private settingsManager: SettingsManager;
  private ttsService: TTSService;

  constructor(
    config: Config,
    shortCreator: ShortCreator,
    progressTracker: ProgressTracker,
    settingsManager: SettingsManager,
    ttsService: TTSService
  ) {
    this.config = config;
    this.progressTracker = progressTracker;
    this.settingsManager = settingsManager;
    this.ttsService = ttsService;
    this.app = express();

    // add healthcheck endpoint
    this.app.get("/health", (_req: ExpressRequest, res: ExpressResponse) => {
      res.status(200).json({ status: "ok" });
    });

    const apiRouter = new APIRouter(config, shortCreator, progressTracker, settingsManager, ttsService);
    const mcpRouter = new MCPRouter(shortCreator);
    this.app.use("/api", apiRouter.router);
    this.app.use("/mcp", mcpRouter.router);

    // Serve static files from the UI build
    this.app.use(express.static(path.join(__dirname, "../../dist/ui")));
    this.app.use(
      "/static",
      express.static(path.join(__dirname, "../../static")),
    );

    // Serve the React app for all other routes (must be last)
    this.app.get("*", (_req: ExpressRequest, res: ExpressResponse) => {
      res.sendFile(path.join(__dirname, "../../dist/ui/index.html"));
    });
  }

  public start(): http.Server {
    const server = this.app.listen(this.config.port, () => {
      logger.info(
        { port: this.config.port, mcp: "/mcp", api: "/api" },
        "MCP and API server is running",
      );
      logger.info(
        `UI server is running on http://localhost:${this.config.port}`,
      );
    });

    server.on("error", (error: Error) => {
      logger.error(error, "Error starting server");
    });

    return server;
  }

  public getApp() {
    return this.app;
  }
}
