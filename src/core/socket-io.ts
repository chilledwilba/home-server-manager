import type { Server as HTTPServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { wsConnectionsGauge } from '../utils/metrics.js';

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

  // Track total connections
  const updateConnectionMetrics = (): void => {
    const totalConnections = io.sockets.sockets.size;
    wsConnectionsGauge.set({ room: 'total' }, totalConnections);

    // Track per-room connections
    Object.values(SOCKET_ROOMS).forEach((roomName) => {
      const roomSockets = io.sockets.adapter.rooms.get(roomName);
      const roomSize = roomSockets?.size || 0;
      wsConnectionsGauge.set({ room: roomName }, roomSize);
    });
  };

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    logger.info(`Client connected: ${socket.id}`);
    updateConnectionMetrics();

    // Dynamically register room join handlers
    Object.values(SOCKET_ROOMS).forEach((roomName) => {
      socket.on(`join:${roomName}`, () => {
        void socket.join(roomName);
        logger.info(`Client ${socket.id} joined ${roomName} room`);
        updateConnectionMetrics();
      });
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
      updateConnectionMetrics();
    });
  });

  return io;
}
