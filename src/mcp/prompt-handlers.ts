/**
 * MCP Prompt Handlers
 * Handles prompt definitions and content
 */
export const promptDefinitions = [
  {
    name: 'diagnose_system',
    description: 'Run full system diagnostics',
    arguments: [],
  },
  {
    name: 'security_audit',
    description: 'Perform security audit',
    arguments: [],
  },
  {
    name: 'optimize_performance',
    description: 'Analyze and optimize performance',
    arguments: [],
  },
];

const promptContent: Record<string, string> = {
  diagnose_system: `Please run a comprehensive system diagnosis:

1. Check system resources (CPU, memory, storage)
2. Verify all pools are healthy
3. Check container status
4. Review recent alerts
5. Identify any issues
6. Provide recommendations

Use available tools to gather data and provide a detailed analysis.`,

  security_audit: `Perform a security audit:

1. Check for exposed ports
2. Review container security
3. Check authentication settings
4. Identify vulnerabilities
5. Provide hardening recommendations

Focus on actionable items with clear steps to improve security.`,

  optimize_performance: `Analyze system performance and provide optimization recommendations:

1. Review resource usage patterns
2. Identify bottlenecks
3. Check for inefficient configurations
4. Suggest optimizations
5. Consider hardware capabilities (i5-12400 QuickSync, 64GB RAM, NVMe)

Provide specific, actionable recommendations.`,
};

export function getPromptContent(name: string): {
  description: string;
  messages: Array<{ role: string; content: { type: string; text: string } }>;
} {
  const description = promptContent[name];
  if (!description) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  return {
    description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: description,
        },
      },
    ],
  };
}
