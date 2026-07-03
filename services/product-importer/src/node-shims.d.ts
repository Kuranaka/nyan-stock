declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: BufferEncoding): Promise<string>;
  export function writeFile(path: string, data: string, encoding: BufferEncoding): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: BufferEncoding): string;
}

declare module 'node:path' {
  const path: {
    dirname(value: string): string;
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
  };
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'pg' {
  export class Client {
    constructor(config: { connectionString?: string });
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
  }
}

type BufferEncoding = 'utf8';

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode?: number;
};
