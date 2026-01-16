import axios from 'axios';
import type { TTSService, TTSResult } from './TTSService';
import { logger } from '../../logger';
import type { SceneInput } from '../../types/shorts';

// The full list of voices available from the Venice AI API specification
const VENICE_VOICES = [
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jadzia", "af_jessica",
  "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
  "am_onyx", "am_puck", "am_santa", "bf_alice", "bf_emma", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "zf_xiaobei", "zf_xiaoni",
  "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian", "zm_yunxi", "zm_yunxia",
  "zm_yunyang", "ff_siwis", "hf_alpha", "hf_beta", "hm_omega", "hm_psi",
  "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune", "jf_nezumi",
  "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "ef_dora",
  "em_alex", "em_santa"
];

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  stream?: boolean;
}

export class VeniceAI implements TTSService {
  private apiKey: string;
  private baseUrl = "https://api.venice.ai/api/v1";
  private defaultChatModel = "llama-3.3-70b";

  constructor(apiKey: string, chatModel?: string) {
    if (!apiKey) {
      throw new Error("Venice AI API key is required.");
    }
    this.apiKey = apiKey;
    if (chatModel) {
      this.defaultChatModel = chatModel;
    }
  }

  /**
   * Set the default chat model to use for completions
   */
  public setDefaultChatModel(model: string): void {
    this.defaultChatModel = model;
  }

  /**
   * Set the API key to use for requests
   */
  public setApiKey(apiKey: string): void {
    if (!apiKey) {
      throw new Error("Venice AI API key cannot be empty");
    }
    this.apiKey = apiKey;
  }

  /**
   * Set the chat model to use for completions
   */
  setChatModel(model: string): void {
    this.defaultChatModel = model;
  }

  /**
   * Get the current chat model
   */
  getChatModel(): string {
    return this.defaultChatModel;
  }

  async generate(text: string, voice: string, speed: number = 1.0): Promise<TTSResult> {
    logger.debug({ text, voice, speed }, "Generating audio with Venice AI");

    try {
      // Log API key status for debugging (masked)
      logger.debug(
        {
          apiKeyPresent: !!this.apiKey,
          apiKeyLength: this.apiKey?.length || 0,
          apiKeyPrefix: this.apiKey?.substring(0, 5),
        },
        "Venice AI API key status"
      );

      const response = await axios.post(
        `${this.baseUrl}/audio/speech`,
        {
          input: text,
          voice: voice,
          model: 'tts-kokoro', // As per the spec, this seems to be the main model
          response_format: 'wav', // Request WAV format for captioning
          speed: speed, // Speed control: 0.25 to 4.0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      logger.debug({ status: response.status }, "Venice AI request successful");

      const audio = response.data;

      // Parse WAV header to get actual duration
      const audioLength = this.parseWavDuration(audio);

      logger.debug({ text, voice, speed, audioLength }, "Audio generated with Venice AI");

      return {
        audio,
        audioLength,
      };
    } catch (error: any) {
      logger.error(
        {
          error,
          status: error?.response?.status,
          statusText: error?.response?.statusText,
          apiKeyPresent: !!this.apiKey,
          apiKeyLength: this.apiKey?.length || 0,
        },
        "Error generating audio from Venice AI"
      );
      throw new Error("Failed to generate audio from Venice AI.");
    }
  }

  /**
   * Parse WAV file to get actual audio duration
   */
  private parseWavDuration(wavBuffer: ArrayBuffer): number {
    try {
      const buffer = Buffer.from(wavBuffer);

      // WAV file structure:
      // Bytes 0-3: "RIFF"
      // Bytes 4-7: File size - 8
      // Bytes 8-11: "WAVE"
      // Bytes 12-15: "fmt "
      // Bytes 16-19: Format chunk size
      // Bytes 20-21: Audio format (1 = PCM)
      // Bytes 22-23: Number of channels
      // Bytes 24-27: Sample rate
      // Bytes 28-31: Byte rate
      // Bytes 32-33: Block align
      // Bytes 34-35: Bits per sample

      // Find "data" chunk
      let dataChunkOffset = 36;
      while (dataChunkOffset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', dataChunkOffset, dataChunkOffset + 4);
        const chunkSize = buffer.readUInt32LE(dataChunkOffset + 4);

        if (chunkId === 'data') {
          const sampleRate = buffer.readUInt32LE(24);
          const byteRate = buffer.readUInt32LE(28);
          const duration = chunkSize / byteRate;

          logger.debug({ sampleRate, byteRate, chunkSize, duration }, "Parsed WAV duration");
          return duration;
        }

        dataChunkOffset += 8 + chunkSize;
      }

      // Fallback to estimation if parsing fails
      logger.warn("Could not parse WAV duration, using estimation");
      return wavBuffer.byteLength / 15;
    } catch (error) {
      logger.error(error, "Error parsing WAV duration");
      // Fallback to estimation
      return wavBuffer.byteLength / 15;
    }
  }

  /**
   * Generate chat completion
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<{ choices: Array<{ message: { content: string } }> }> {
    logger.debug({ model: request.model, messages: request.messages.length }, "Generating chat completion");

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          ...request,
          model: request.model || this.defaultChatModel,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error(error, "Error generating chat completion");
      throw new Error("Failed to generate chat completion from Venice AI.");
    }
  }

  /**
   * Generate a script from a topic
   */
  async generateScript(topic: string, numberOfScenes: number = 3, chatModel?: string): Promise<SceneInput[]> {
    logger.debug({ topic, numberOfScenes }, "Generating script for topic");

    const systemPrompt = `You are a creative video script writer. Generate engaging, concise scripts for short-form videos (TikTok, Instagram Reels, YouTube Shorts).

Each scene should:
- Be 10-20 seconds long when spoken
- Have clear, punchy narration
- Include 2-3 specific search terms for finding relevant stock footage
- Flow naturally from one scene to the next

Return ONLY valid JSON in this exact format:
{
  "scenes": [
    {
      "text": "Scene narration text",
      "searchTerms": ["term1", "term2", "term3"]
    }
  ]
}`;

    const userPrompt = `Create a ${numberOfScenes}-scene script about: ${topic}

Make it engaging, informative, and suitable for a 30-60 second video.`;

    const response = await this.chatCompletion({
      model: chatModel || this.defaultChatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from Venice AI");
    }

    logger.debug({ content: content.substring(0, 200) }, "Raw response content");

    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || content.match(/({[\s\S]*})/);

    if (!jsonMatch) {
      logger.error({ content }, "Failed to extract JSON from response");
      throw new Error("Response does not contain valid JSON");
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
        throw new Error("Response does not contain 'scenes' array");
      }
      logger.debug({ scenes: parsed.scenes.length }, "Script generated successfully");
      return parsed.scenes;
    } catch (parseError) {
      logger.error({ parseError, jsonContent: jsonMatch[1].substring(0, 500) }, "Failed to parse JSON");
      throw parseError;
    }
  }

  /**
   * Generate search terms for a given text
   */
  async generateSearchTerms(text: string, count: number = 3, chatModel?: string): Promise<string[]> {
    logger.debug({ text, count }, "Generating search terms");

    const systemPrompt = `You are an expert at finding relevant stock footage keywords. Generate specific, visual search terms that would help find relevant video clips.

Return ONLY valid JSON in this format:
{
  "searchTerms": ["term1", "term2", "term3"]
}`;

    const userPrompt = `Generate ${count} search terms for finding stock video footage that would match this narration: "${text}"

Focus on visual, concrete terms (not abstract concepts).`;

    const response = await this.chatCompletion({
      model: chatModel || this.defaultChatModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from Venice AI");
    }

    logger.debug({ content: content.substring(0, 200) }, "Raw response content");

    // Extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || content.match(/({[\s\S]*})/);

    if (!jsonMatch) {
      logger.error({ content }, "Failed to extract JSON from response");
      throw new Error("Response does not contain valid JSON");
    }

    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (!parsed.searchTerms || !Array.isArray(parsed.searchTerms)) {
        throw new Error("Response does not contain 'searchTerms' array");
      }
      logger.debug({ searchTerms: parsed.searchTerms }, "Search terms generated");
      return parsed.searchTerms;
    } catch (parseError) {
      logger.error({ parseError, jsonContent: jsonMatch[1].substring(0, 500) }, "Failed to parse JSON");
      throw parseError;
    }
  }

  listAvailableVoices(): string[] {
    return VENICE_VOICES;
  }
}
