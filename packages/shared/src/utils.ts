import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { BotConfig } from './config';

export class ApiClient {
  private axios: AxiosInstance;

  constructor(config: BotConfig) {
    this.axios = axios.create({
      baseURL: config.apiUrl,
      headers: {},
    });
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.get(url, config);
    return response.data;
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axios.post(url, data, config);
    return response.data;
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await this.axios.put(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.delete(url, config);
    return response.data;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await fn();
        resolve(result);
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          reject(error);
          return;
        }
        await sleep(delay * attempt);
      }
    }
  });
}

export function createLogger(botName: string) {
  type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

  const levelOrder: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100,
  };

  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  const defaultLevel: LogLevel =
    envLevel && envLevel in levelOrder
      ? envLevel
      : process.env.NODE_ENV === 'production'
        ? 'info'
        : 'debug';

  let currentLevel: LogLevel = defaultLevel;

  const shouldLog = (level: LogLevel) =>
    levelOrder[level] >= levelOrder[currentLevel];

  const format = (level: string, message: string) =>
    `[${botName}] ${level.toUpperCase()}: ${message}`;

  return {
    info: (message: string, ...args: any[]) => {
      if (shouldLog('info')) console.log(format('info', message), ...args);
    },
    warn: (message: string, ...args: any[]) => {
      if (shouldLog('warn')) console.warn(format('warn', message), ...args);
    },
    error: (message: string, ...args: any[]) => {
      if (shouldLog('error')) console.error(format('error', message), ...args);
    },
    debug: (message: string, ...args: any[]) => {
      if (shouldLog('debug')) console.debug(format('debug', message), ...args);
    },
    setLevel: (level: LogLevel) => {
      if (level in levelOrder) currentLevel = level;
    },
    getLevel: (): LogLevel => currentLevel,
  };
}
