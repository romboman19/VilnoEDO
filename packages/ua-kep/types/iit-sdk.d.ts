declare module '@it-enterprise/digital-signature' {
  export type TEndUserKeyMedia = {
    type?: string;
    device?: string;
    visibleName?: string;
    typeIndex?: number;
    devIndex?: number;
    password?: string;
    user?: string;
  };

  export type TKspSettings = {
    id?: string;
    name?: string;
    ksp?: number;
    address?: string;
    port?: string;
    clientIdPrefix?: string;
    confirmationURL?: string;
    mobileAppName?: string;
    directAccess?: boolean;
    needQRCode?: boolean;
    systemId?: string;
    codeEDRPOU?: string;
    clientIdType?: number;
    signAlgos?: number[];
  };

  export type TKspKeyMediasResponse = {
    token?: string;
    isTwoFactor?: boolean;
    keys?: Array<Record<string, unknown>>;
  };

  export type TIitOwnerInfo = {
    subjCN?: string | null;
    issuerCN?: string | null;
    EDRPOUCode?: string | null;
    DRFOCode?: string | null;
    serial?: string | null;
  };

  export type TIitCertificate = {
    data?: Uint8Array;
    infoEx?: {
      subjCN?: string | null;
      issuerCN?: string | null;
      serial?: string | null;
      publicKeyType?: number;
      keyUsageType?: number;
      extKeyUsages?: string[];
      certHashType?: number;
    };
  };

  export type TJksPrivateKeyInfo = {
    alias: string;
    privateKey: Uint8Array;
    certificates: TIitCertificate[];
    digitalStamp: boolean;
  };

  export type TPrivateKeyInfo = {
    ownerInfo?: TIitOwnerInfo | null;
    certificates?: TIitCertificate[];
  };

  export type TIitSignDataResult = {
    Sign?: string;
    SignatureInfo?: {
      OwnerInfo?: TIitOwnerInfo | null;
    };
  };

  export const Models: {
    DigitalSignatureKeyType: {
      File: unknown;
      Token: unknown;
      KSP: unknown;
    };
    DigitalSignatureSettings: new (
      language: string,
      userId: string,
      httpProxyServiceURL: string,
      certificatesProvider: unknown,
      libraryUrl: string,
    ) => unknown;
    DefaultCertificatesProvider: new (casJsonUrl: string, caCertsUrl: string) => unknown;
    KSPUserAuthData: new (userName: string, password: string) => unknown;
    KSPPrivateKeyAuthData: new (pin: string, token: string, twoFactorCode: string) => unknown;
    EndUserKSP?: {
      VTOKEN?: number;
    };
    EndUserKSPClientIdType?: {
      Name?: number;
      NamePassword?: number;
    };
    getDefaultKSPs?: (allowTest: boolean) => TKspSettings[];
  };
  export const EUSignCP: {
    EndUserConstants: {
      EU_KSP_PB: number;
      EU_KSP_DIIA: number;
      EndUserSignContainerType: {
        CAdES: number;
      };
      EndUserCAdESType: {
        Detached: number;
      };
      EndUserSignType: {
        CAdES_X_Long: number;
      };
    };
    EndUserSignContainerInfo: new () => {
      type?: number;
      subType?: number;
      signLevel?: number;
    };
  };
  export class DigitalSignature {
    constructor(config: unknown);
    readonly KSPs: TKspSettings[];
    getCAs(): Promise<Array<Record<string, unknown>>>;
    isJKSContainer(file: File): boolean;
    getKeyMedias(): Promise<TEndUserKeyMedia[]>;
    getJKSPrivateKeys(file: File | Uint8Array): Promise<TJksPrivateKeyInfo[]>;
    setLibraryType(libraryType: unknown): Promise<void>;
    setCA(ca: string | null): Promise<void>;
    resetPrivateKey(): Promise<void>;
    resetKSPOperation(): Promise<void>;
    readFileKey(
      privateKey: Uint8Array,
      password: string,
      certificates?: Uint8Array[] | undefined,
    ): Promise<TPrivateKeyInfo>;
    readHardwareKey(keyMedia: TEndUserKeyMedia, certificates?: Uint8Array[] | undefined): Promise<TPrivateKeyInfo>;
    readPrivateKeyDiia(getCerts?: boolean): Promise<TPrivateKeyInfo>;
    readPrivateKeyKSP(
      ksp: TKspSettings,
      userId?: string | null,
      getCerts?: boolean,
      keyId?: string,
      authData?: unknown,
    ): Promise<TPrivateKeyInfo>;
    getKeyMediasKSP(kspSettings: TKspSettings, authData: unknown): Promise<TKspKeyMediasResponse>;
    setTwoFactorCodeKSP(code: string): Promise<unknown>;
    addConfirmKSPOperationEventListener(event: (data: Record<string, unknown>) => void): Promise<void>;
    signData(data: Uint8Array, signType: unknown): Promise<string | { val?: string; Sign?: string }>;
    signDataEx(data: Uint8Array, signType: unknown): Promise<TIitSignDataResult>;
    signHash(hash: Uint8Array | string, asByteArray?: boolean): Promise<string | { val?: string; Sign?: string }>;
  }
}
