/**
 * Workaround for E2E tests to not import `msg`.
 */
import { DocumentSignatureType } from '@documenso/lib/utils/teams';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { DocumentDistributionMethod, DocumentStatus } from '@prisma/client';

export { DocumentSignatureType };

/**
 * Maximum count returned per status bucket in document stats. The server clamps
 * each count to this value; the UI should display "10,000+" when it sees it.
 */
export const STATS_COUNT_CAP = 10_000;

export const DOCUMENT_STATUS: {
  [status in DocumentStatus]: { description: MessageDescriptor };
} = {
  [DocumentStatus.COMPLETED]: {
    description: msg`Completed`,
  },
  [DocumentStatus.REJECTED]: {
    description: msg`Rejected`,
  },
  [DocumentStatus.CANCELLED]: {
    description: msg`Cancelled`,
  },
  [DocumentStatus.DRAFT]: {
    description: msg`Draft`,
  },
  [DocumentStatus.PENDING]: {
    description: msg`Pending`,
  },
};

type DocumentDistributionMethodTypeData = {
  value: DocumentDistributionMethod;
  description: MessageDescriptor;
};

export const DOCUMENT_DISTRIBUTION_METHODS: Record<string, DocumentDistributionMethodTypeData> = {
  [DocumentDistributionMethod.EMAIL]: {
    value: DocumentDistributionMethod.EMAIL,
    description: msg`Email`,
  },
  [DocumentDistributionMethod.NONE]: {
    value: DocumentDistributionMethod.NONE,
    description: msg`None`,
  },
} satisfies Record<DocumentDistributionMethod, DocumentDistributionMethodTypeData>;

type DocumentSignatureTypeData = {
  label: MessageDescriptor;
  value: DocumentSignatureType;
};

export const DOCUMENT_SIGNATURE_TYPES = {
  [DocumentSignatureType.DRAW]: {
    label: msg({
      message: `Draw`,
      context: `Draw signature`,
    }),
    value: DocumentSignatureType.DRAW,
  },
  [DocumentSignatureType.TYPE]: {
    label: msg({
      message: `Type`,
      context: `Type signature`,
    }),
    value: DocumentSignatureType.TYPE,
  },
  [DocumentSignatureType.UPLOAD]: {
    label: msg({
      message: `Upload`,
      context: `Upload signature`,
    }),
    value: DocumentSignatureType.UPLOAD,
  },
} satisfies Record<Exclude<DocumentSignatureType, DocumentSignatureType.UA_KEP>, DocumentSignatureTypeData>;

export const DOCUMENT_SIGNATURE_TYPES_WITH_UA_KEP = {
  ...DOCUMENT_SIGNATURE_TYPES,
  [DocumentSignatureType.UA_KEP]: {
    label: msg`KEP/UEP`,
    value: DocumentSignatureType.UA_KEP,
  },
} satisfies Record<DocumentSignatureType, DocumentSignatureTypeData>;

/// VilnoEDO is UA-only: the only offered signature type is the Ukrainian
/// КЕП/УЕП/electronic seal. The upstream Documenso visual signature types
/// (draw/type/upload) are not exposed in document creation.
export const DOCUMENT_SIGNATURE_TYPES_UA_ONLY = {
  [DocumentSignatureType.UA_KEP]: DOCUMENT_SIGNATURE_TYPES_WITH_UA_KEP[DocumentSignatureType.UA_KEP],
} satisfies Partial<Record<DocumentSignatureType, DocumentSignatureTypeData>>;
