declare module '@it-enterprise/digital-signature' {
  export const Models: any;
  export const EUSignCP: any;
  export class DigitalSignature {
    constructor(config: any);
    isJKSContainer(file: File): boolean;
    getJKSPrivateKeys(file: File | Uint8Array): Promise<any[]>;
    setCA(ca: string | null): Promise<void>;
    readFileKey(privateKey: Uint8Array, password: string, certificates?: Uint8Array[] | undefined): Promise<any>;
    signHashEx(data: any): Promise<any>;
  }
}
