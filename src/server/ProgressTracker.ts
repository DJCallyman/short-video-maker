// src/server/ProgressTracker.ts

import { EventEmitter } from 'events';
import type { Response } from 'express';
import { logger } from '../logger';

export interface ProgressEvent {
  videoId: string;
  stage: 'queued' | 'generating_audio' | 'transcribing' | 'fetching_videos' | 'composing' | 'rendering' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export class ProgressTracker extends EventEmitter {
  private connections: Map<string, Response[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Add SSE connection for a specific video
   */
  addConnection(videoId: string, res: Response): void {
    logger.debug({ videoId }, 'Adding SSE connection for video');

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial connection message
    this.sendEvent(res, {
      videoId,
      stage: 'queued',
      progress: 0,
      message: 'Connected to progress stream',
    });

    // Store connection
    const connections = this.connections.get(videoId) || [];
    connections.push(res);
    this.connections.set(videoId, connections);

    // Clean up on disconnect
    res.on('close', () => {
      logger.debug({ videoId }, 'SSE connection closed');
      this.removeConnection(videoId, res);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      if (res.writableEnded) {
        clearInterval(heartbeat);
        return;
      }
      res.write(': heartbeat\n\n');
    }, 30000); // 30 seconds

    res.on('close', () => clearInterval(heartbeat));
  }

  /**
   * Remove SSE connection
   */
  private removeConnection(videoId: string, res: Response): void {
    const connections = this.connections.get(videoId);
    if (connections) {
      const index = connections.indexOf(res);
      if (index !== -1) {
        connections.splice(index, 1);
      }
      if (connections.length === 0) {
        this.connections.delete(videoId);
      } else {
        this.connections.set(videoId, connections);
      }
    }
  }

  /**
   * Update progress for a video
   */
  updateProgress(event: ProgressEvent): void {
    logger.debug(event, 'Progress update');

    const connections = this.connections.get(event.videoId);
    if (connections && connections.length > 0) {
      connections.forEach((res) => {
        if (!res.writableEnded) {
          this.sendEvent(res, event);
        }
      });
    }

    // Emit event for other listeners
    this.emit('progress', event);

    // Clean up connections on completion or error
    if (event.stage === 'complete' || event.stage === 'error') {
      setTimeout(() => {
        const conns = this.connections.get(event.videoId);
        if (conns) {
          conns.forEach((res) => {
            if (!res.writableEnded) {
              res.end();
            }
          });
          this.connections.delete(event.videoId);
        }
      }, 1000); // Give 1 second to receive final message
    }
  }

  /**
   * Send SSE event
   */
  private sendEvent(res: Response, event: ProgressEvent): void {
    const data = JSON.stringify(event);
    res.write(`data: ${data}\n\n`);
  }

  /**
   * Get all active video IDs being tracked
   */
  getActiveVideos(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Close all connections for a video
   */
  closeConnections(videoId: string): void {
    const connections = this.connections.get(videoId);
    if (connections) {
      connections.forEach((res) => {
        if (!res.writableEnded) {
          res.end();
        }
      });
      this.connections.delete(videoId);
    }
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    this.connections.forEach((connections) => {
      connections.forEach((res) => {
        if (!res.writableEnded) {
          res.end();
        }
      });
    });
    this.connections.clear();
  }
}
