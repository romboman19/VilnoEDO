import { Button } from '@documenso/ui/primitives/button';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import type { SignaturePadExternalTab } from '@documenso/ui/primitives/signature-pad/signature-pad';
import { Trans } from '@lingui/react/macro';
import { type TUaKepSigningStatus, useUaKepSigning } from '@vilnoedo/ua-kep/client/hooks/use-ua-kep-signing';
import type {
  THardwareKeyMedia,
  TJksKeyEntry,
  TSmartIdConfirmationEvent,
  TSmartIdConfirmationStage,
  TSmartIdProviderConfig,
  TUaKepPreparedPayloadItem,
  TUaKepReadKeyInfo,
} from '@vilnoedo/ua-kep/client/internal-signing-service';
import type { TUaKepCloudSigningMethod, TUaKepSigningMethod } from '@vilnoedo/ua-kep/types/signing-methods';
import { KeyRoundIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const UA_KEP_SIGNATURE_TAB_VALUE = 'ua-kep';

const loadBrowserSigningService = async () => import('@vilnoedo/ua-kep/client/internal-signing-service');

type BrowserSigningService = Awaited<ReturnType<typeof loadBrowserSigningService>>;
type IitSdk = ReturnType<BrowserSigningService['createBrowserUaKepSigner']>['sdk'];

export type UaKepSigningContext = {
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
};

type UaKepSignatureTabProps = UaKepSigningContext & {
  onSignatureComplete: (value: string) => void;
  onSignatureApply?: (value: string) => void | Promise<void>;
};

type UaKepSigningMode = 'file-key' | 'hardware-key' | 'cloud';
type UaKepCloudSigningProvider = TUaKepCloudSigningMethod;

const DEFAULT_CLOUD_PROVIDER: UaKepCloudSigningProvider = 'privatbank-smartid';

const SIGNING_MODE_LABELS: Record<UaKepSigningMode, string> = {
  'file-key': 'File',
  'hardware-key': 'Hardware',
  cloud: 'Cloud',
};

const SIGNING_METHOD_DISPLAY_LABELS: Record<TUaKepSigningMethod, string> = {
  'file-key': 'File QES/AES key',
  'iit-token': 'Hardware QES/AES key',
  'privatbank-smartid': 'Cloud signature PrivatBank SmartID',
  'diia-signature': 'Cloud signature Diia.Signature',
  depositsign: 'Cloud signature DepositSign',
  vchasno: 'Cloud signature Vchasno',
  vchasnoQR: 'Cloud signature Vchasno (QR)',
  cloudkey: 'Cloud signature CloudKey',
  esign: 'Cloud signature ESign',
  smartsigntax: 'Cloud signature State Tax Service',
  pumb: 'Cloud signature PUMB',
  ugb: 'Cloud signature Ukrgasbank EcoSign',
  alliance: 'Cloud signature Bank Alliance',
};

type UaKepEvidenceManifestSignerInfo = {
  subjCN?: string | null;
  issuerCN?: string | null;
  edrpou?: string | null;
  EDRPOUCode?: string | null;
  DRFOCode?: string | null;
  serial?: string | null;
  certSubjectCn?: string | null;
  cryptoSignerCn?: string | null;
};

type UaKepEvidenceManifest = {
  signingMethod?: string | null;
  signingTime?: string | null;
  signedAt?: string | null;
  artifacts?: Array<{
    signingMethod?: string | null;
    signerInfo?: UaKepEvidenceManifestSignerInfo | null;
    verificationStatus?: string | null;
  }>;
  validationReports?: Array<{
    checkedAt?: string | null;
    signerInfo?: UaKepEvidenceManifestSignerInfo | null;
  }>;
};

type UaKepEvidenceManifestResponse = {
  packageSha256?: string | null;
  manifest?: UaKepEvidenceManifest | null;
};

type UaKepSignatureDisplayInfo = {
  manifestSha256: string | null;
  signedAt: string | null;
  signerName: string | null;
  signingMethodLabel: string;
};

const getSigningMethod = ({
  cloudProvider,
  signingMode,
}: {
  cloudProvider: UaKepCloudSigningProvider;
  signingMode: UaKepSigningMode;
}): TUaKepSigningMethod => {
  if (signingMode === 'cloud') {
    return cloudProvider;
  }

  if (signingMode === 'hardware-key') {
    return 'iit-token';
  }

  return 'file-key';
};

const getSignerCommonName = (signerInfo: Record<string, unknown> | null | undefined) =>
  typeof signerInfo?.subjCN === 'string' && signerInfo.subjCN.length > 0 ? signerInfo.subjCN : null;

const getManifestSignerCommonName = (signerInfo: UaKepEvidenceManifestSignerInfo | null | undefined) => {
  const candidates = [signerInfo?.subjCN, signerInfo?.cryptoSignerCn, signerInfo?.certSubjectCn];

  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
};

const getSigningMethodDisplayLabel = (signingMethod: string | null | undefined) => {
  if (signingMethod && signingMethod in SIGNING_METHOD_DISPLAY_LABELS) {
    return SIGNING_METHOD_DISPLAY_LABELS[signingMethod as TUaKepSigningMethod];
  }

  return 'QES/AES';
};

const getDisplayInfoFromManifest = ({
  manifestResponse,
  status,
}: {
  manifestResponse: UaKepEvidenceManifestResponse | null;
  status: TUaKepSigningStatus;
}): UaKepSignatureDisplayInfo => {
  const manifest = manifestResponse?.manifest ?? null;
  const firstArtifact = manifest?.artifacts?.[0] ?? null;
  const firstValidationReport = manifest?.validationReports?.[0] ?? null;
  const manifestSignerInfo = firstValidationReport?.signerInfo ?? firstArtifact?.signerInfo ?? null;
  const manifestSigningMethod = manifest?.signingMethod ?? firstArtifact?.signingMethod ?? status.signingMethod;

  return {
    manifestSha256: manifestResponse?.packageSha256 ?? status.evidencePackage?.packageSha256 ?? null,
    signedAt: manifest?.signedAt ?? manifest?.signingTime ?? status.signedAt,
    signerName: getManifestSignerCommonName(manifestSignerInfo) ?? getSignerCommonName(status.signerInfo),
    signingMethodLabel: getSigningMethodDisplayLabel(manifestSigningMethod),
  };
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return new Date().toLocaleString('en-US');
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-US');
};

const createUaKepSignatureImage = ({
  manifestSha256,
  signedAt,
  signerName,
  signingMethodLabel,
}: UaKepSignatureDisplayInfo) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1040;
  canvas.height = 340;

  const context = canvas.getContext('2d');

  if (!context) {
    return '';
  }

  const signedAtText = formatDateTime(signedAt);
  const displaySignerName = signerName ?? 'Signer defined by the signature manifest';

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#65a30d';
  context.lineWidth = 6;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  context.fillStyle = '#1f2937';
  context.font = '700 42px Arial, sans-serif';
  context.fillText('QES/AES', 44, 72);

  context.font = '600 30px Arial, sans-serif';
  context.fillText(`Signer: ${displaySignerName}`, 44, 128, 952);

  context.fillStyle = '#4b5563';
  context.font = '25px Arial, sans-serif';
  context.fillText(`Signing time: ${signedAtText}`, 44, 184, 952);
  context.fillText(`Signed with: ${signingMethodLabel}`, 44, 232, 952);

  if (manifestSha256) {
    context.font = '20px Arial, sans-serif';
    context.fillText(`Manifest: ${manifestSha256.slice(0, 24)}`, 44, 284, 952);
  }

  return canvas.toDataURL('image/png');
};

const getSmartIdConfirmationText = (stage: TSmartIdConfirmationStage) => {
  if (stage === 'sign') {
    return 'Confirm the signature in the provider app';
  }

  if (stage === 'read-key') {
    return 'Confirm key reading in the provider app';
  }

  return 'Confirm the operation in the provider app';
};

const getSmartIdProvider = (
  service: BrowserSigningService,
  providerId: UaKepCloudSigningProvider,
): TSmartIdProviderConfig | null => service.CLOUD_KSP_PROVIDERS.find((provider) => provider.id === providerId) ?? null;

const toOptionalSignerInfo = (signerInfo: {
  subjCN: string | null;
  issuerCN: string | null;
  edrpou: string | null;
  serial: string | null;
}) => ({
  ...(signerInfo.subjCN ? { subjCN: signerInfo.subjCN } : {}),
  ...(signerInfo.issuerCN ? { issuerCN: signerInfo.issuerCN } : {}),
  ...(signerInfo.edrpou ? { edrpou: signerInfo.edrpou } : {}),
  ...(signerInfo.serial ? { serial: signerInfo.serial } : {}),
});

type UaKepKeyStatus = {
  message: string;
  tone: 'neutral' | 'success' | 'warning';
};

const getDisplayValue = (value: string | null | undefined) => (value && value.length > 0 ? value : '—');

const getJksEntrySignerLabel = (entry: TJksKeyEntry | null | undefined) => entry?.subjectCN ?? entry?.alias ?? '—';

const getJksEntryIssuerLabel = (entry: TJksKeyEntry | null | undefined) => entry?.issuerCN ?? '—';

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const errorObject = error as Record<string, unknown>;
    const message = [errorObject.message, errorObject.Message, errorObject.reason, errorObject.details].find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    const code = [errorObject.code, errorObject.errorCode, errorObject.id].find(
      (value): value is string | number => typeof value === 'string' || typeof value === 'number',
    );
    const codeSuffix = code === undefined ? '' : ` (SDK code: ${code})`;

    if (message) {
      return `${message}${codeSuffix}`;
    }

    if (Array.isArray(errorObject.urls) && errorObject.urls.length > 0) {
      return `${fallback}${codeSuffix}. SDK returned a manual action link.`;
    }

    if (code !== undefined) {
      return `${fallback}. SDK code: ${code}`;
    }

    try {
      const serialized = JSON.stringify(errorObject);

      if (serialized && serialized !== '{}') {
        return `${fallback}: ${serialized.slice(0, 300)}`;
      }
    } catch {
      return fallback;
    }
  }

  return fallback;
};

const UaKepReadKeyInfoCard = ({ keyInfo, methodLabel }: { keyInfo: TUaKepReadKeyInfo; methodLabel: string }) => {
  const signerName = keyInfo.ownerInfo.subjCN ?? keyInfo.certificateInfo?.subjCN ?? null;
  const issuer = keyInfo.ownerInfo.issuerCN ?? keyInfo.certificateInfo?.issuerCN ?? null;
  const serial = keyInfo.certificateInfo?.serial ?? keyInfo.ownerInfo.serial ?? null;

  return (
    <div className="rounded-md border border-green-300 bg-green-50 p-3 text-green-950 text-sm">
      <p className="font-medium">
        <Trans>Key read</Trans>
      </p>

      <dl className="mt-2 grid gap-1">
        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <dt className="text-green-800">
            <Trans>Method</Trans>
          </dt>
          <dd className="font-medium">{methodLabel}</dd>
        </div>

        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <dt className="text-green-800">
            <Trans>Signer</Trans>
          </dt>
          <dd className="font-medium">{getDisplayValue(signerName)}</dd>
        </div>

        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <dt className="text-green-800">
            <Trans>CA / QTSP</Trans>
          </dt>
          <dd>{getDisplayValue(issuer)}</dd>
        </div>

        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <dt className="text-green-800">
            <Trans>EDRPOU / Tax ID</Trans>
          </dt>
          <dd>{getDisplayValue(keyInfo.ownerInfo.edrpou)}</dd>
        </div>

        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <dt className="text-green-800">
            <Trans>Serial number</Trans>
          </dt>
          <dd>{getDisplayValue(serial)}</dd>
        </div>

        <div className="grid gap-1 sm:grid-cols-[150px_1fr]">
          <dt className="text-green-800">Alias</dt>
          <dd>{getDisplayValue(keyInfo.label)}</dd>
        </div>
      </dl>
    </div>
  );
};

const UaKepKeyStatusMessage = ({ status }: { status: UaKepKeyStatus }) => {
  const className =
    status.tone === 'success'
      ? 'border-green-300 bg-green-50 text-green-950'
      : status.tone === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-950'
        : 'border-blue-200 bg-blue-50 text-blue-950';

  return <div className={`rounded-md border p-3 text-sm ${className}`}>{status.message}</div>;
};

const UaKepSigningResult = ({
  getEvidenceUrl,
  onUseSignature,
  status,
}: {
  getEvidenceUrl: (evidencePackageId: string, kind: 'manifest' | 'archive' | 'pades') => string;
  onUseSignature: () => void | Promise<void>;
  status: TUaKepSigningStatus;
}) => {
  const signerCn = getSignerCommonName(status.signerInfo);
  const evidencePackageId = status.evidencePackage?.id ?? null;
  const hasPades = status.items.some((item) => item.artifactType.startsWith('PADES'));

  return (
    <div className="space-y-3 rounded-md border border-green-200 bg-green-50 p-3 text-green-950 text-sm">
      <div>
        <p className="font-medium">
          <Trans>Document signed with QES/AES</Trans>
        </p>
        {signerCn ? <p>{signerCn}</p> : null}
        {status.signedAt ? <p>{new Date(status.signedAt).toLocaleString('en-US')}</p> : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void onUseSignature()}>
          <Trans>Use signature</Trans>
        </Button>

        {evidencePackageId && hasPades ? (
          <Button type="button" size="sm" variant="secondary" asChild>
            <a href={getEvidenceUrl(evidencePackageId, 'pades')} download>
              <Trans>Signed PDF (PAdES)</Trans>
            </a>
          </Button>
        ) : null}

        {evidencePackageId ? (
          <Button type="button" size="sm" variant="secondary" asChild>
            <a href={getEvidenceUrl(evidencePackageId, 'archive')} download>
              <Trans>Download archive</Trans>
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const UaKepSignatureTab = ({
  envelopeId,
  onSignatureApply,
  onSignatureComplete,
  recipientId,
  recipientToken,
}: UaKepSignatureTabProps) => {
  const cloudClientSignerRef = useRef<IitSdk | null>(null);
  const fileClientSignerRef = useRef<IitSdk | null>(null);
  const hardwareClientSignerRef = useRef<IitSdk | null>(null);
  const smartIdListenerRegisteredRef = useRef(false);
  const smartIdStageRef = useRef<TSmartIdConfirmationStage>('read-key');
  const [cloudConfirmation, setCloudConfirmation] = useState<TSmartIdConfirmationEvent | null>(null);
  const [cloudProvider, setCloudProvider] = useState<UaKepCloudSigningProvider>(DEFAULT_CLOUD_PROVIDER);
  const [cloudProviders, setCloudProviders] = useState<TSmartIdProviderConfig[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [hardwareMedias, setHardwareMedias] = useState<THardwareKeyMedia[]>([]);
  const [hardwarePassword, setHardwarePassword] = useState('');
  const [isLoadingHardwareMedias, setIsLoadingHardwareMedias] = useState(false);
  const [isSigningWithClientKey, setIsSigningWithClientKey] = useState(false);
  const [jksEntries, setJksEntries] = useState<TJksKeyEntry[]>([]);
  const [keyStatus, setKeyStatus] = useState<UaKepKeyStatus | null>(null);
  const [password, setPassword] = useState('');
  const [prepareState, setPrepareState] = useState('');
  const [preparedItems, setPreparedItems] = useState<TUaKepPreparedPayloadItem[]>([]);
  const [readKeyInfo, setReadKeyInfo] = useState<TUaKepReadKeyInfo | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedHardwareMediaIndex, setSelectedHardwareMediaIndex] = useState(0);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [signingMode, setSigningMode] = useState<UaKepSigningMode>('file-key');
  const [signingStatus, setSigningStatus] = useState<TUaKepSigningStatus | null>(null);

  const signingMethod = getSigningMethod({ cloudProvider, signingMode });

  const { complete, fetchStatus, getEvidenceUrl, isCompleting, isPreparing, prepare } = useUaKepSigning({
    envelopeId,
    recipientId,
    recipientToken,
    signingMethod,
  });

  useEffect(() => {
    let isMounted = true;

    void loadBrowserSigningService().then((service) => {
      if (!isMounted) {
        return;
      }

      const providers = service.CLOUD_KSP_PROVIDERS;

      setCloudProviders(providers);

      if (providers.length > 0 && !providers.some((provider) => provider.id === cloudProvider)) {
        setCloudProvider(providers[0].id);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [cloudProvider]);

  const getCloudClientSigner = (service: BrowserSigningService) => {
    if (!cloudClientSignerRef.current) {
      cloudClientSignerRef.current = service.createBrowserUaKepSigner().sdk;
      smartIdListenerRegisteredRef.current = false;
    }

    return cloudClientSignerRef.current;
  };

  const getFileClientSigner = (service: BrowserSigningService) => {
    if (!fileClientSignerRef.current) {
      fileClientSignerRef.current = service.createBrowserUaKepFileSigner().sdk;
    }

    return fileClientSignerRef.current;
  };

  const getHardwareClientSigner = (service: BrowserSigningService) => {
    if (!hardwareClientSignerRef.current) {
      hardwareClientSignerRef.current = service.createBrowserUaKepHardwareSigner().sdk;
    }

    return hardwareClientSignerRef.current;
  };

  const getReadKeyClientSigner = () => {
    if (signingMode === 'cloud') {
      return cloudClientSignerRef.current;
    }

    if (signingMode === 'hardware-key') {
      return hardwareClientSignerRef.current;
    }

    return fileClientSignerRef.current;
  };

  const resetReadKeyState = () => {
    cloudClientSignerRef.current = null;
    fileClientSignerRef.current = null;
    hardwareClientSignerRef.current = null;
    smartIdListenerRegisteredRef.current = false;
    smartIdStageRef.current = 'read-key';
    setCloudConfirmation(null);
    setKeyStatus(null);
    setReadKeyInfo(null);
  };

  const fetchEvidenceManifest = useCallback(
    async (status: TUaKepSigningStatus): Promise<UaKepEvidenceManifestResponse | null> => {
      const evidencePackageId = status.evidencePackage?.id;

      if (!evidencePackageId) {
        return null;
      }

      try {
        const response = await fetch(getEvidenceUrl(evidencePackageId, 'manifest'), {
          cache: 'no-store',
        });

        if (!response.ok) {
          return null;
        }

        return (await response.json()) as UaKepEvidenceManifestResponse;
      } catch {
        return null;
      }
    },
    [getEvidenceUrl],
  );

  const applySignatureFromStatus = useCallback(
    async (status: TUaKepSigningStatus) => {
      const manifestResponse = await fetchEvidenceManifest(status);
      const signatureImage = createUaKepSignatureImage(
        getDisplayInfoFromManifest({
          manifestResponse,
          status,
        }),
      );

      if (signatureImage) {
        onSignatureComplete(signatureImage);
      }

      return signatureImage;
    },
    [fetchEvidenceManifest, onSignatureComplete],
  );

  useEffect(() => {
    fetchStatus()
      .then((status) => {
        setSigningStatus(status);

        if (status.sessionStatus === 'signed') {
          void applySignatureFromStatus(status);
        }
      })
      .catch(() => {
        // A missing UA KEP session is expected before the recipient signs.
      });
  }, [applySignatureFromStatus, fetchStatus]);

  const resetPendingSigningState = () => {
    setCloudConfirmation(null);
    setErrorMessage('');
    setPreparedItems([]);
    setPrepareState('');
  };

  const onSigningModeChange = (value: string) => {
    setSigningMode(value as UaKepSigningMode);
    resetPendingSigningState();
    resetReadKeyState();
  };

  const onCloudProviderChange = (value: string) => {
    setCloudProvider(value as UaKepCloudSigningProvider);
    resetPendingSigningState();
    resetReadKeyState();
  };

  const onFileSelected = async (file: File | null) => {
    resetReadKeyState();

    if (!file) {
      setSelectedFile(null);
      setSelectedFileName('');
      setJksEntries([]);
      return;
    }

    setErrorMessage('');
    setPrepareState('');
    setSelectedFile(file);
    setSelectedFileName(file.name);
    setJksEntries([]);
    setSelectedKeyIndex(0);
    setKeyStatus({
      tone: 'neutral',
      message: 'Key file selected. Enter the password and click "Read key".',
    });

    try {
      const service = await loadBrowserSigningService();
      const sdk = getFileClientSigner(service);
      const entries = await service.readJksContainer(file, sdk);

      setJksEntries(entries);

      if (entries.length === 0) {
        setKeyStatus({
          tone: 'warning',
          message: 'JKS container recognized, but no private keys were found.',
        });
      } else {
        const firstEntry = entries[0];

        setKeyStatus({
          tone: 'success',
          message: `JKS container recognized. Keys inside: ${entries.length}. Signer: ${getJksEntrySignerLabel(
            firstEntry,
          )}. QTSP/CA: ${getJksEntryIssuerLabel(firstEntry)}.`,
        });
      }
    } catch (error) {
      fileClientSignerRef.current = null;
      setJksEntries([]);
      setKeyStatus({
        tone: 'warning',
        message: `Key file selected, but the key list has not been read yet: ${getErrorMessage(
          error,
          'unknown error',
        )}`,
      });
    }
  };

  const onPrepare = async () => {
    setErrorMessage('');

    try {
      const prepared = await prepare();
      const items = (prepared.items ?? []) as TUaKepPreparedPayloadItem[];

      setPreparedItems(items);
      setPrepareState(`Prepared documents: ${items.length}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to prepare the signature'));
    }
  };

  const completeBrowserSigning = async ({ beforeSign }: { beforeSign?: () => void } = {}) => {
    setErrorMessage('');
    setIsSigningWithClientKey(true);

    try {
      const sdk = getReadKeyClientSigner();

      if (!sdk || !readKeyInfo) {
        throw new Error('Read a key using the selected signing method first');
      }

      // Auto-prepare if the recipient hasn't clicked "Prepare" (or a mode
      // change reset the prepared session) — a read key is all the UI requires.
      let items = preparedItems;

      if (items.length === 0) {
        const prepared = await prepare();
        items = (prepared.items ?? []) as TUaKepPreparedPayloadItem[];
        setPreparedItems(items);
        setPrepareState(`Prepared documents: ${items.length}`);
      }

      if (items.length === 0) {
        throw new Error('No documents are available for signing in this envelope');
      }

      if (items.some((item) => !item.payloadB64)) {
        throw new Error('The server did not return a document payload for local signing');
      }

      const service = await loadBrowserSigningService();

      beforeSign?.();

      // Cloud KSP keys cannot produce PAdES in the SDK — only attempt the
      // embedded-PDF signature for local file/hardware keys.
      const signed = await service.signPreparedPayloads(sdk, items, readKeyInfo.ownerInfo, {
        tryPades: signingMode !== 'cloud',
      });

      await complete({
        completeDocument: false,
        signerInfo: toOptionalSignerInfo(signed.signerInfo),
        signatures: signed.items,
        padesLevel: signed.padesLevel,
      });

      setCloudConfirmation(null);
      setPreparedItems([]);
      setPrepareState('');
      setReadKeyInfo(null);
      setKeyStatus(null);
      cloudClientSignerRef.current = null;
      fileClientSignerRef.current = null;
      hardwareClientSignerRef.current = null;
      smartIdListenerRegisteredRef.current = false;

      const status = await fetchStatus();
      setSigningStatus(status);
      const signatureImage = await applySignatureFromStatus(status);

      if (signatureImage) {
        await onSignatureApply?.(signatureImage);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to complete signing'));
    } finally {
      setIsSigningWithClientKey(false);
    }
  };

  const onReadFileKey = async () => {
    if (!selectedFile) {
      setErrorMessage('Select a key file first');
      return;
    }

    setErrorMessage('');
    setIsSigningWithClientKey(true);

    try {
      const service = await loadBrowserSigningService();
      const sdk = getFileClientSigner(service);
      const keyInfo = await service.readJksKey({
        file: selectedFile,
        keyIndex: selectedKeyIndex,
        password,
        sdk,
      });

      setPassword('');
      setReadKeyInfo(keyInfo);
      setKeyStatus({
        tone: 'success',
        message: `File key read: ${keyInfo.ownerInfo.subjCN ?? keyInfo.label}.`,
      });
    } catch (error) {
      setReadKeyInfo(null);
      setErrorMessage(getErrorMessage(error, 'Failed to read the file key'));
    } finally {
      setIsSigningWithClientKey(false);
    }
  };

  const onCompleteFileKey = async () => {
    await completeBrowserSigning();
  };

  const onLoadHardwareMedias = async () => {
    setErrorMessage('');
    setIsLoadingHardwareMedias(true);

    try {
      const service = await loadBrowserSigningService();
      const medias = await service.listHardwareKeyMedias();

      setHardwareMedias(medias);
      setSelectedHardwareMediaIndex(0);

      if (medias.length === 0) {
        setErrorMessage('No connected hardware media found');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Failed to read hardware media'));
    } finally {
      setIsLoadingHardwareMedias(false);
    }
  };

  const onCompleteHardwareKey = async () => {
    const media = hardwareMedias[selectedHardwareMediaIndex];

    if (!media) {
      setErrorMessage('Select a hardware media first');
      return;
    }

    await completeBrowserSigning();
  };

  const onReadHardwareKey = async () => {
    const media = hardwareMedias[selectedHardwareMediaIndex];

    if (!media) {
      setErrorMessage('Select a hardware media first');
      return;
    }

    setErrorMessage('');
    setIsSigningWithClientKey(true);

    try {
      const service = await loadBrowserSigningService();
      const sdk = getHardwareClientSigner(service);
      const keyInfo = await service.readHardwareKey({
        keyMedia: media.keyMedia,
        password: hardwarePassword,
        sdk,
      });

      setHardwarePassword('');
      setReadKeyInfo(keyInfo);
      setKeyStatus({
        tone: 'success',
        message: `Hardware key read: ${keyInfo.ownerInfo.subjCN ?? keyInfo.label}.`,
      });
    } catch (error) {
      setReadKeyInfo(null);
      setErrorMessage(getErrorMessage(error, 'Failed to read the hardware key'));
    } finally {
      setIsSigningWithClientKey(false);
    }
  };

  const onReadCloudKey = async () => {
    setErrorMessage('');
    setIsSigningWithClientKey(true);
    smartIdStageRef.current = 'read-key';

    try {
      const service = await loadBrowserSigningService();
      const sdk = getCloudClientSigner(service);
      const provider = getSmartIdProvider(service, cloudProvider);

      if (!provider) {
        throw new Error('Cloud signature provider was not found');
      }

      setCloudConfirmation(null);

      if (!smartIdListenerRegisteredRef.current) {
        await service.addSmartIdConfirmationListener({
          getStage: () => smartIdStageRef.current,
          onConfirm: setCloudConfirmation,
          provider,
          sdk,
        });

        smartIdListenerRegisteredRef.current = true;
      }

      const keyInfo = await service.readSmartIdKey({
        provider,
        sdk,
      });

      setReadKeyInfo(keyInfo);
      setCloudConfirmation(null);
      setKeyStatus({
        tone: 'success',
        message: `Cloud key read: ${keyInfo.ownerInfo.subjCN ?? keyInfo.label}.`,
      });
    } catch (error) {
      setReadKeyInfo(null);
      setErrorMessage(getErrorMessage(error, 'Failed to read the cloud key'));
    } finally {
      setIsSigningWithClientKey(false);
    }
  };

  const onCompleteCloudKey = async () => {
    await completeBrowserSigning({
      beforeSign: () => {
        smartIdStageRef.current = 'sign';
        setCloudConfirmation(null);
      },
    });
  };

  const isSigned = signingStatus?.sessionStatus === 'signed';
  const isFileKey = signingMode === 'file-key';
  const isHardwareKey = signingMode === 'hardware-key';
  const isCloudKey = signingMode === 'cloud';
  const isSigningDisabled = isCompleting || isPreparing || isSigningWithClientKey;
  // A read key is enough — signing auto-prepares the document if needed.
  const canSignWithPreparedKey = readKeyInfo !== null && !isSigningDisabled;
  const signingMethodLabel = getSigningMethodDisplayLabel(signingMethod);
  const selectedJksEntry = jksEntries.find((entry) => entry.index === selectedKeyIndex) ?? jksEntries[0] ?? null;

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/25 p-4">
      {isSigned && signingStatus ? (
        <UaKepSigningResult
          status={signingStatus}
          getEvidenceUrl={getEvidenceUrl}
          onUseSignature={async () => {
            const signatureImage = await applySignatureFromStatus(signingStatus);

            if (signatureImage) {
              await onSignatureApply?.(signatureImage);
            }
          }}
        />
      ) : null}

      <fieldset className="space-y-4" disabled={isSigningDisabled}>
        <div className="space-y-2">
          <Label htmlFor="ua-kep-signing-method">
            <Trans>QES/AES method</Trans>
          </Label>
          <Select value={signingMode} onValueChange={onSigningModeChange}>
            <SelectTrigger id="ua-kep-signing-method" className="bg-background">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {Object.entries(SIGNING_MODE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isFileKey ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="ua-kep-jks-file">
                <Trans>JKS key file</Trans>
              </Label>
              <Input
                id="ua-kep-jks-file"
                type="file"
                accept=".jks"
                onChange={(event) => void onFileSelected(event.target.files?.[0] ?? null)}
              />
              {selectedFileName ? <p className="text-muted-foreground text-sm">{selectedFileName}</p> : null}
            </div>

            {jksEntries.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="ua-kep-key-entry">
                  <Trans>Key in container</Trans>
                </Label>
                <Select
                  value={String(selectedKeyIndex)}
                  onValueChange={(value) => {
                    setSelectedKeyIndex(Number(value));
                    resetReadKeyState();
                  }}
                >
                  <SelectTrigger id="ua-kep-key-entry" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {jksEntries.map((entry) => (
                      <SelectItem key={`${entry.alias}-${entry.index}`} value={String(entry.index)}>
                        {entry.alias} {entry.subjectCN ? `- ${entry.subjectCN}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {selectedJksEntry ? (
              <div className="rounded-md border border-border bg-background p-3 text-sm">
                <dl className="grid gap-1">
                  <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                    <dt className="text-muted-foreground">
                      <Trans>Signer</Trans>
                    </dt>
                    <dd className="font-medium">{getDisplayValue(selectedJksEntry.subjectCN)}</dd>
                  </div>

                  <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                    <dt className="text-muted-foreground">
                      <Trans>QTSP/CA</Trans>
                    </dt>
                    <dd>{getDisplayValue(selectedJksEntry.issuerCN)}</dd>
                  </div>

                  <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                    <dt className="text-muted-foreground">Alias</dt>
                    <dd>{getDisplayValue(selectedJksEntry.alias)}</dd>
                  </div>

                  <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
                    <dt className="text-muted-foreground">
                      <Trans>Type</Trans>
                    </dt>
                    <dd>{selectedJksEntry.isStamp ? <Trans>Seal</Trans> : <Trans>Signature</Trans>}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="ua-kep-password">
                <Trans>Key password</Trans>
              </Label>
              <Input
                id="ua-kep-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setReadKeyInfo(null);
                }}
              />
            </div>
          </>
        ) : null}

        {isHardwareKey ? (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onLoadHardwareMedias()}
              disabled={isLoadingHardwareMedias || isSigningDisabled}
            >
              <Trans>Refresh media</Trans>
            </Button>

            {hardwareMedias.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="ua-kep-hardware-media">
                  <Trans>Hardware media</Trans>
                </Label>
                <Select
                  value={String(selectedHardwareMediaIndex)}
                  onValueChange={(value) => {
                    setSelectedHardwareMediaIndex(Number(value));
                    resetReadKeyState();
                  }}
                >
                  <SelectTrigger id="ua-kep-hardware-media" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {hardwareMedias.map((media) => (
                      <SelectItem key={`${media.type}-${media.device}-${media.index}`} value={String(media.index)}>
                        {media.visibleName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="ua-kep-hardware-password">
                <Trans>Hardware key PIN</Trans>
              </Label>
              <Input
                id="ua-kep-hardware-password"
                type="password"
                value={hardwarePassword}
                onChange={(event) => {
                  setHardwarePassword(event.target.value);
                  setReadKeyInfo(null);
                }}
              />
            </div>
          </>
        ) : null}

        {isCloudKey ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="ua-kep-cloud-provider">
                <Trans>Cloud signature provider</Trans>
              </Label>
              <Select value={cloudProvider} onValueChange={onCloudProviderChange}>
                <SelectTrigger id="ua-kep-cloud-provider" className="bg-background">
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  {cloudProviders.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cloudConfirmation ? (
              <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-950 text-sm">
                <p className="font-medium">{getSmartIdConfirmationText(cloudConfirmation.stage)}</p>
                {cloudConfirmation.qrCode ? (
                  <img
                    src={cloudConfirmation.qrCode}
                    alt="Cloud signature QR code"
                    className="size-36 rounded bg-white p-2"
                  />
                ) : null}
                {cloudConfirmation.url ? (
                  <a href={cloudConfirmation.url} target="_blank" rel="noreferrer" className="font-medium underline">
                    <Trans>Open confirmation</Trans>
                  </a>
                ) : null}
                {cloudConfirmation.expireDate ? (
                  <p>
                    <Trans>Valid until</Trans>: {new Date(cloudConfirmation.expireDate).toLocaleString('en-US')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {keyStatus ? <UaKepKeyStatusMessage status={keyStatus} /> : null}

        {readKeyInfo ? <UaKepReadKeyInfoCard keyInfo={readKeyInfo} methodLabel={signingMethodLabel} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void onPrepare()} disabled={isPreparing}>
            <Trans>Prepare</Trans>
          </Button>

          {isFileKey ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onReadFileKey()}
                disabled={!selectedFile || !password || isSigningDisabled}
              >
                <Trans>Read key</Trans>
              </Button>

              <Button type="button" onClick={() => void onCompleteFileKey()} disabled={!canSignWithPreparedKey}>
                <Trans>Sign with QES/AES</Trans>
              </Button>
            </>
          ) : null}

          {isHardwareKey ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onReadHardwareKey()}
                disabled={!hardwareMedias[selectedHardwareMediaIndex] || !hardwarePassword || isSigningDisabled}
              >
                <Trans>Read key</Trans>
              </Button>

              <Button type="button" onClick={() => void onCompleteHardwareKey()} disabled={!canSignWithPreparedKey}>
                <Trans>Sign with hardware key</Trans>
              </Button>
            </>
          ) : null}

          {isCloudKey ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onReadCloudKey()}
                disabled={isSigningDisabled}
              >
                <Trans>Read key</Trans>
              </Button>

              <Button type="button" onClick={() => void onCompleteCloudKey()} disabled={!canSignWithPreparedKey}>
                <Trans>Sign with cloud signature</Trans>
              </Button>
            </>
          ) : null}
        </div>
      </fieldset>

      {prepareState ? <p className="text-muted-foreground text-sm">{prepareState}</p> : null}

      {errorMessage ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900 text-sm">{errorMessage}</div>
      ) : null}
    </div>
  );
};

export const createUaKepSignatureTab = ({
  hasValue,
  onSignatureApply,
  onSignatureComplete,
  uaKepSigning,
}: {
  hasValue?: boolean;
  onSignatureApply?: (value: string) => void | Promise<void>;
  onSignatureComplete: (value: string) => void;
  uaKepSigning: UaKepSigningContext;
}): SignaturePadExternalTab => ({
  value: UA_KEP_SIGNATURE_TAB_VALUE,
  hasValue,
  trigger: (
    <>
      <KeyRoundIcon className="mr-2 size-4" />
      <Trans>QES/AES</Trans>
    </>
  ),
  content: (
    <UaKepSignatureTab
      {...uaKepSigning}
      onSignatureApply={onSignatureApply}
      onSignatureComplete={onSignatureComplete}
    />
  ),
  onSelect: () => onSignatureComplete(''),
});
