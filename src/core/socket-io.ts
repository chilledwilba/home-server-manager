import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';

/**
 * Create and configure Socket.IO server with room management
 */
export function createSocketIOServer(httpServer: HTTPServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on('join:system', () => {
      void socket.join('system');
      logger.info(`Client ${socket.id} joined system room`);
    });

    socket.on('join:storage', () => {
      void socket.join('storage');
      logger.info(`Client ${socket.id} joined storage room`);
    });

    socket.on('join:smart', () => {
      void socket.join('smart');
      logger.info(`Client ${socket.id} joined smart room`);
    });

    socket.on('join:docker', () => {
      void socket.join('docker');
      logger.info(`Client ${socket.id} joined docker room`);
    });

    socket.on('join:arr', () => {
      void socket.join('arr');
      logger.info(`Client ${socket.id} joined arr room`);
    });

    socket.on('join:plex', () => {
      void socket.join('plex');
      logger.info(`Client ${socket.id} joined plex room`);
    });

    socket.on('join:security', () => {
      void socket.join('security');
      logger.info(`Client ${socket.id} joined security room`);
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
