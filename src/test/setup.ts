/**
 * Jest test setup file
 * Configure global test environment and utilities
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods in tests to reduce noise
const originalConsole = console;

beforeEach(() => {
  // Reset console mocks before each test
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  // Restore console after each test
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});