// Type definitions for parquetjs
declare module 'parquetjs' {
  export class ParquetSchema {
    constructor(schema: Record<string, { type: string }>);
  }

  export class ParquetWriter {
    static openFile(schema: ParquetSchema, path: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, any>): Promise<void>;
    close(): Promise<void>;
  }
} 