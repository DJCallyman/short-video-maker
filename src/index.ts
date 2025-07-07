/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "path";
import fs from "fs-extra";

import { Remotion } from "./short-creator/libraries/Remotion";
import { Whisper } from "./short-creator/libraries/Whisper";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { PexelsAPI } from "./short-creator/libraries/Pexels";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
import { logger } from "./logger";
import { Server } from "./server/server";
import { MusicManager } from "./short-creator/music";
import { Kokoro } from "./short-creator/libraries/Kokoro";
import { VeniceAI } from "./short-creator/libraries/VeniceAI";
import { TTSService } from "./short-creator/libraries/TTSService";
import { PlexApi } from "./short-creator/libraries/PlexApi";

async function main() {
  const config = new Config();
  try {
    config.ensureConfig();
  } catch (err: unknown) {
    logger.error(err, "Error in config");
    process.exit(1);
  }

  const musicManager = new MusicManager(config);
  try {
    logger.debug("checking music files");
    musicManager.ensureMusicFilesExist();
  } catch (error: unknown) {
    logger.error(error, "Missing music files");
    process.exit(1);
  }

  logger.debug("initializing remotion");
  const remotion = await Remotion.init(config);
  
  let ttsService: TTSService;

  if (config.ttsProvider === 'venice') {
    logger.debug("Initializing Venice AI TTS service");
    ttsService = new VeniceAI(config.veniceApiKey!);
  } else {
    logger.debug("Initializing Kokoro TTS service");
    const kokoroInstance = await Kokoro.init(config.kokoroModelPrecision);
    ttsService = kokoroInstance;
  }

  logger.debug("initializing whisper");
  const whisper = await Whisper.init(config);
  logger.debug("initializing ffmpeg");
  const ffmpeg = await FFMpeg.init(config);
  const pexelsApi = new PexelsAPI(config.pexelsApiKey);
  const plexApi = new PlexApi(process.env.PLEX_URL || '', process.env.PLEX_TOKEN || '');

  logger.debug("initializing the short creator");
  const shortCreator = new ShortCreator(
    config,
    remotion,
    ttsService,
    whisper,
    ffmpeg,
    pexelsApi,
    musicManager,
    plexApi,
  );

  if (!config.runningInDocker) {
    if (fs.existsSync(config.installationSuccessfulPath)) {
      logger.info("the installation is successful - starting the server");
    } else {
      logger.info(
        "testing if the installation was successful - this may take a while...",
      );
      try {
        const availableVoices = ttsService.listAvailableVoices();
        if (availableVoices.length === 0) {
          throw new Error(`No voices available for the selected TTS provider ('${config.ttsProvider}').`);
        }
        const testVoice = availableVoices[0];
        const { audio: audioBuffer } = await ttsService.generate("hi", testVoice);

        await ffmpeg.createMp3DataUri(audioBuffer);
        await pexelsApi.findVideo(["dog"], 2.4);
        const testVideoPath = path.join(config.tempDirPath, "test.mp4");
        await remotion.testRender(testVideoPath);
        fs.rmSync(testVideoPath, { force: true });
        fs.writeFileSync(config.installationSuccessfulPath, "ok", {
          encoding: "utf-8",
        });
        logger.info("the installation was successful - starting the server");
      } catch (error: unknown) {
        logger.fatal(
          error,
          "The environment is not set up correctly - please follow the instructions in the README.md file https://github.com/gyoridavid/short-video-maker",
        );
        process.exit(1);
      }
    }
  }

  logger.debug("initializing the server");
  const server = new Server(config, shortCreator);
  const app = server.start();
}

main().catch((error: unknown) => {
  logger.error(error, "Error starting server");
});