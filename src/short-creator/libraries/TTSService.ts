// src/short-creator/libraries/TTSService.ts

export interface TTSResult {
    audio: ArrayBuffer;
    audioLength: number;
  }
  
  export interface TTSService {
    generate(text: string, voice: string): Promise<TTSResult>;
    listAvailableVoices(): string[];
  }