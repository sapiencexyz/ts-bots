import { GraphQLClient } from 'graphql-request';
import { BotConfig } from './config';

export class GraphQLService {
  private client: GraphQLClient;
  private config: BotConfig;

  constructor(config: BotConfig) {
    this.config = config;
    this.client = new GraphQLClient(config.graphqlEndpoint);
  }

  async query<T = any>(
    query: string,
    variables?: Record<string, any>
  ): Promise<T> {
    try {
      return await this.client.request<T>(query, variables);
    } catch (error) {
      console.error('GraphQL query error:', error);
      throw error;
    }
  }

  async mutation<T = any>(
    mutation: string,
    variables?: Record<string, any>
  ): Promise<T> {
    try {
      return await this.client.request<T>(mutation, variables);
    } catch (error) {
      console.error('GraphQL mutation error:', error);
      throw error;
    }
  }

  updateConfig(newConfig: Partial<BotConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.client = new GraphQLClient(this.config.graphqlEndpoint);
  }
}

// Factory function for creating GraphQL service instances
export function createGraphQLService(config: BotConfig): GraphQLService {
  return new GraphQLService(config);
}

export const MARKETS_QUERY = /* GraphQL */ `
  query Markets($where: MarketWhereInput) {
    markets(where: $where) {
      marketGroup {
        collateralAsset
        question
        address
      }
      endTimestamp
      marketId
      marketGroupId
      claimStatementYesOrNumeric
      claimStatementNo
    }
  }
`;

export type MarketsQueryResult = {
  markets: Array<{
    marketId: string;
    marketGroupId: string;
    endTimestamp?: string | number | null;
    claimStatementYesOrNumeric?: string | null;
    claimStatementNo?: string | null;
    marketGroup: {
      collateralAsset: string;
      question?: string | null;
      address: string;
    };
  }>;
};
