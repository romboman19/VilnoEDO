/// <reference path="../types/iit-sdk.d.ts" />

import {
  type DigitalSignature,
  EUSignCP,
  Models,
  type TEndUserKeyMedia,
  type TIitCertificate,
  type TIitOwnerInfo,
  type TKspSettings,
} from '@it-enterprise/digital-signature';

import type { TUaKepCloudSigningMethod } from '../types/signing-methods';
import { createIitSigner } from './iit-signer-factory';

const { DigitalSignatureKeyType } = Models;

type TEndUserConstants = {
  EU_KSP_PB: number;
  EU_KSP_DIIA: number;
  EndUserSignContainerType: {
    CAdES: number;
    PAdES: number;
  };
  EndUserCAdESType: {
    Detached: number;
  };
  EndUserSignType: {
    CAdES_X_Long: number;
  };
  EndUserPAdESSignLevel: {
    B_B: number;
    B_T: number;
    B_LT: number;
    B_LTA: number;
  };
};

type TEndUserSignContainerInfo = {
  type?: number;
  subType?: number;
  signLevel?: number;
};

const EUSign = EUSignCP as {
  EndUserConstants: TEndUserConstants;
  EndUserSignContainerInfo: new () => TEndUserSignContainerInfo;
};

export type TUaKepPreparedPayloadItem = {
  envelopeItemId: string;
  documentDataId: string;
  hashB64: string;
  payloadB64: string;
  ordinal: number;
};

export type TJksKeyEntry = {
  index: number;
  alias: string;
  subjectCN: string | null;
  issuerCN: string | null;
  isStamp: boolean;
};

export type THardwareKeyMedia = {
  index: number;
  visibleName: string;
  type: string;
  device: string;
  keyMedia: TEndUserKeyMedia;
};

export type TSmartIdConfirmationStage = 'read-key' | 'sign' | 'confirm';

export type TSmartIdConfirmationEvent = {
  stage: TSmartIdConfirmationStage;
  qrCode: string | null;
  url: string | null;
  mobileAppName: string | null;
  expireDate: string | null;
};

export type TBrowserSigningResult = {
  items: Array<{
    envelopeItemId: string;
    signatureB64: string;
    padesB64?: string;
  }>;
  padesLevel: 'B_LT' | 'B_T' | null;
  signerInfo: {
    subjCN: string | null;
    issuerCN: string | null;
    edrpou: string | null;
    serial: string | null;
  };
};

export type TUaKepReadKeyInfo = {
  label: string;
  ownerInfo: TBrowserSigningResult['signerInfo'];
  certificateInfo: {
    subjCN: string | null;
    issuerCN: string | null;
    serial: string | null;
  } | null;
  certificatesCount: number;
};

export type TSmartIdProviderConfig = {
  id: TUaKepCloudSigningMethod;
  kspId: string;
  name: string;
  mobileAppName: string | null;
  address: string | null;
  confirmationURL: string | null;
  clientIdPrefix: string | null;
  directAccess: boolean | null;
  needQRCode: boolean | null;
  codeEDRPOU: string | null;
  kspSettings: TKspSettings;
};

const CLOUD_KSP_PROVIDER_META: Record<string, { id: TUaKepCloudSigningMethod; name: string }> = {
  depositsign: { id: 'depositsign', name: 'DepositSign' },
  'diia-sign': { id: 'diia-signature', name: 'Diia.Signature' },
  'pb-smartid': { id: 'privatbank-smartid', name: 'PrivatBank SmartID' },
  vchasno: { id: 'vchasno', name: 'Vchasno cloud signature' },
  vchasnoQR: { id: 'vchasnoQR', name: 'Vchasno cloud signature (QR)' },
  cloudkey: { id: 'cloudkey', name: 'CSK Ukraine CloudKey' },
  esign: { id: 'esign', name: 'ESign cloud signature' },
  smartsigntax: { id: 'smartsigntax', name: 'State Tax Service cloud signature' },
  pumb: { id: 'pumb', name: 'PUMB cloud signature' },
  ugb: { id: 'ugb', name: 'Ukrgasbank EcoSign' },
  alliance: { id: 'alliance', name: 'Bank Alliance cloud signature' },
};

const createFallbackCloudKspSettings = (): TKspSettings[] => {
  const vTokenKsp = Models.EndUserKSP?.VTOKEN ?? -2;
  const nameClientIdType = Models.EndUserKSPClientIdType?.Name ?? 1;
  const namePasswordClientIdType = Models.EndUserKSPClientIdType?.NamePassword ?? -1;

  return [
    {
      id: 'depositsign',
      name: 'DepositSign',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      address: 'https://depositsign.com/api/v1/it-enterprise/sign-server',
      clientIdPrefix: '',
      directAccess: true,
      needQRCode: false,
      codeEDRPOU: '43005049',
    },
    {
      id: 'diia-sign',
      name: 'Diia.Signature',
      ksp: EUSign.EndUserConstants.EU_KSP_DIIA,
      directAccess: false,
      mobileAppName: 'Diia',
      address: 'https://diia-sign.it.ua/KSPSign',
      systemId: 'diia-sign-it-ent',
      needQRCode: true,
      codeEDRPOU: '43395033',
      signAlgos: [1],
    },
    {
      id: 'pb-smartid',
      name: 'PrivatBank SmartID',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      directAccess: true,
      mobileAppName: 'Privat24',
      address: 'https://acsk.privatbank.ua/cloud/api/back/',
      clientIdPrefix: 'IEIS_',
      confirmationURL: 'https://www.privat24.ua/rd/kep',
      needQRCode: true,
      codeEDRPOU: '14360570',
    },
    {
      id: 'vchasno',
      name: 'Vchasno cloud signature',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      address: 'https://cs.vchasno.ua/ss/',
      clientIdPrefix: '',
      directAccess: false,
      needQRCode: false,
      codeEDRPOU: '41231992',
    },
    {
      id: 'vchasnoQR',
      name: 'Vchasno cloud signature (QR)',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      address: 'https://cs.vchasno.ua/ss/',
      clientIdPrefix: 'vchasno_',
      confirmationURL: 'https://cs.vchasno.ua/rd/',
      mobileAppName: 'Vchasno.QES',
      directAccess: false,
      needQRCode: true,
    },
    {
      id: 'cloudkey',
      name: 'CSK Ukraine CloudKey',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      directAccess: true,
      mobileAppName: 'CloudKey',
      address: 'https://sid.uakey.com.ua/smartid/iit/',
      clientIdPrefix: 'DIIA_2',
      confirmationURL: 'https://sid.uakey.com.ua/kep?hash=rd/kep',
      needQRCode: true,
      codeEDRPOU: '36865753',
    },
    {
      id: 'esign',
      name: 'ESign cloud signature',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      address: 'https://cabinet.e-life.com.ua/api/EDG/Sign',
      clientIdPrefix: '',
      directAccess: true,
      needQRCode: false,
      codeEDRPOU: '36049014',
    },
    {
      id: 'smartsigntax',
      name: 'State Tax Service cloud signature',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      address: 'https://smart-sign.tax.gov.ua/',
      port: '443',
      directAccess: true,
      clientIdType: nameClientIdType,
    },
    {
      id: 'pumb',
      name: 'PUMB cloud signature',
      ksp: EUSign.EndUserConstants.EU_KSP_PB,
      address: 'https://apiext.pumb.ua/hogsmeade/striga/v1',
      directAccess: false,
      clientIdPrefix: 'SMARTTENDER_',
      confirmationURL: 'https://www.pumb.ua/qes',
      mobileAppName: '',
    },
    {
      id: 'ugb',
      name: 'Ukrgasbank EcoSign',
      ksp: vTokenKsp,
      address: 'https://vtms-api-qca.ukrgasbank.com/vtco/api/v1',
      systemId: 'cihsmVtcoServiceClientSmartTender',
      directAccess: true,
      clientIdType: namePasswordClientIdType,
    },
    {
      id: 'alliance',
      name: 'Bank Alliance cloud signature',
      ksp: vTokenKsp,
      address: 'https://cihsm-api.bankalliance.ua/vtco/api/v1',
      systemId: 'cihsmVtcoServiceClientSmartTender',
      directAccess: true,
      clientIdType: namePasswordClientIdType,
    },
  ];
};

const createDefaultCloudKspSettings = () => {
  const providersById = new Map<string, TKspSettings>();

  for (const provider of createFallbackCloudKspSettings()) {
    if (provider.id) {
      providersById.set(provider.id, provider);
    }
  }

  const sdkProviders = typeof Models.getDefaultKSPs === 'function' ? Models.getDefaultKSPs(false) : [];

  for (const provider of sdkProviders) {
    if (provider.id) {
      providersById.set(provider.id, provider);
    }
  }

  return Array.from(providersById.values());
};

const normalizeCloudProvider = (kspSettings: TKspSettings): TSmartIdProviderConfig | null => {
  const kspId = typeof kspSettings.id === 'string' ? kspSettings.id : '';
  const meta = CLOUD_KSP_PROVIDER_META[kspId];

  if (!meta) {
    return null;
  }

  return {
    id: meta.id,
    kspId,
    name: meta.name,
    mobileAppName: typeof kspSettings.mobileAppName === 'string' ? kspSettings.mobileAppName : null,
    address: typeof kspSettings.address === 'string' ? kspSettings.address : null,
    confirmationURL: typeof kspSettings.confirmationURL === 'string' ? kspSettings.confirmationURL : null,
    clientIdPrefix: typeof kspSettings.clientIdPrefix === 'string' ? kspSettings.clientIdPrefix : null,
    directAccess: typeof kspSettings.directAccess === 'boolean' ? kspSettings.directAccess : null,
    needQRCode: typeof kspSettings.needQRCode === 'boolean' ? kspSettings.needQRCode : null,
    codeEDRPOU: typeof kspSettings.codeEDRPOU === 'string' ? kspSettings.codeEDRPOU : null,
    kspSettings,
  };
};

export const CLOUD_KSP_PROVIDERS: TSmartIdProviderConfig[] = createDefaultCloudKspSettings()
  .map((provider) => normalizeCloudProvider(provider))
  .filter((provider): provider is TSmartIdProviderConfig => provider !== null);

export const SMART_ID_PROVIDERS = CLOUD_KSP_PROVIDERS;

const getOwnerInfo = (rawOwnerInfo: TIitOwnerInfo | null | undefined) => ({
  subjCN: rawOwnerInfo?.subjCN ?? null,
  issuerCN: rawOwnerInfo?.issuerCN ?? null,
  edrpou: rawOwnerInfo?.EDRPOUCode ?? rawOwnerInfo?.DRFOCode ?? null,
  serial: rawOwnerInfo?.serial ?? null,
});

const getCertificateInfo = (certificates: TIitCertificate[] | null | undefined) => {
  const certificate = certificates?.find((entry) => entry?.infoEx);

  if (!certificate?.infoEx) {
    return null;
  }

  return {
    subjCN: certificate.infoEx.subjCN ?? null,
    issuerCN: certificate.infoEx.issuerCN ?? null,
    serial: certificate.infoEx.serial ?? null,
  };
};

const getFirstCertificateIssuerCN = (certificates: TIitCertificate[] | null | undefined) =>
  certificates?.find((entry) => typeof entry?.infoEx?.issuerCN === 'string' && entry.infoEx.issuerCN.length > 0)?.infoEx
    ?.issuerCN ?? null;

const getKeyMediaLabel = (keyMedia: TEndUserKeyMedia, index: number) => {
  if (typeof keyMedia.visibleName === 'string' && keyMedia.visibleName.length > 0) {
    return keyMedia.visibleName;
  }

  const type = typeof keyMedia.type === 'string' ? keyMedia.type : '';
  const device = typeof keyMedia.device === 'string' ? keyMedia.device : '';
  const name = [type, device].filter(Boolean).join(' - ');

  return name.length > 0 ? name : `Media ${index + 1}`;
};

const base64ToUint8Array = (value: string) => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const createDetachedCadesXLongSignType = () => {
  const signType = new EUSign.EndUserSignContainerInfo();

  signType.type = EUSign.EndUserConstants.EndUserSignContainerType.CAdES;
  signType.subType = EUSign.EndUserConstants.EndUserCAdESType.Detached;
  signType.signLevel = EUSign.EndUserConstants.EndUserSignType.CAdES_X_Long;

  return signType;
};

const createPadesSignType = (level: 'B_LT' | 'B_T') => {
  const signType = new EUSign.EndUserSignContainerInfo();

  signType.type = EUSign.EndUserConstants.EndUserSignContainerType.PAdES;
  signType.signLevel = EUSign.EndUserConstants.EndUserPAdESSignLevel[level];

  return signType;
};

const extractSignatureBase64 = (signature: string | { val?: string; Sign?: string }) => {
  if (typeof signature === 'string') {
    return signature;
  }

  return signature.val ?? signature.Sign ?? '';
};

const getSdkErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown SDK error';
  }
};

/**
 * PAdES embeds the signature inside the PDF itself, so it only applies to PDF
 * payloads. Cloud KSP keys other than Hriada reject PAdES inside the SDK, and
 * some CAs cannot produce the OCSP/TSP evidence B_LT needs — degrade from
 * B_LT to B_T, and to CAdES-only when PAdES is unavailable entirely.
 */
const signPadesWithFallback = async (
  sdk: DigitalSignature,
  pdfBytes: Uint8Array,
  preferredLevel: 'B_LT' | 'B_T',
): Promise<{ padesB64: string; level: 'B_LT' | 'B_T' } | null> => {
  const levels: Array<'B_LT' | 'B_T'> = preferredLevel === 'B_LT' ? ['B_LT', 'B_T'] : ['B_T'];

  for (const level of levels) {
    try {
      const signature = await sdk.signData(pdfBytes, createPadesSignType(level));
      const padesB64 = extractSignatureBase64(signature);

      if (padesB64) {
        return { padesB64, level };
      }
    } catch {
      // Try the next level; callers treat a null result as "PAdES unavailable".
    }
  }

  return null;
};

const isPdfPayload = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

export const createSmartIdKspSettings = (provider: TSmartIdProviderConfig): TKspSettings => provider.kspSettings;

export const createBrowserUaKepSigner = () =>
  createIitSigner({
    kspProviders: CLOUD_KSP_PROVIDERS.map((provider) => createSmartIdKspSettings(provider)),
    preferHardware: false,
  });

export const createBrowserUaKepFileSigner = () =>
  createIitSigner({
    preferHardware: false,
  });

export const createBrowserUaKepHardwareSigner = () =>
  createIitSigner({
    preferHardware: true,
  });

const ensureFileLibraryReady = async (sdk: DigitalSignature) => {
  await sdk.setLibraryType(DigitalSignatureKeyType.File);
  await sdk.getCAs();
};

export const readJksContainer = async (file: File, sdk?: DigitalSignature): Promise<TJksKeyEntry[]> => {
  if (!file.name.toLowerCase().endsWith('.jks')) {
    throw new Error('The key file must be a JKS container with the .jks extension');
  }

  const resolvedSdk = sdk ?? createBrowserUaKepFileSigner().sdk;
  await ensureFileLibraryReady(resolvedSdk);

  if (!resolvedSdk.isJKSContainer(file)) {
    throw new Error('The selected file does not look like a JKS key container');
  }

  const keys = await resolvedSdk.getJKSPrivateKeys(file);

  return keys.map((key, index) => ({
    index,
    alias: key.alias,
    subjectCN: key.certificates?.[0]?.infoEx?.subjCN ?? null,
    issuerCN: key.certificates?.[0]?.infoEx?.issuerCN ?? null,
    isStamp: key.digitalStamp,
  }));
};

export const readJksKey = async ({
  file,
  keyIndex,
  password,
  sdk,
}: {
  file: File;
  keyIndex: number;
  password: string;
  sdk: DigitalSignature;
}) => {
  if (!password) {
    throw new Error('Enter the key password');
  }

  await ensureFileLibraryReady(sdk);

  const keys = await sdk.getJKSPrivateKeys(file);
  const selected = keys[keyIndex];

  if (!selected) {
    throw new Error('Key not found in the JKS container');
  }

  const issuerCN = getFirstCertificateIssuerCN(selected.certificates);

  if (issuerCN) {
    await sdk.setCA(issuerCN);
  }

  const certificates = selected.certificates
    .map((certificate) => certificate.data)
    .filter((certificate): certificate is Uint8Array => certificate instanceof Uint8Array);
  const keyInfo = await sdk.readFileKey(
    selected.privateKey,
    password,
    certificates.length > 0 ? certificates : undefined,
  );
  const keyCertificates = keyInfo.certificates ?? selected.certificates;

  return {
    ownerInfo: getOwnerInfo(keyInfo.ownerInfo),
    certificateInfo: getCertificateInfo(keyCertificates),
    certificatesCount: keyCertificates.length,
    label: selected.alias || issuerCN || file.name,
  };
};

export const listHardwareKeyMedias = async (): Promise<THardwareKeyMedia[]> => {
  const { sdk } = createBrowserUaKepHardwareSigner();
  await sdk.setLibraryType(DigitalSignatureKeyType.Token);

  const keyMedias = await sdk.getKeyMedias();

  return keyMedias.map((keyMedia, index) => ({
    index,
    visibleName: getKeyMediaLabel(keyMedia, index),
    type: typeof keyMedia.type === 'string' ? keyMedia.type : '',
    device: typeof keyMedia.device === 'string' ? keyMedia.device : '',
    keyMedia,
  }));
};

export const readHardwareKey = async ({
  keyMedia,
  password,
  sdk,
}: {
  keyMedia: TEndUserKeyMedia;
  password: string;
  sdk: DigitalSignature;
}) => {
  if (!password) {
    throw new Error('Enter the hardware key PIN');
  }

  await sdk.setLibraryType(DigitalSignatureKeyType.Token);
  await sdk.setCA(null);

  const keyInfo = await sdk.readHardwareKey({ ...keyMedia, password });
  const keyCertificates = keyInfo.certificates ?? [];

  return {
    ownerInfo: getOwnerInfo(keyInfo.ownerInfo),
    certificateInfo: getCertificateInfo(keyCertificates),
    certificatesCount: keyCertificates.length,
    label: getKeyMediaLabel(keyMedia, 0),
  };
};

export const addSmartIdConfirmationListener = async ({
  getStage,
  onConfirm,
  provider,
  sdk,
}: {
  getStage: () => TSmartIdConfirmationStage;
  onConfirm: (event: TSmartIdConfirmationEvent) => void;
  provider: TSmartIdProviderConfig;
  sdk: DigitalSignature;
}) => {
  await sdk.setLibraryType(DigitalSignatureKeyType.KSP);

  await sdk.addConfirmKSPOperationEventListener((event: Record<string, unknown>) => {
    const qrCode = typeof event.qrCode === 'string' && event.qrCode.length > 0 ? event.qrCode : null;
    const urlCandidates = [event.url, event.confirmationURL, event.confirmationUrl, event.link, event.href];
    const url = urlCandidates.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
    const mobileAppName =
      typeof event.mobileAppName === 'string' && event.mobileAppName.length > 0
        ? event.mobileAppName
        : provider.mobileAppName;
    const expireDate = typeof event.expireDate === 'string' && event.expireDate.length > 0 ? event.expireDate : null;

    onConfirm({
      stage: getStage(),
      qrCode,
      url,
      mobileAppName,
      expireDate,
    });
  });
};

export const readSmartIdKey = async ({
  provider,
  sdk,
}: {
  provider: TSmartIdProviderConfig;
  sdk: DigitalSignature;
}) => {
  await sdk.setLibraryType(DigitalSignatureKeyType.KSP);

  const keyInfo = await sdk.readPrivateKeyKSP(createSmartIdKspSettings(provider), null, true);
  const keyCertificates = keyInfo.certificates ?? [];

  return {
    ownerInfo: getOwnerInfo(keyInfo.ownerInfo),
    certificateInfo: getCertificateInfo(keyCertificates),
    certificatesCount: keyCertificates.length,
    label: provider.name,
  };
};

export const signPreparedPayloads = async (
  sdk: DigitalSignature,
  items: TUaKepPreparedPayloadItem[],
  fallbackSignerInfo?: TBrowserSigningResult['signerInfo'],
  options: { signPreparedHash?: boolean; tryPades?: boolean } = {},
): Promise<TBrowserSigningResult> => {
  if (items.length === 0) {
    throw new Error('There are no prepared documents to sign');
  }

  // PAdES is only produced for local file/hardware keys. Cloud KSP providers
  // (except Hriada) reject PAdES inside the SDK, so attempting it there just
  // wastes a round-trip and can leave the worker in an error state.
  const signPreparedHash = options.signPreparedHash ?? false;
  const tryPades = options.tryPades ?? true;
  const signType = createDetachedCadesXLongSignType();
  const signatures: TBrowserSigningResult['items'] = [];
  let signerInfo: TBrowserSigningResult['signerInfo'] | null = null;
  let padesLevel: TBrowserSigningResult['padesLevel'] = null;
  let padesUnavailable = false;

  for (const item of items) {
    const payloadBytes = base64ToUint8Array(item.payloadB64);

    let signature: Awaited<ReturnType<DigitalSignature['signData']>>;

    try {
      signature = signPreparedHash ? await sdk.signHash(item.hashB64) : await sdk.signData(payloadBytes, signType);
    } catch (error) {
      // Surface the failing step so cloud-vs-file issues are distinguishable.
      throw new Error(`Failed to create the detached CAdES signature: ${getSdkErrorMessage(error)}`);
    }

    const signatureB64 = extractSignatureBase64(signature);

    if (!signatureB64) {
      throw new Error('SDK did not return a detached CAdES signature');
    }

    signerInfo = signerInfo ?? fallbackSignerInfo ?? getOwnerInfo(null);

    let padesB64: string | undefined;

    if (tryPades && !padesUnavailable && isPdfPayload(payloadBytes)) {
      const pades = await signPadesWithFallback(sdk, payloadBytes, padesLevel === 'B_T' ? 'B_T' : 'B_LT');

      if (pades) {
        padesB64 = pades.padesB64;
        padesLevel = pades.level;
      } else {
        padesUnavailable = true;
      }
    }

    signatures.push({
      envelopeItemId: item.envelopeItemId,
      signatureB64,
      ...(padesB64 ? { padesB64 } : {}),
    });
  }

  return {
    items: signatures,
    padesLevel,
    signerInfo: signerInfo ?? fallbackSignerInfo ?? getOwnerInfo(null),
  };
};
