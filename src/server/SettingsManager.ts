// src/server/SettingsManager.ts

import fs from 'fs-extra';
import path from 'path';
import { logger } from '../logger';
import type { Config } from '../config';

export interface AppSettings {
  veniceApiKey?: string;
  veniceChatModel?: string;
  ttsProvider?: 'kokoro' | 'venice';
  transcriptionProvider?: 'whisper' | 'venice';
  ttsSpeed?: number;
  pexelsApiKey?: string;
}

export class SettingsManager {
  private settingsPath: string;
  private settings: AppSettings = {};

  constructor(private config: Config) {
    this.settingsPath = path.join(config.dataDirPath, 'settings.json');
    this.loadSettings();
  }

  /**
   * Load settings from file
   */
  private loadSettings(): void {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        this.settings = JSON.parse(data);
        logger.debug({ settings: this.settings }, 'Settings loaded');
        // Apply loaded settings to config
        this.applySettingsToConfig();
      } else {
        // Initialize with defaults from config
        this.settings = {
          veniceApiKey: this.config.veniceApiKey,
          veniceChatModel: this.config.veniceChatModel,
          ttsProvider: this.config.ttsProvider,
          transcriptionProvider: this.config.transcriptionProvider,
          pexelsApiKey: this.config.pexelsApiKey,
        };
        this.saveSettings();
      }
    } catch (error) {
      logger.error(error, 'Error loading settings');
      this.settings = {};
    }
  }

  /**
   * Apply loaded settings to the config object
   */
  private applySettingsToConfig(): void {
    if (this.settings.veniceApiKey !== undefined) {
      this.config.veniceApiKey = this.settings.veniceApiKey;
    }
    if (this.settings.veniceChatModel !== undefined) {
      this.config.veniceChatModel = this.settings.veniceChatModel;
    }
    if (this.settings.ttsProvider !== undefined) {
      this.config.ttsProvider = this.settings.ttsProvider;
    }
    if (this.settings.transcriptionProvider !== undefined) {
      this.config.transcriptionProvider = this.settings.transcriptionProvider;
    }
    if (this.settings.pexelsApiKey !== undefined) {
      this.config.pexelsApiKey = this.settings.pexelsApiKey;
    }
  }

  /**
   * Save settings to file
   */
  private saveSettings(): void {
    try {
      fs.writeFileSync(
        this.settingsPath,
        JSON.stringify(this.settings, null, 2),
        'utf-8'
      );
      logger.debug({ settings: this.settings }, 'Settings saved');
    } catch (error) {
      logger.error(error, 'Error saving settings');
    }
  }

  /**
   * Get all settings (with sensitive data masked)
   */
  getSettings(includeSensitive: boolean = false): AppSettings {
    if (includeSensitive) {
      return { ...this.settings };
    }

    // Mask sensitive data
    return {
      ...this.settings,
      veniceApiKey: this.settings.veniceApiKey ? '***' : undefined,
      pexelsApiKey: this.settings.pexelsApiKey ? '***' : undefined,
    };
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.settings = {
      ...this.settings,
      ...newSettings,
    };
    this.saveSettings();

    // Update config with new settings
    if (newSettings.veniceApiKey !== undefined) {
      this.config.veniceApiKey = newSettings.veniceApiKey;
    }
    if (newSettings.veniceChatModel !== undefined) {
      this.config.veniceChatModel = newSettings.veniceChatModel;
    }
    if (newSettings.ttsProvider !== undefined) {
      this.config.ttsProvider = newSettings.ttsProvider;
    }
    if (newSettings.transcriptionProvider !== undefined) {
      this.config.transcriptionProvider = newSettings.transcriptionProvider;
    }
    if (newSettings.pexelsApiKey !== undefined) {
      this.config.pexelsApiKey = newSettings.pexelsApiKey;
    }

    return this.getSettings();
  }

  /**
   * Get a specific setting value
   */
  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  /**
   * Set a specific setting value
   */
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.settings[key] = value;
    this.saveSettings();

    // Update config
    if (key === 'veniceApiKey' && typeof value === 'string') {
      this.config.veniceApiKey = value;
    } else if (key === 'veniceChatModel' && typeof value === 'string') {
      this.config.veniceChatModel = value;
    } else if (key === 'ttsProvider') {
      this.config.ttsProvider = value as 'kokoro' | 'venice';
    } else if (key === 'transcriptionProvider') {
      this.config.transcriptionProvider = value as 'whisper' | 'venice';
    } else if (key === 'pexelsApiKey' && typeof value === 'string') {
      this.config.pexelsApiKey = value;
    }
  }

  /**
   * Reset settings to defaults
   */
  resetSettings(): AppSettings {
    this.settings = {
      veniceChatModel: 'llama-3.3-70b',
      ttsProvider: 'kokoro',
      transcriptionProvider: 'whisper',
    };
    this.saveSettings();
    return this.getSettings();
  }
}
