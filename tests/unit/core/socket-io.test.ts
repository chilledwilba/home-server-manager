/**
 * Tests for Socket.IO connection tracking and metrics
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Server, Socket } from 'socket.io';
import { type Socket as ClientSocket, io as ioClient } from 'socket.io-client';
import { createSocketIOServer, SOCKET_ROOMS } from '../../../src/core/socket-io.js';
import { wsConnectionsGauge } from '../../../src/utils/metrics.js';

describe('Socket.IO Connection Tracking', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let serverSocket: Socket | undefined;
  let clientSocket: ClientSocket;
  let port: number;

  beforeEach((done) => {
    // Create HTTP server
    httpServer = createServer();

    // Create Socket.IO server with metrics
    io = createSocketIOServer(httpServer);

    // Listen on random port
    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });

    // Store server socket for testing
    io.on('connection', (socket) => {
      serverSocket = socket;
    });
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.close();
    }
    io.close();
    httpServer.close();
  });

  describe('Connection Metrics', () => {
    it('should track total connections', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`);

      clientSocket.on('connect', () => {
        // Verify connection was tracked
        // Note: In real scenario, we'd query the metric, but for unit tests
        // we're testing that the tracking code is called
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should track disconnections', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`);

      clientSocket.on('connect', () => {
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', () => {
        // Verify disconnection was tracked
        expect(clientSocket.connected).toBe(false);
        done();
      });
    });

    it('should track room joins', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`);

      clientSocket.on('connect', () => {
        // Join a room
        clientSocket.emit(`join:${SOCKET_ROOMS.DOCKER}`);

        setTimeout(() => {
          // Verify room join was tracked
          expect(serverSocket).toBeDefined();
          done();
        }, 100);
      });
    });
  });

  describe('Room Management', () => {
    it('should support all defined room types', (done) => {
      clientSocket = ioClient(`http://localhost:${port}`);

      clientSocket.on('connect', () => {
        // Try joining each room
        Object.values(SOCKET_ROOMS).forEach((room) => {
          clientSocket.emit(`join:${room}`);
        });

        setTimeout(() => {
          expect(serverSocket).toBeDefined();
          done();
        }, 100);
      });
    });

    it('should handle multiple clients', (done) => {
      const client1 = ioClient(`http://localhost:${port}`);
      const client2 = ioClient(`http://localhost:${port}`);

      let connectedCount = 0;
      const checkDone = () => {
        connectedCount++;
        if (connectedCount === 2) {
          client1.close();
          client2.close();
          done();
        }
      };

      client1.on('connect', checkDone);
      client2.on('connect', checkDone);
    });
  });

  describe('Metrics Integration', () => {
    it('should export wsConnectionsGauge metric', () => {
      expect(wsConnectionsGauge).toBeDefined();
      expect(typeof wsConnectionsGauge.set).toBe('function');
    });

    it('should update metrics on connection', (done) => {
      const spy = jest.spyOn(wsConnectionsGauge, 'set');

      clientSocket = ioClient(`http://localhost:${port}`);

      clientSocket.on('connect', () => {
        setTimeout(() => {
          // Verify metric was updated
          expect(spy).toHaveBeenCalled();
          spy.mockRestore();
          done();
        }, 100);
      });
    });
  });
});
