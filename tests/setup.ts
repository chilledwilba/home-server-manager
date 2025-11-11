// Test setup file
import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

// Increase timeout for integration tests
jest.setTimeout(10000);

// Clean up after tests
afterAll(async () => {
  // Close any open handles
  await new Promise((resolve) => setTimeout(resolve, 100));
});
