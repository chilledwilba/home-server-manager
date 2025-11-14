import { createLogger } from '../../utils/logger.js';
import type { OllamaClient } from '../../integrations/ollama/client.js';
import type { AnomalyDetection, CostOptimization } from './insights-service.js';

const logger = createLogger('ai-analysis');

/**
 * AI Analysis
 * Handles AI-powered analysis using Ollama
 */
export class AIAnalysis {
  constructor(private ollama: OllamaClient | null) {}

  /**
   * Check if AI analysis is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.ollama) return false;
    try {
      return await this.ollama.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Get AI analysis for anomalies
   */
  async getAnomalyAnalysis(anomalies: AnomalyDetection['anomalies']): Promise<string> {
    if (!this.ollama) return 'AI analysis unavailable';

    const prompt = `Analyze these system anomalies and provide a concise summary:

${JSON.stringify(anomalies, null, 2)}

Provide:
1. Overall severity assessment
2. Most critical issues
3. Prioritized action plan (max 3 steps)

Be concise and actionable.`;

    try {
      const response = await this.ollama.chat([
        {
          role: 'system',
          content: 'You are an expert system administrator analyzing server anomalies.',
        },
        { role: 'user', content: prompt },
      ]);

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get AI anomaly analysis');
      return `Detected ${anomalies.length} anomalies. Review recommendations for each.`;
    }
  }

  /**
   * Get AI cost analysis
   */
  async getCostAnalysis(
    state: CostOptimization['current_state'],
    opportunities: CostOptimization['opportunities'],
  ): Promise<string> {
    if (!this.ollama) return 'AI analysis unavailable';

    const prompt = `Analyze these cost optimization opportunities:

Current State:
${JSON.stringify(state, null, 2)}

Opportunities:
${JSON.stringify(opportunities, null, 2)}

Provide:
1. Top 3 highest impact optimizations
2. Implementation priority
3. Estimated ROI timeline

Be specific and actionable.`;

    try {
      const response = await this.ollama.chat([
        {
          role: 'system',
          content: 'You are a cost optimization expert for home lab infrastructure.',
        },
        { role: 'user', content: prompt },
      ]);

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Failed to get AI cost analysis');
      return 'Review the optimization opportunities above.';
    }
  }
}
