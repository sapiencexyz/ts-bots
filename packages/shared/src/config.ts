import { config } from 'dotenv';

// Load environment variables
config();

export interface BotConfig {
  apiUrl: string;
  graphqlEndpoint: string;
  environment: 'development' | 'production' | 'test';
  openaiApiKey?: string;
}

export function createConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  const envConfig: BotConfig = {
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    graphqlEndpoint:
      process.env.SAPIENCE_API ||
      process.env.GRAPHQL_ENDPOINT ||
      'http://localhost:3000/graphql',
    environment:
      (process.env.NODE_ENV as BotConfig['environment']) || 'development',
    openaiApiKey: process.env.OPENAI_API_KEY,
  };

  return { ...envConfig, ...overrides };
}
