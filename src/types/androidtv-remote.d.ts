declare module 'androidtv-remote' {
  import { EventEmitter } from 'events';

  interface RemoteOptions {
    pairing_port?: number;
    remote_port?: number;
    service_name?: string;
    cert?: { key?: string; cert?: string };
  }

  interface Certificate {
    key: string;
    cert: string;
  }

  export const RemoteKeyCode: Record<string, number>;
  export const RemoteDirection: { SHORT: number; START_LONG: number; END_LONG: number };

  export class AndroidRemote extends EventEmitter {
    constructor(host: string, options: RemoteOptions);
    start(): Promise<boolean | undefined>;
    stop(): void;
    sendCode(code: string): void;
    sendKey(key: number, direction: number): void;
    sendPower(): void;
    sendAppLink(appLink: string): void;
    getCertificate(): Certificate;
  }
}
