import OpenAI from 'openai';
import { BotConfig } from './config';

export interface MarketPredictionInput {
  question: string;
  claimYes?: string;
  claimNo?: string;
}

export interface MarketPrediction {
  probabilityYes: number; // 0..1
  reasoning?: string;
}

export class OpenAIService {
  private client: OpenAI;

  constructor(private config: BotConfig) {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }
    this.client = new OpenAI({ apiKey });
  }

  async predictMarket(input: MarketPredictionInput): Promise<MarketPrediction> {
    const prompt = this.buildPrompt(input);

    const completion = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a cautious, concise forecaster. Return a single probability between 0 and 1 for YES being true. Include a one-sentence rationale. Output JSON with keys probabilityYes and reasoning.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' } as any,
    });

    const content = completion.choices[0]?.message?.content || '{}';
    try {
      const parsed = JSON.parse(content);
      let p = Number(parsed.probabilityYes);
      if (!isFinite(p)) p = 0.5;
      p = Math.max(0, Math.min(1, p));
      return { probabilityYes: p, reasoning: parsed.reasoning };
    } catch {
      return { probabilityYes: 0.5 };
    }
  }

  private buildPrompt(input: MarketPredictionInput): string {
    const parts: string[] = [];
    parts.push(`Question: ${input.question}`);
    if (input.claimYes) parts.push(`YES statement: ${input.claimYes}`);
    if (input.claimNo) parts.push(`NO statement: ${input.claimNo}`);
    parts.push('Return JSON only.');
    return parts.join('\n');
  }
}

export function createOpenAIService(config: BotConfig): OpenAIService {
  return new OpenAIService(config);
}
