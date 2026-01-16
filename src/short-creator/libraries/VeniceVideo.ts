import axios from 'axios';
import { logger } from '../../logger';

// Allow any string for model ID since models are fetched dynamically from API
export type VeniceVideoModel = string;

export type VeniceVideoResolution = '480p' | '720p' | '1080p';
export type VeniceVideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
export type VeniceVideoDuration = '4s' | '5s' | '8s' | '10s' | '12s' | '15s' | '18s';

export interface VeniceVideoQueueRequest {
  model: VeniceVideoModel;
  prompt: string;
  negative_prompt?: string;
  duration?: VeniceVideoDuration;
  resolution?: VeniceVideoResolution;
  aspect_ratio?: VeniceVideoAspectRatio;
  audio?: boolean;
  image_url?: string;
  audio_url?: string;
  video_url?: string;
}

export interface VeniceVideoQueueResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  error?: string;
}

export class VeniceVideo {
  private apiKey: string;
  private baseUrl = "https://api.venice.ai/api/v1";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Venice AI API key is required.");
    }
    this.apiKey = apiKey;
  }

  /**
   * Queue a video generation request
   */
  async queueVideo(request: VeniceVideoQueueRequest): Promise<VeniceVideoQueueResponse> {
    logger.debug({ request }, "Queueing video generation with Venice AI");

    try {
      const response = await axios.post(
        `${this.baseUrl}/video/queue`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.debug({ queue_id: response.data.queue_id }, "Video queued successfully");
      return {
        id: response.data.queue_id,
        status: 'queued',
        ...response.data
      };
    } catch (error: any) {
      // Extract error details from API response
      if (error.response?.data) {
        const errorData = error.response.data;
        const errorMsg = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
        logger.error({ error, status: error.response.status, errorData }, "Error queueing video generation");
        throw new Error(`Failed to queue video: ${errorMsg}`);
      }
      logger.error(error, "Error queueing video generation");
      throw new Error("Failed to queue video generation with Venice AI.");
    }
  }

  /**
   * Check the status of a video generation request
   */
  async getVideoStatus(queueId: string, model: string): Promise<VeniceVideoQueueResponse> {
    logger.debug({ queueId, model }, "Checking video generation status");

    try {
      const response = await axios.post(
        `${this.baseUrl}/video/retrieve`,
        {
          queue_id: queueId,
          model: model,
          delete_media_on_completion: false, // Keep media available for retrieval
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer', // Handle both JSON and video/mp4
          validateStatus: (status) => status < 500, // Don't throw on 4xx errors, handle them gracefully
        }
      );

      // Handle 409 Conflict - video may have been already retrieved or expired
      if (response.status === 409) {
        try {
          const errorText = response.data.toString();
          logger.warn({ queueId, errorText }, "Video retrieval conflict (409)");
          return {
            id: queueId,
            status: 'failed',
            error: `Retrieval conflict: ${errorText}`,
          };
        } catch (e) {
          return {
            id: queueId,
            status: 'failed',
            error: 'Video retrieval conflict (409) - may have expired or been already retrieved',
          };
        }
      }

      // Check if response is video (completed)
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('video/mp4')) {
        // Video is complete, we have the binary data
        // We need to save it or return URL - for now return as base64 data URL
        const base64Video = Buffer.from(response.data).toString('base64');
        logger.debug({ queueId, videoSize: base64Video.length }, "Video completed and encoded to base64");
        return {
          id: queueId,
          status: 'completed',
          video_url: `data:video/mp4;base64,${base64Video}`,
        };
      }

      // Response is JSON (still processing or other status)
      const jsonData = JSON.parse(response.data.toString());
      logger.debug({ queueId, responseStatus: jsonData.status }, "Received JSON response");
      return {
        id: queueId,
        status: jsonData.status === 'PROCESSING' ? 'processing' : jsonData.status,
        ...jsonData,
      };
    } catch (error: any) {
      // Handle specific error codes
      if (error.response) {
        const status = error.response.status;
        let errorMessage = '';

        try {
          // Try to parse error response body
          const errorData = error.response.data;
          const errorText = typeof errorData === 'string'
            ? errorData
            : Buffer.isBuffer(errorData)
              ? errorData.toString()
              : JSON.stringify(errorData);

          logger.error({ status, queueId, errorBody: errorText }, "Venice API error response");

          if (status === 409) {
            errorMessage = `Video generation conflict (409): ${errorText}. The video may have expired, failed, or been already retrieved.`;
          } else {
            errorMessage = `Venice API error ${status}: ${errorText}`;
          }
        } catch (parseError) {
          errorMessage = `Venice API error ${status}: Could not parse error response`;
        }

        throw new Error(errorMessage);
      }

      logger.error({ error, queueId }, "Error checking video status");
      throw new Error("Failed to get video status from Venice AI.");
    }
  }

  /**
   * Wait for a video to be completed (with polling)
   */
  async waitForVideo(
    queueId: string,
    model: string,
    maxWaitTimeMs: number = 600000, // 10 minutes default (increased from 5 minutes)
    pollIntervalMs: number = 5000    // 5 seconds default
  ): Promise<string> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < maxWaitTimeMs) {
      attempts++;
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      try {
        const status = await this.getVideoStatus(queueId, model);

        if (status.status === 'completed' && status.video_url) {
          logger.info({ queueId, attempts, elapsed }, "Video completed successfully");
          return status.video_url;
        }

        if (status.status === 'failed') {
          throw new Error(`Video generation failed: ${status.error || 'Unknown error'}`);
        }

        logger.debug({ queueId, status: status.status, attempts, elapsed }, "Video still processing, waiting...");
      } catch (error: any) {
        // If we get a retrieval error after significant processing time, it might be a timeout issue
        if (elapsed > 120) {
          logger.warn({ queueId, error: error.message, elapsed, attempts }, "Video polling error after significant processing time");
          throw error;
        }
        // For early errors, re-throw immediately
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Video generation timed out after ${Math.round(maxWaitTimeMs / 1000)}s (${attempts} attempts)`);
  }

  /**
   * Generate a video from text and wait for completion
   */
  async generateTextToVideo(
    prompt: string,
    options: {
      model?: VeniceVideoModel;
      duration?: VeniceVideoDuration;
      resolution?: VeniceVideoResolution;
      aspectRatio?: VeniceVideoAspectRatio;
      negativePrompt?: string;
      audio?: boolean;
    } = {}
  ): Promise<string> {
    const model = options.model || 'wan-2.6-text-to-video';

    const request: VeniceVideoQueueRequest = {
      model,
      prompt,
      negative_prompt: options.negativePrompt,
      duration: options.duration || '5s', // Venice API only supports: 5s, 8s, 10s, 15s, 18s
      resolution: options.resolution || '720p',
      aspect_ratio: options.aspectRatio || '16:9',
      // Only include audio field if explicitly set to true (Sora models don't support audio configuration)
      ...(options.audio === true && { audio: true }),
      // Note: image_url is NOT required for text-to-video models despite swagger schema
    };

    const queueResponse = await this.queueVideo(request);
    return await this.waitForVideo(queueResponse.id, model);
  }

  /**
   * Generate a video from an image and wait for completion
   */
  async generateImageToVideo(
    imageUrl: string,
    prompt: string,
    options: {
      model?: VeniceVideoModel;
      duration?: VeniceVideoDuration;
      resolution?: VeniceVideoResolution;
      aspectRatio?: VeniceVideoAspectRatio;
      negativePrompt?: string;
      audio?: boolean;
    } = {}
  ): Promise<string> {
    const model = options.model || 'wan-2.5-preview-image-to-video';

    const request: VeniceVideoQueueRequest = {
      model,
      prompt,
      image_url: imageUrl,
      negative_prompt: options.negativePrompt,
      duration: options.duration || '5s',
      resolution: options.resolution || '720p',
      aspect_ratio: options.aspectRatio || '16:9',
      audio: options.audio ?? false,
    };

    const queueResponse = await this.queueVideo(request);
    return await this.waitForVideo(queueResponse.id, model);
  }

  /**
   * Download video from URL
   */
  async downloadVideo(url: string): Promise<Buffer> {
    logger.debug({ url }, "Downloading video from Venice AI");

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error({ error, url }, "Error downloading video");
      throw new Error("Failed to download video from Venice AI.");
    }
  }
}
