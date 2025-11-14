import type { Server as HTTPServer } from 'http';
import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';

/**
 * Available Socket.IO room names for real-time updates
 */
export const SOCKET_ROOMS = {
  SYSTEM: 'system',
  STORAGE: 'storage',
  SMART: 'smart',
  DOCKER: 'docker',
  ARR: 'arr',
  PLEX: 'plex',
  SECURITY: 'security',
} as const;

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

    // Dynamically register room join handlers
    Object.values(SOCKET_ROOMS).forEach((roomName) => {
      socket.on(`join:${roomName}`, () => {
        void socket.join(roomName);
        logger.info(`Client ${socket.id} joined ${roomName} room`);
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
