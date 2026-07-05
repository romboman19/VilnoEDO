import { DocumentSignatureType } from '@documenso/lib/constants/document';
import { isBase64Image } from '@documenso/lib/constants/signatures';

import { Trans } from '@lingui/react/macro';
import { KeyboardIcon, UploadCloudIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { match } from 'ts-pattern';

import { SignatureIcon } from '../../icons/signature';
import { cn } from '../../lib/utils';
import { SignaturePadDraw } from './signature-pad-draw';
import { SignaturePadType } from './signature-pad-type';
import { SignaturePadUpload } from './signature-pad-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './signature-tabs';

export type SignaturePadValue = {
  type: DocumentSignatureType;
  value: string;
};

export type SignaturePadExternalTab = {
  value: string;
  trigger: ReactNode;
  content: ReactNode;
  hasValue?: boolean;
  onSelect?: () => void;
};

export type SignaturePadProps = Omit<HTMLAttributes<HTMLCanvasElement>, 'onChange'> & {
  fullName?: string;
  value?: string;
  onChange?: (_value: SignaturePadValue) => void;

  disabled?: boolean;

  typedSignatureEnabled?: boolean;
  uploadSignatureEnabled?: boolean;
  drawSignatureEnabled?: boolean;

  onValidityChange?: (isValid: boolean) => void;
  externalTabs?: SignaturePadExternalTab[];
};

export const SignaturePad = ({
  fullName,
  value = '',
  onChange,
  disabled = false,
  typedSignatureEnabled = true,
  uploadSignatureEnabled = true,
  drawSignatureEnabled = true,
  externalTabs = [],
}: SignaturePadProps) => {
  const [imageSignature, setImageSignature] = useState(isBase64Image(value) ? value : '');
  const [drawSignature, setDrawSignature] = useState(isBase64Image(value) ? value : '');
  const [typedSignature, setTypedSignature] = useState(isBase64Image(value) ? '' : value);
  const externalTabsRef = useRef(externalTabs);

  /**
   * This is cooked.
   *
   * Get the first enabled tab that has a signature if possible, otherwise just get
   * the first enabled tab.
   */
  const [tab, setTab] = useState(
    ((): string => {
      // First passthrough to check to see if there's a signature for a given tab.
      if (drawSignatureEnabled && drawSignature) {
        return 'draw';
      }

      if (typedSignatureEnabled && typedSignature) {
        return 'text';
      }

      if (uploadSignatureEnabled && imageSignature) {
        return 'image';
      }

      const externalTabWithValue = externalTabs.find((externalTab) => externalTab.hasValue);

      if (externalTabWithValue) {
        return externalTabWithValue.value;
      }

      // Second passthrough to just select the first avaliable tab.
      if (drawSignatureEnabled) {
        return 'draw';
      }

      if (typedSignatureEnabled) {
        return 'text';
      }

      if (uploadSignatureEnabled) {
        return 'image';
      }

      const [externalTab] = externalTabs;

      if (externalTab) {
        return externalTab.value;
      }

      throw new Error('No signature enabled');
    })(),
  );

  const onImageSignatureChange = (value: string) => {
    setImageSignature(value);

    onChange?.({
      type: DocumentSignatureType.UPLOAD,
      value,
    });
  };

  const onDrawSignatureChange = (value: string) => {
    setDrawSignature(value);

    onChange?.({
      type: DocumentSignatureType.DRAW,
      value,
    });
  };

  const onTypedSignatureChange = (value: string) => {
    setTypedSignature(value);

    onChange?.({
      type: DocumentSignatureType.TYPE,
      value,
    });
  };

  const onTabChange = (value: string) => {
    if (disabled) {
      return;
    }

    setTab(value);

    match(value)
      .with('draw', () => {
        onDrawSignatureChange(drawSignature);
      })
      .with('text', () => {
        onTypedSignatureChange(typedSignature);
      })
      .with('image', () => {
        onImageSignatureChange(imageSignature);
      })
      .otherwise(() => null);
  };

  useEffect(() => {
    externalTabsRef.current = externalTabs;
  }, [externalTabs]);

  useEffect(() => {
    externalTabsRef.current.find((externalTab) => externalTab.value === tab)?.onSelect?.();
  }, [tab]);

  if (!drawSignatureEnabled && !typedSignatureEnabled && !uploadSignatureEnabled && externalTabs.length === 0) {
    return null;
  }

  return (
    <Tabs
      defaultValue={tab}
      className={cn({
        'pointer-events-none': disabled,
      })}
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      onValueChange={(value) => onTabChange(value)}
    >
      <TabsList>
        {drawSignatureEnabled && (
          <TabsTrigger value="draw">
            <SignatureIcon className="mr-2 size-4" />
            <Trans context="Draw signature">Draw</Trans>
          </TabsTrigger>
        )}

        {typedSignatureEnabled && (
          <TabsTrigger value="text">
            <KeyboardIcon className="mr-2 size-4" />
            <Trans context="Type signature">Type</Trans>
          </TabsTrigger>
        )}

        {uploadSignatureEnabled && (
          <TabsTrigger value="image">
            <UploadCloudIcon className="mr-2 size-4" />
            <Trans context="Upload signature">Upload</Trans>
          </TabsTrigger>
        )}

        {externalTabs.map((externalTab) => (
          <TabsTrigger key={externalTab.value} value={externalTab.value}>
            {externalTab.trigger}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent
        value="draw"
        className="relative flex aspect-signature-pad items-center justify-center rounded-md border border-border bg-muted/25 text-center"
      >
        <SignaturePadDraw className="h-full w-full" onChange={onDrawSignatureChange} value={drawSignature} />
      </TabsContent>

      <TabsContent
        value="text"
        className="relative flex aspect-signature-pad items-center justify-center rounded-md border border-border bg-muted/25 text-center"
      >
        <SignaturePadType value={typedSignature} defaultValue={fullName} onChange={onTypedSignatureChange} />
      </TabsContent>

      <TabsContent
        value="image"
        className={cn('relative aspect-signature-pad rounded-md border border-border bg-muted/25', {
          'bg-background': imageSignature,
        })}
      >
        <SignaturePadUpload value={imageSignature} onChange={onImageSignatureChange} />
      </TabsContent>

      {externalTabs.map((externalTab) => (
        <TabsContent key={externalTab.value} value={externalTab.value}>
          {externalTab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
};
