import { Button } from '@documenso/ui/primitives/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@documenso/ui/primitives/dialog';
import { SignaturePad } from '@documenso/ui/primitives/signature-pad';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { createCallable } from 'react-call';

import { DocumentSigningDisclosure } from '../general/document-signing/document-signing-disclosure';
import { createUaKepSignatureTab, type UaKepSigningContext } from '../general/document-signing/ua-kep-signature-tab';

export type SignFieldSignatureDialogProps = {
  initialSignature?: string;
  fullName?: string;
  typedSignatureEnabled?: boolean;
  uploadSignatureEnabled?: boolean;
  drawSignatureEnabled?: boolean;
  uaKepSignatureEnabled?: boolean;
  uaKepSigning?: UaKepSigningContext;
};

export const SignFieldSignatureDialog = createCallable<SignFieldSignatureDialogProps, string | null>(
  ({
    call,
    fullName,
    typedSignatureEnabled,
    uploadSignatureEnabled,
    drawSignatureEnabled,
    uaKepSignatureEnabled,
    initialSignature,
    uaKepSigning,
  }) => {
    const [localSignature, setLocalSignature] = useState(initialSignature);
    const externalTabs =
      uaKepSigning && uaKepSignatureEnabled !== false
        ? [
            createUaKepSignatureTab({
              uaKepSigning,
              onSignatureComplete: setLocalSignature,
            }),
          ]
        : undefined;

    return (
      <Dialog open={true} onOpenChange={(value) => (!value ? call.end(null) : null)}>
        <DialogContent
          position="center"
          aria-describedby={undefined}
          className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-3xl"
        >
          <div>
            <DialogHeader>
              <DialogTitle>
                <Trans>Sign Signature Field</Trans>
              </DialogTitle>
            </DialogHeader>

            <SignaturePad
              fullName={fullName}
              value={localSignature ?? ''}
              onChange={({ value }) => setLocalSignature(value)}
              typedSignatureEnabled={typedSignatureEnabled}
              uploadSignatureEnabled={uploadSignatureEnabled}
              drawSignatureEnabled={drawSignatureEnabled}
              externalTabs={externalTabs}
            />
          </div>

          <DocumentSigningDisclosure />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => call.end(null)}>
              <Trans>Cancel</Trans>
            </Button>

            <Button type="button" disabled={!localSignature} onClick={() => call.end(localSignature || null)}>
              <Trans>Sign</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
