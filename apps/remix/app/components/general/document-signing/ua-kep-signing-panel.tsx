import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Trans } from '@lingui/react/macro';
import { useSigningMethod } from '@vilnoedo/ua-kep/client/hooks/use-signing-method';
import { type TUaKepSigningStatus, useUaKepSigning } from '@vilnoedo/ua-kep/client/hooks/use-ua-kep-signing';
import { createIitSigner } from '@vilnoedo/ua-kep/client/iit-signer-factory';
import { readJksContainer, type TJksKeyEntry, unlockJksKey } from '@vilnoedo/ua-kep/client/jks-reader';
import { signPreparedHashes } from '@vilnoedo/ua-kep/client/sign-hashes';
import { useEffect, useState } from 'react';

export type UaKepSigningPanelProps = {
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
};

const verificationStatusLabel = (status: string) => {
  switch (status) {
    case 'passed_structural':
      return 'структурну перевірку пройдено';
    case 'pending':
      return 'очікує перевірки';
    default:
      return status;
  }
};

const UaKepSigningResult = ({
  status,
  getEvidenceUrl,
}: {
  status: TUaKepSigningStatus;
  getEvidenceUrl: (evidencePackageId: string, kind: 'manifest' | 'archive') => string;
}) => {
  const signerCn = status.signerInfo && typeof status.signerInfo.subjCN === 'string' ? status.signerInfo.subjCN : null;

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm">
        <p className="font-medium text-green-900">
          <Trans>Документ підписано КЕП</Trans>
        </p>
        {signerCn ? <p className="text-green-800">{signerCn}</p> : null}
        {status.signedAt ? <p className="text-green-800">{new Date(status.signedAt).toLocaleString('uk-UA')}</p> : null}
      </div>

      <div className="space-y-2">
        {status.items.map((item) => {
          const report = item.validationReport;
          const warnings = report?.validationWarnings ?? [];

          return (
            <div key={item.envelopeItemId} className="rounded-md border p-3 text-sm">
              <p>
                <strong>
                  <Trans>Підпис:</Trans>
                </strong>{' '}
                {item.artifactType} — {verificationStatusLabel(item.verificationStatus)}
              </p>
              {report?.certificateStatus === 'within_validity_window' ? (
                <p className="text-muted-foreground">
                  <Trans>Сертифікат чинний на час підпису</Trans>
                </p>
              ) : null}
              {warnings.length > 0 ? (
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {warnings.map((warning) => (
                    <li key={warning.code}>{warning.message}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1 break-all text-muted-foreground text-xs">SHA-256: {item.signatureSha256}</p>
            </div>
          );
        })}
      </div>

      {status.evidencePackage ? (
        <div className="space-y-1 rounded-md border p-3 text-sm">
          <p className="font-medium">
            <Trans>Пакет доказів</Trans>
          </p>
          <p className="break-all text-muted-foreground text-xs">SHA-256: {status.evidencePackage.packageSha256}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="outline" size="sm">
              <a href={getEvidenceUrl(status.evidencePackage.id, 'archive')} download rel="noreferrer">
                <Trans>Завантажити ZIP</Trans>
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={getEvidenceUrl(status.evidencePackage.id, 'manifest')} download rel="noreferrer">
                <Trans>Manifest JSON</Trans>
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export const UaKepSigningPanel = ({ recipientId, envelopeId, recipientToken }: UaKepSigningPanelProps) => {
  const { signingMethod } = useSigningMethod('file-key');
  const {
    isPreparing,
    isCompleting,
    prepare,
    complete,
    fetchStatus,
    getEvidenceUrl,
    lastPreparedSessionId,
    lastPreparedSessionToken,
    lastPreparedCallbackNonce,
  } = useUaKepSigning({
    recipientId,
    envelopeId,
    recipientToken,
    signingMethod,
  });

  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [prepareState, setPrepareState] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [jksEntries, setJksEntries] = useState<TJksKeyEntry[]>([]);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [signingStatus, setSigningStatus] = useState<TUaKepSigningStatus | null>(null);
  const [preparedItems, setPreparedItems] = useState<
    Array<{ envelopeItemId: string; documentDataId: string; hashB64: string; ordinal: number }>
  >([]);

  useEffect(() => {
    fetchStatus()
      .then((status) => setSigningStatus(status))
      .catch(() => {
        // Status is a progressive enhancement; the signing form still works.
      });
  }, [fetchStatus]);

  const onFileSelected = async (file: File | null) => {
    if (!file) {
      return;
    }

    setErrorMessage('');

    const { sdk } = createIitSigner();
    const keyInfo = await readJksContainer(sdk, file);
    setSelectedFile(file);
    setSelectedFileName(keyInfo.fileName);
    setJksEntries(keyInfo.entries);
    setSelectedKeyIndex(0);
  };

  const onPrepare = async () => {
    setErrorMessage('');

    try {
      const prepared = await prepare();
      setPreparedItems(prepared.items ?? []);
      setPrepareState(`${prepared.items?.length ?? 0} hash item(s) prepared`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не вдалося підготувати підпис');
    }
  };

  const onComplete = async () => {
    if (!selectedFile) {
      setErrorMessage('Спочатку оберіть файл ключа');
      return;
    }

    setErrorMessage('');

    try {
      const { sdk } = createIitSigner();

      await unlockJksKey(sdk, selectedFile, selectedKeyIndex, password);

      const signed = await signPreparedHashes(sdk, preparedItems);

      await complete({
        signerInfo: {
          ...(signed.signerInfo.subjCN ? { subjCN: signed.signerInfo.subjCN } : {}),
          ...(signed.signerInfo.issuerCN ? { issuerCN: signed.signerInfo.issuerCN } : {}),
          ...(signed.signerInfo.edrpou ? { edrpou: signed.signerInfo.edrpou } : {}),
          ...(signed.signerInfo.serial ? { serial: signed.signerInfo.serial } : {}),
        },
        signatures: signed.items,
      });

      setPrepareState('');
      setPreparedItems([]);

      const status = await fetchStatus();
      setSigningStatus(status);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не вдалося завершити підписання');
    }
  };

  const isSigned = signingStatus?.sessionStatus === 'signed';

  return (
    <Card className="mt-6 border-blue-200 bg-blue-50/40">
      <CardHeader>
        <CardTitle>
          <Trans>Український КЕП</Trans>
        </CardTitle>
        <CardDescription>
          {isSigned ? (
            <Trans>Результат підписання та пакет доказів.</Trans>
          ) : (
            <Trans>Підписання документа файловим ключем КЕП. Підпис перевіряється сервером перед прийняттям.</Trans>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSigned && signingStatus ? (
          <UaKepSigningResult status={signingStatus} getEvidenceUrl={getEvidenceUrl} />
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="ua-kep-jks-file">
                <Trans>Файл ключа JKS</Trans>
              </Label>
              <Input
                id="ua-kep-jks-file"
                type="file"
                accept=".jks"
                onChange={(event) => void onFileSelected(event.target.files?.[0] ?? null)}
              />
              {selectedFileName ? <p className="text-muted-foreground text-sm">{selectedFileName}</p> : null}
              {jksEntries.length > 0 ? (
                <div className="space-y-1 text-muted-foreground text-sm">
                  <p>
                    <Trans>Доступні ключі:</Trans>
                  </p>
                  <select
                    value={selectedKeyIndex}
                    onChange={(event) => setSelectedKeyIndex(Number(event.target.value))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {jksEntries.map((entry) => (
                      <option key={`${entry.alias}-${entry.index}`} value={entry.index}>
                        {entry.alias} {entry.subjectCN ? `— ${entry.subjectCN}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ua-kep-password">
                <Trans>Пароль ключа</Trans>
              </Label>
              <Input
                id="ua-kep-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onPrepare()} disabled={isPreparing}>
                <Trans>Підготувати підпис</Trans>
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onComplete()}
                disabled={
                  isCompleting ||
                  !lastPreparedSessionId ||
                  !lastPreparedSessionToken ||
                  !lastPreparedCallbackNonce ||
                  !selectedFile ||
                  preparedItems.length === 0
                }
              >
                <Trans>Підписати і завершити</Trans>
              </Button>
            </div>

            {errorMessage ? (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900 text-sm">{errorMessage}</div>
            ) : null}

            <div className="space-y-1 text-muted-foreground text-sm">
              <p>
                <strong>
                  <Trans>Метод:</Trans>
                </strong>{' '}
                {signingMethod}
              </p>
              <p>
                <strong>
                  <Trans>Сесія:</Trans>
                </strong>{' '}
                {lastPreparedSessionId ?? '—'}
              </p>
              {prepareState ? <p>{prepareState}</p> : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
