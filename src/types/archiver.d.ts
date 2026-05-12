declare module 'archiver' {
  import { Transform } from 'stream';

  export class ZipArchive extends Transform {
    constructor(options?: { zlib?: { level?: number } });
    append(source: Buffer | string, data: { name: string }): this;
    finalize(): Promise<void>;
  }
}
