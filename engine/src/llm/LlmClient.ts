import OpenAI from 'openai';
import { ILlmClient, Message } from '../types';

export interface LlmClientConfig {
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * LLM interaction layer — wraps LM Studio's OpenAI-compatible HTTP API.
 * All engine components receive ILlmClient; this concrete class is wired
 * up only in the application entry point (index.ts).
 */
export class LlmClient implements ILlmClient {
  private readonly client: OpenAI;
  private readonly config: LlmClientConfig;

  constructor(config: LlmClientConfig) {
    this.config = config;
    this.client = new OpenAI({
      baseURL: config.baseURL,
      // LM Studio accepts any non-empty API key
      apiKey: 'lm-studio',
    });
  }

  async complete(messages: Message[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  async *completeStream(messages: Message[]): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content;
      if (token) yield token;
    }
  }
}
