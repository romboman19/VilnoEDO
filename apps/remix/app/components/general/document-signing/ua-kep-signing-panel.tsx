import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { Trans } from '@lingui/react/macro';
import { useSigningMethod } from '@vilnoedo/ua-kep/client/hooks/use-signing-method';
import { useUaKepSigning } from '@vilnoedo/ua-kep/client/hooks/use-ua-kep-signing';
import { createIitSigner } from '@vilnoedo/ua-kep/client/iit-signer-factory';
import { readJksKeyContainer } from '@vilnoedo/ua-kep/client/jks-reader';
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
  const [password, setPassword] = useState('');
  const [prepareState, setPrepareState] = useState<string>('');
  const [keyAliases, setKeyAliases] = useState<string[]>([]);

  const onFileSelected = async (file: File | null) => {
    if (!file) {
      return;
    }

    const signer = await createIitSigner();
    const keyInfo = await readJksKeyContainer({ signer, file });
    setSelectedFileName(keyInfo.fileName);
    setKeyAliases(keyInfo.keyAliases);
  };

  const onPrepare = async () => {
    const prepared = await prepare();
    setPrepareState(`${prepared.items?.length ?? 0} hash item(s) prepared`);
  };

  const onComplete = async () => {
    await complete({
      signerInfo: {
        subjCN: selectedFileName || 'JKS signer',
      },
      signatures: [],
    });

    setPrepareState('UA KEP session marked as signed (stub flow)');
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
          {keyAliases.length > 0 ? (
            <p className="text-muted-foreground text-sm">aliases: {keyAliases.join(', ')}</p>
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
            disabled={isCompleting || !lastPreparedSessionId}
          >
            <Trans>Завершити stub-підпис</Trans>
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
        </div>
      </CardContent>
    </Card>
  );
};
