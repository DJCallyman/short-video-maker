import axios from 'axios';
import { logger } from '../../logger';

interface PlexMovie {
  id: string;
  title: string;
  year: number;
}

export class PlexApi {
  private plexUrl: string;
  private plexToken: string;

  constructor(plexUrl: string, plexToken: string) {
    this.plexUrl = plexUrl;
    this.plexToken = plexToken;
  }

  async getMovies(): Promise<PlexMovie[]> {
    try {
      const response = await axios.get(`${this.plexUrl}/library/sections/1/all`, {
        headers: {
          'X-Plex-Token': this.plexToken,
          'Accept': 'application/json',
        },
      });

      if (response.data.MediaContainer.Metadata) {
        return response.data.MediaContainer.Metadata.map((movie: any) => ({
          id: movie.ratingKey,
          title: movie.title,
          year: movie.year,
        }));
      }

      return [];
    } catch (error) {
      logger.error('Error fetching movies from Plex:', error);
      throw new Error('Failed to fetch movies from Plex');
    }
  }

  async getMovieFilePath(movieId: string): Promise<string> {
    try {
      // This part of the URL is what tells Plex to give us a streamable link
      const streamUrl = `${this.plexUrl}/library/metadata/${movieId}?X-Plex-Token=${this.plexToken}`;
      logger.info({ streamUrl }, "Generated Plex stream URL");
      return streamUrl;

    } catch (error) {
      logger.error('Error fetching movie file path from Plex:', error);
      throw new Error('Failed to fetch movie file path from Plex');
    }
  }
}