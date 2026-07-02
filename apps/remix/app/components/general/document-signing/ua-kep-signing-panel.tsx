import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Trans } from '@lingui/react/macro';
import { useSigningMethod } from '@vilnoedo/ua-kep/client/hooks/use-signing-method';
import { useUaKepSigning } from '@vilnoedo/ua-kep/client/hooks/use-ua-kep-signing';
import { createIitSigner } from '@vilnoedo/ua-kep/client/iit-signer-factory';
import { readJksContainer, type TJksKeyEntry, unlockJksKey } from '@vilnoedo/ua-kep/client/jks-reader';
import { signPreparedHashes } from '@vilnoedo/ua-kep/client/sign-hashes';
import { useState } from 'react';

export type UaKepSigningPanelProps = {
  recipientId: number;
  envelopeId: string;
  recipientToken: string;
};

export const UaKepSigningPanel = ({ recipientId, envelopeId, recipientToken }: UaKepSigningPanelProps) => {
  const { signingMethod } = useSigningMethod('privatbank-jks');
  const { isPreparing, isCompleting, prepare, complete, lastPreparedSessionId } = useUaKepSigning({
    recipientId,
    envelopeId,
    recipientToken,
    signingMethod,
  });

  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [prepareState, setPrepareState] = useState<string>('');
  const [jksEntries, setJksEntries] = useState<TJksKeyEntry[]>([]);
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(0);
  const [preparedItems, setPreparedItems] = useState<
    Array<{ envelopeItemId: string; documentDataId: string; hashB64: string; ordinal: number }>
  >([]);
  const [lastSignerInfo, setLastSignerInfo] = useState<{
    subjCN?: string | null;
    issuerCN?: string | null;
    EDRPOUCode?: string | null;
    serial?: string | null;
  } | null>(null);

  const onFileSelected = async (file: File | null) => {
    if (!file) {
      return;
    }

    const { sdk } = createIitSigner();
    const keyInfo = await readJksContainer(sdk, file);
    setSelectedFile(file);
    setSelectedFileName(keyInfo.fileName);
    setJksEntries(keyInfo.entries);
    setSelectedKeyIndex(0);
  };

  const onPrepare = async () => {
    const prepared = await prepare();
    setPreparedItems(prepared.items ?? []);
    setPrepareState(`${prepared.items?.length ?? 0} hash item(s) prepared`);
  };

  const onComplete = async () => {
    if (!selectedFile) {
      throw new Error('Select a JKS file first');
    }

    const { sdk } = createIitSigner();
    const unlockedKey = await unlockJksKey(sdk, selectedFile, selectedKeyIndex, password);
    setLastSignerInfo(unlockedKey.ownerInfo);

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

    setPrepareState('UA KEP signing flow completed');
  };

  return (
    <Card className="mt-6 border-blue-200 bg-blue-50/40">
      <CardHeader>
        <CardTitle>
          <Trans>Український КЕП</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>Початковий signing panel для інтеграції JKS / токен / cloud flow у штатну архітектуру VilnoEDO.</Trans>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
              <p>available keys:</p>
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
            disabled={isCompleting || !lastPreparedSessionId || !selectedFile || preparedItems.length === 0}
          >
            <Trans>Підписати і завершити</Trans>
          </Button>
        </div>

        <div className="space-y-1 text-muted-foreground text-sm">
          <p>
            <strong>method:</strong> {signingMethod}
          </p>
          <p>
            <strong>session:</strong> {lastPreparedSessionId ?? '—'}
          </p>
          {prepareState ? <p>{prepareState}</p> : null}
          {lastSignerInfo?.subjCN ? (
            <p>
              <strong>signer:</strong> {lastSignerInfo.subjCN}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};
