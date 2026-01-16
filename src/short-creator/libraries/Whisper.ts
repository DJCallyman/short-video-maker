import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
} from "@remotion/install-whisper-cpp";
import path from "path";
import axios from "axios";
import fs from "fs-extra";

import type { Config } from "../../config";
import type { Caption } from "../../types/shorts";
import { logger } from "../../logger";

export const ErrorWhisper = new Error("There was an error with WhisperCpp");

interface VeniceWord {
  word: string;
  start: number;
  end: number;
}

interface VeniceSegment {
  text: string;
  start: number;
  end: number;
}

interface VeniceTranscriptionResponse {
  words?: VeniceWord[];
  segments?: VeniceSegment[];
}

export class Whisper {
  constructor(private config: Config) {}

  static async init(config: Config): Promise<Whisper> {
    // Skip local Whisper installation if using Venice transcription
    if (config.transcriptionProvider === 'venice') {
      logger.debug("Using Venice AI transcription, skipping Whisper installation");
      return new Whisper(config);
    }

    if (!config.runningInDocker) {
      logger.debug("Installing WhisperCpp");
      await installWhisperCpp({
        to: config.whisperInstallPath,
        version: config.whisperVersion,
        printOutput: true,
      });
      logger.debug("WhisperCpp installed");
      logger.debug("Downloading Whisper model");
      await downloadWhisperModel({
        model: config.whisperModel,
        folder: path.join(config.whisperInstallPath, "models"),
        printOutput: config.whisperVerbose,
        onProgress: (downloadedBytes, totalBytes) => {
          const progress = `${Math.round((downloadedBytes / totalBytes) * 100)}%`;
          logger.debug(
            { progress, model: config.whisperModel },
            "Downloading Whisper model",
          );
        },
      });
      // todo run the jfk command to check if everything is ok
      logger.debug("Whisper model downloaded");
    }

    return new Whisper(config);
  }

  /**
   * Transcribe audio using Venice AI
   */
  private async transcribeWithVenice(audioPath: string): Promise<Caption[]> {
    logger.debug({ audioPath }, "Transcribing audio with Venice AI");

    if (!this.config.veniceApiKey) {
      throw new Error("Venice API key is required for Venice transcription");
    }

    try {
      // Read the audio file
      const audioBuffer = await fs.readFile(audioPath);

      // Create FormData for multipart upload
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: path.basename(audioPath),
        contentType: 'audio/wav',
      });
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'word');

      const response = await axios.post(
        'https://api.venice.ai/api/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.veniceApiKey}`,
            ...formData.getHeaders(),
          },
        }
      );

      logger.debug({ audioPath }, "Venice transcription completed");

      // Convert Venice response to Caption format
      const captions: Caption[] = [];
      const data = response.data as VeniceTranscriptionResponse;

      if (data.words) {
        data.words.forEach((word: VeniceWord) => {
          captions.push({
            text: word.word,
            startMs: Math.round(word.start * 1000),
            endMs: Math.round(word.end * 1000),
          });
        });
      } else if (data.segments) {
        // Fallback to segments if words not available
        data.segments.forEach((segment: VeniceSegment) => {
          const words = segment.text.trim().split(' ');
          const duration = segment.end - segment.start;
          const wordDuration = duration / words.length;

          words.forEach((word: string, index: number) => {
            const startMs = Math.round((segment.start + (index * wordDuration)) * 1000);
            const endMs = Math.round((segment.start + ((index + 1) * wordDuration)) * 1000);

            captions.push({
              text: word,
              startMs,
              endMs,
            });
          });
        });
      }

      logger.debug({ audioPath, captions: captions.length }, "Captions created from Venice");
      return captions;
    } catch (error) {
      logger.error(error, "Error transcribing with Venice AI");
      throw new Error("Failed to transcribe audio with Venice AI");
    }
  }

  // todo shall we extract it to a Caption class?
  async CreateCaption(audioPath: string): Promise<Caption[]> {
    // Use Venice transcription if configured
    if (this.config.transcriptionProvider === 'venice') {
      return this.transcribeWithVenice(audioPath);
    }

    // Otherwise use local Whisper
    logger.debug({ audioPath }, "Starting to transcribe audio");
    const { transcription } = await transcribe({
      model: this.config.whisperModel,
      whisperPath: this.config.whisperInstallPath,
      modelFolder: path.join(this.config.whisperInstallPath, "models"),
      whisperCppVersion: this.config.whisperVersion,
      inputPath: audioPath,
      tokenLevelTimestamps: true,
      printOutput: this.config.whisperVerbose,
      onProgress: (progress) => {
        logger.debug({ audioPath }, `Transcribing is ${progress} complete`);
      },
    });
    logger.debug({ audioPath }, "Transcription finished, creating captions");

    const captions: Caption[] = [];
    transcription.forEach((record) => {
      if (record.text === "") {
        return;
      }

      record.tokens.forEach((token) => {
        if (token.text.startsWith("[_TT")) {
          return;
        }
        // if token starts without space and the previous node didn't have space either, merge them
        if (
          captions.length > 0 &&
          !token.text.startsWith(" ") &&
          !captions[captions.length - 1].text.endsWith(" ")
        ) {
          captions[captions.length - 1].text += record.text;
          captions[captions.length - 1].endMs = record.offsets.to;
          return;
        }
        captions.push({
          text: token.text,
          startMs: record.offsets.from,
          endMs: record.offsets.to,
        });
      });
    });
    logger.debug({ audioPath, captions }, "Captions created");
    return captions;
  }
}
