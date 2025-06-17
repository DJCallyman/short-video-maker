import axios from 'axios';
import { TTSService, TTSResult } from './TTSService';
import { logger } from '../../logger';

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

export class VeniceAI implements TTSService {
  private apiKey: string;
  private baseUrl = "https://api.venice.ai/api/v1";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Venice AI API key is required.");
    }
    this.apiKey = apiKey;
  }

  async generate(text: string, voice: string): Promise<TTSResult> {
    logger.debug({ text, voice }, "Generating audio with Venice AI");

    try {
      const response = await axios.post(
        `${this.baseUrl}/audio/speech`,
        {
          input: text,
          voice: voice,
          model: 'tts-kokoro', // As per the spec, this seems to be the main model
          response_format: 'wav' // Request WAV format for captioning
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      const audio = response.data;
      
      // The Venice AI API does not seem to return the audio duration.
      // We'll estimate it based on text length. A more accurate method would
      // involve using a library to parse the WAV buffer, but this is a 
      // reasonable approximation. (Approx. 15 characters per second of speech).
      const audioLength = text.length / 15;

      logger.debug({ text, voice, audioLength }, "Audio generated with Venice AI");

      return {
        audio,
        audioLength,
      };
    } catch (error) {
      logger.error(error, "Error generating audio from Venice AI");
      throw new Error("Failed to generate audio from Venice AI.");
    }
  }

  listAvailableVoices(): string[] {
    return VENICE_VOICES;
  }
}