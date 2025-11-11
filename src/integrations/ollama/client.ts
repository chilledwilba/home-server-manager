import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ollama-client');

export interface OllamaConfig {
  host: string;
  port: number;
  model: string;
  timeout?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export interface ModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

/**
 * Ollama client for local LLM inference
 * Allows running Claude-like assistance locally on your own hardware
 */
export class OllamaClient {
  private baseUrl: string;
  private model: string;
  private timeout: number;

  constructor(config: OllamaConfig) {
    this.baseUrl = `http://${config.host}:${config.port}`;
    this.model = config.model;
    this.timeout = config.timeout || 30000;
  }

  /**
   * Send a chat message to Ollama
   */
  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaResponse;
      return data.message.content;
    } catch (error) {
      logger.error({ err: error }, 'Failed to chat with Ollama');
      throw error;
    }
  }

  /**
   * Analyze system state using local LLM
   */
  async analyzeSystemState(systemData: unknown): Promise<string> {
    const prompt = `You are a TrueNAS and Docker expert assistant. Analyze this system data and provide insights:

System Data:
${JSON.stringify(systemData, null, 2)}

Provide:
1. Current system health assessment
2. Any concerning patterns
3. Optimization opportunities
4. Recommended actions

Be concise and actionable.`;

    const response = await this.chat([
      { role: 'system', content: 'You are a helpful server administration assistant.' },
      { role: 'user', content: prompt },
    ]);

    return response;
  }

  /**
   * Analyze a specific problem
   */
  async analyzeProblem(problem: string, context: unknown): Promise<string> {
    const prompt = `A user is experiencing the following issue:
${problem}

Context:
${JSON.stringify(context, null, 2)}

Provide:
1. Likely root causes
2. Diagnostic steps to verify
3. Recommended fixes
4. Preventive measures

Be specific and technical.`;

    const response = await this.chat([
      {
        role: 'system',
        content:
          'You are an expert TrueNAS and Docker troubleshooting assistant. Provide actionable technical advice.',
      },
      { role: 'user', content: prompt },
    ]);

    return response;
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizations(metrics: unknown): Promise<string> {
    const prompt = `Based on these system metrics, provide optimization recommendations:

${JSON.stringify(metrics, null, 2)}

Hardware context:
- CPU: Intel i5-12400 (6 cores, 12 threads, QuickSync)
- RAM: 64GB DDR5
- Storage: 2x4TB mirror (personal), 8TB (media), 1TB NVMe (apps)

Focus on:
1. Resource utilization improvements
2. Performance bottlenecks
3. Configuration optimizations
4. Hardware feature utilization (QuickSync, etc.)

Provide specific, implementable recommendations.`;

    const response = await this.chat([
      {
        role: 'system',
        content: 'You are a server performance optimization expert specialized in home labs.',
      },
      { role: 'user', content: prompt },
    ]);

    return response;
  }

  /**
   * Check if Ollama is available and responding
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      logger.debug({ err: error }, 'Ollama not available');
      return false;
    }
  }

  /**
   * List available models on Ollama server
   */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = (await response.json()) as { models: ModelInfo[] };
      return data.models;
    } catch (error) {
      logger.error({ err: error }, 'Failed to list Ollama models');
      return [];
    }
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      logger.info(`Pulling model: ${modelName}`);

      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modelName,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model: ${response.status}`);
      }

      logger.info(`Model ${modelName} pulled successfully`);
    } catch (error) {
      logger.error({ err: error, model: modelName }, 'Failed to pull model');
      throw error;
    }
  }

  /**
   * Get recommended models for home server use
   */
  static getRecommendedModels(): Array<{
    name: string;
    description: string;
    size: string;
    use_case: string;
  }> {
    return [
      {
        name: 'llama2:13b',
        description: 'General purpose LLM with good reasoning',
        size: '7.4GB',
        use_case: 'System analysis, troubleshooting, general questions',
      },
      {
        name: 'codellama:13b',
        description: 'Specialized for code and configuration',
        size: '7.4GB',
        use_case: 'Docker configs, scripts, technical documentation',
      },
      {
        name: 'mistral:7b',
        description: 'Fast and efficient, good for quick queries',
        size: '4.1GB',
        use_case: 'Quick diagnostics, log analysis, alerts',
      },
      {
        name: 'mixtral:8x7b',
        description: 'Mixture of experts, high quality',
        size: '26GB',
        use_case: 'Complex analysis, requires 24GB+ VRAM',
      },
      {
        name: 'dolphin-mixtral:8x7b',
        description: 'Uncensored Mixtral variant',
        size: '26GB',
        use_case: 'Technical troubleshooting without restrictions',
      },
    ];
  }
}

/**
 * GPU recommendations for running Ollama
 */
export const gpuRecommendations = {
  budget: {
    card: 'NVIDIA RTX 4060 Ti 16GB',
    price: '~$500',
    vram: '16GB',
    pros: [
      'Good VRAM for 13B parameter models',
      'Low power consumption',
      'Fits in compact cases',
      'Can run Llama 2 13B, CodeLlama, Mistral',
    ],
    cons: ['Limited to medium-sized models'],
    recommended_models: ['llama2:13b', 'codellama:13b', 'mistral:7b'],
  },
  balanced: {
    card: 'NVIDIA RTX 4070 Ti SUPER 16GB',
    price: '~$800',
    vram: '16GB',
    pros: [
      'Faster inference than 4060 Ti',
      'Better for continuous use',
      'Can run quantized 30B models',
      'Good for Plex transcoding backup',
    ],
    cons: ['Higher power draw'],
    recommended_models: ['llama2:13b', 'codellama:13b', 'mixtral:8x7b (quantized)'],
  },
  performance: {
    card: 'NVIDIA RTX 4090 24GB',
    price: '~$1600',
    vram: '24GB',
    pros: [
      'Can run 30B models comfortably',
      'Fast inference speeds',
      'Future-proof for larger models',
      'Excellent for ML experiments',
    ],
    cons: ['High power consumption', 'May need PSU upgrade', 'Size constraints in compact cases'],
    recommended_models: ['mixtral:8x7b', 'llama2:70b (quantized)', 'dolphin-mixtral:8x7b'],
  },
  alternative: {
    card: 'Used NVIDIA Tesla P40 24GB',
    price: '~$600-800',
    vram: '24GB',
    pros: ['Massive VRAM for the price', 'Great for inference', 'Can run large models'],
    cons: ['No display output', 'Passive cooling (needs airflow)', 'Older architecture'],
    recommended_models: ['mixtral:8x7b', 'llama2:70b (quantized)'],
  },
} as const;
