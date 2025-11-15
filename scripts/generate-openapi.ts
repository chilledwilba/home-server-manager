import { writeFileSync } from 'fs';
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import { swaggerConfig } from '../src/config/swagger.js';

/**
 * Generate OpenAPI specification file
 * This script builds a minimal Fastify instance with Swagger
 * and exports the OpenAPI specification to openapi.json
 */
async function generateOpenAPI(): Promise<void> {
  try {
    // Create minimal Fastify instance
    const app = Fastify({
      logger: false,
    });

    // Register swagger
    await app.register(fastifySwagger, swaggerConfig);

    // Wait for app to be ready
    await app.ready();

    // Get OpenAPI spec
    const spec = app.swagger();

    // Write to file
    writeFileSync('openapi.json', JSON.stringify(spec, null, 2), 'utf-8');

    console.log('✅ OpenAPI spec generated: openapi.json');
    console.log(`   Version: ${spec.info?.version}`);
    console.log(`   Title: ${spec.info?.title}`);

    // Close app
    await app.close();

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to generate OpenAPI spec:', error);
    process.exit(1);
  }
}

void generateOpenAPI();
