/* eslint-disable @typescript-eslint/no-explicit-any, no-undef */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OllamaClient } from '../../../../src/integrations/ollama/client.js';

describe('OllamaClient', () => {
  let client: OllamaClient;
  let originalFetch: typeof global.fetch;
  let originalSetTimeout: typeof global.setTimeout;
  let originalClearTimeout: typeof global.clearTimeout;

  beforeEach(() => {
    // Save original fetch and timers
    originalFetch = global.fetch;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    // Create client instance
    client = new OllamaClient({
      host: 'localhost',
      port: 11434,
      model: 'llama2:13b',
      timeout: 30000,
    });
  });

  afterEach(() => {
    // Restore original fetch and timers
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with correct baseUrl', () => {
      const testClient = new OllamaClient({
        host: 'ollama.local',
        port: 11434,
        model: 'mistral:7b',
      });

      expect((testClient as any).baseUrl).toBe('http://ollama.local:11434');
    });

    it('should store model configuration', () => {
      const testClient = new OllamaClient({
        host: 'localhost',
        port: 11434,
        model: 'codellama:13b',
      });

      expect((testClient as any).model).toBe('codellama:13b');
    });

    it('should use default timeout of 30000ms', () => {
      const testClient = new OllamaClient({
        host: 'localhost',
        port: 11434,
        model: 'llama2:13b',
      });

      expect((testClient as any).timeout).toBe(30000);
    });

    it('should use custom timeout when provided', () => {
      const testClient = new OllamaClient({
        host: 'localhost',
        port: 11434,
        model: 'llama2:13b',
        timeout: 60000,
      });

      expect((testClient as any).timeout).toBe(60000);
    });
  });

  describe('chat', () => {
    it('should send chat request and return response', async () => {
      const mockResponse = {
        model: 'llama2:13b',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'This is a test response from the AI.',
        },
        done: true,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: 'Hello!' },
      ];

      const response = await client.chat(messages);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama2:13b',
            messages,
            stream: false,
          }),
        }),
      );

      expect(response).toBe('This is a test response from the AI.');
    });

    it('should throw error when API request fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response) as any;

      const messages = [{ role: 'user' as const, content: 'Hello!' }];

      await expect(client.chat(messages)).rejects.toThrow(
        'Ollama error: 500 Internal Server Error',
      );
    });

    it('should handle network errors', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Network error')) as any;

      const messages = [{ role: 'user' as const, content: 'Hello!' }];

      await expect(client.chat(messages)).rejects.toThrow('Network error');
    });
  });

  describe('analyzeSystemState', () => {
    it('should analyze system state with AI', async () => {
      const mockResponse = {
        model: 'llama2:13b',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'System health is good. All services running normally.',
        },
        done: true,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const systemData = {
        cpu: 45,
        memory: 60,
        pools: ['media-pool', 'apps-pool'],
      };

      const analysis = await client.analyzeSystemState(systemData);

      expect(global.fetch).toHaveBeenCalled();
      expect(analysis).toBe('System health is good. All services running normally.');

      // Verify the prompt contains system data
      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as any;
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[1].content).toContain(JSON.stringify(systemData, null, 2));
    });
  });

  describe('analyzeProblem', () => {
    it('should analyze specific problems with context', async () => {
      const mockResponse = {
        model: 'llama2:13b',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content: 'The container is failing due to insufficient memory allocation.',
        },
        done: true,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const problem = 'Container keeps crashing';
      const context = {
        container: 'plex',
        memory_limit: '2GB',
        error: 'OOM Killed',
      };

      const analysis = await client.analyzeProblem(problem, context);

      expect(global.fetch).toHaveBeenCalled();
      expect(analysis).toBe('The container is failing due to insufficient memory allocation.');

      // Verify the prompt contains problem and context
      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as any;
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[1].content).toContain(problem);
      expect(body.messages[1].content).toContain(JSON.stringify(context, null, 2));
    });
  });

  describe('generateOptimizations', () => {
    it('should generate optimization recommendations', async () => {
      const mockResponse = {
        model: 'llama2:13b',
        created_at: '2024-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          content:
            '1. Enable QuickSync for Plex\n2. Increase ZFS ARC cache\n3. Use NVMe for Docker volumes',
        },
        done: true,
      };

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response) as any;

      const metrics = {
        cpu_usage: 65,
        memory_usage: 75,
        disk_io: 'moderate',
      };

      const optimizations = await client.generateOptimizations(metrics);

      expect(global.fetch).toHaveBeenCalled();
      expect(optimizations).toContain('QuickSync');

      // Verify the prompt contains metrics and hardware context
      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as any;
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[1].content).toContain(JSON.stringify(metrics, null, 2));
      expect(body.messages[1].content).toContain('Intel i5-12400');
    });
  });

  describe('isAvailable', () => {
    it('should return true when Ollama is available', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
      } as Response) as any;

      const available = await client.isAvailable();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(available).toBe(true);
    });

    it('should return false when Ollama is not available', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 503,
      } as Response) as any;

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Connection refused')) as any;

      const available = await client.isAvailable();

      expect(available).toBe(false);
    });
  });

  describe('listModels', () => {
    it('should list available models', async () => {
      const mockModels = [
        {
          name: 'llama2:13b',
          modified_at: '2024-01-01T00:00:00Z',
          size: 7365960704,
          digest: 'sha256:abc123',
        },
        {
          name: 'mistral:7b',
          modified_at: '2024-01-02T00:00:00Z',
          size: 4109865984,
          digest: 'sha256:def456',
        },
      ];

      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: mockModels }),
      } as Response) as any;

      const models = await client.listModels();

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
      expect(models).toEqual(mockModels);
      expect(models).toHaveLength(2);
      expect(models[0]?.name).toBe('llama2:13b');
    });

    it('should return empty array when API fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response) as any;

      const models = await client.listModels();

      expect(models).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Network error')) as any;

      const models = await client.listModels();

      expect(models).toEqual([]);
    });
  });

  describe('pullModel', () => {
    it('should pull a model successfully', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: true,
      } as Response) as any;

      await client.pullModel('llama2:7b');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/pull',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'llama2:7b',
            stream: false,
          }),
        }),
      );
    });

    it('should throw error when pull fails', async () => {
      global.fetch = jest.fn<typeof fetch>().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response) as any;

      await expect(client.pullModel('nonexistent:model')).rejects.toThrow(
        'Failed to pull model: 404',
      );
    });

    it('should throw error on network failure', async () => {
      global.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error('Connection timeout')) as any;

      await expect(client.pullModel('llama2:7b')).rejects.toThrow('Connection timeout');
    });
  });

  describe('getRecommendedModels', () => {
    it('should return list of recommended models', () => {
      const recommendations = OllamaClient.getRecommendedModels();

      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toHaveProperty('name');
      expect(recommendations[0]).toHaveProperty('description');
      expect(recommendations[0]).toHaveProperty('size');
      expect(recommendations[0]).toHaveProperty('use_case');
    });

    it('should include llama2:13b in recommendations', () => {
      const recommendations = OllamaClient.getRecommendedModels();

      const llama2 = recommendations.find((r) => r.name === 'llama2:13b');
      expect(llama2).toBeDefined();
      expect(llama2?.description).toContain('General purpose');
    });

    it('should include codellama:13b in recommendations', () => {
      const recommendations = OllamaClient.getRecommendedModels();

      const codellama = recommendations.find((r) => r.name === 'codellama:13b');
      expect(codellama).toBeDefined();
      expect(codellama?.use_case).toContain('Docker');
    });

    it('should include mistral:7b in recommendations', () => {
      const recommendations = OllamaClient.getRecommendedModels();

      const mistral = recommendations.find((r) => r.name === 'mistral:7b');
      expect(mistral).toBeDefined();
      expect(mistral?.description).toContain('Fast');
    });

    it('should include size information for each model', () => {
      const recommendations = OllamaClient.getRecommendedModels();

      recommendations.forEach((model) => {
        expect(model.size).toMatch(/\d+(\.\d+)?[MG]B/);
      });
    });
  });
});
