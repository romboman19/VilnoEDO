import { DEFAULT_DOCUMENT_TIME_ZONE } from '@documenso/lib/constants/time-zones';
import { UA_KEP_SIGNING_PROTOCOL_TITLE } from '@documenso/lib/constants/ua-kep';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { RequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prefixedId } from '@documenso/lib/universal/id';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { prisma } from '@documenso/prisma';
import { PDF } from '@libpdf/core';
import { DateTime } from 'luxon';
import { Canvas } from 'skia-canvas';

import { ensureFontLibrary } from '../pdf/helpers';
import {
  formatUaKepSigningTime,
  getUaKepSignerCommonName,
  getUaKepSigningMethodDisplayLabel,
} from './signature-appearance';

type EnsureUaKepSigningProtocolEnvelopeItemOptions = {
  envelopeId: string;
  requestMetadata?: RequestMetadata;
};

type ProtocolEnvelope = NonNullable<Awaited<ReturnType<typeof getProtocolEnvelope>>>;
type ProtocolSession = Awaited<ReturnType<typeof getProtocolSessions>>[number];
type CanvasContext = ReturnType<Canvas['getContext']>;

const pageWidth = 595;
const pageHeight = 842;
const pageMargin = 44;
const footerHeight = 36;
const contentBottom = pageHeight - footerHeight;
const textColor = '#111827';
const mutedTextColor = '#6b7280';
const borderColor = '#d1d5db';
const cardFillColor = '#f9fafb';
const accentColor = '#65a30d';
const fontFamily = 'Noto Sans';
const textLineHeight = 15;
const smallLineHeight = 13;

const getProtocolEnvelope = (envelopeId: string) => {
  return prisma.envelope.findUnique({
    where: {
      id: envelopeId,
    },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      completedAt: true,
      teamId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      documentMeta: {
        select: {
          timezone: true,
        },
      },
      envelopeItems: {
        where: {
          title: {
            not: UA_KEP_SIGNING_PROTOCOL_TITLE,
          },
        },
        select: {
          id: true,
          title: true,
          order: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  });
};

const getProtocolSessions = (envelopeId: string) => {
  return prisma.uaKepSession.findMany({
    where: {
      status: 'signed',
      recipient: {
        envelopeId,
      },
    },
    select: {
      id: true,
      recipientId: true,
      signingMethod: true,
      signedAt: true,
      signerInfo: true,
      recipient: {
        select: {
          name: true,
          email: true,
          role: true,
        },
      },
      evidencePackage: {
        select: {
          id: true,
          packageSha256: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      signatureArtifacts: {
        select: {
          id: true,
          envelopeItemId: true,
          documentDataId: true,
          artifactType: true,
          signatureSha256: true,
          documentHashB64: true,
          verificationStatus: true,
          createdAt: true,
          signerInfo: true,
          envelopeItem: {
            select: {
              title: true,
              order: true,
            },
          },
          structuredValidationReport: {
            select: {
              status: true,
              validator: true,
              certificateStatus: true,
              checkedAt: true,
            },
          },
        },
        orderBy: [{ envelopeItemId: 'asc' }, { artifactType: 'asc' }],
      },
    },
    orderBy: {
      signedAt: 'asc',
    },
  });
};

const toArrayBuffer = (bytes: Uint8Array) => {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const getStringFromRecord = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of keys) {
    const result = record[key];

    if (typeof result === 'string' && result.length > 0) {
      return result;
    }
  }

  return null;
};

const formatDate = (value: Date | null | undefined, timeZone: string | null | undefined) => {
  if (!value) {
    return 'N/A';
  }

  const zone = timeZone || DEFAULT_DOCUMENT_TIME_ZONE;
  const date = DateTime.fromJSDate(value).setZone(zone);

  if (!date.isValid) {
    return 'N/A';
  }

  return date.toFormat('yyyy-LL-dd HH:mm:ss ZZZZ');
};

const humanizeValue = (value: string | null | undefined) => {
  if (!value) {
    return 'N/A';
  }

  return value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
};

const setFont = (context: CanvasContext, size: number, weight = '400') => {
  context.font = `${weight} ${size}px "${fontFamily}"`;
};

const wrapText = (context: CanvasContext, text: string, maxWidth: number) => {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [''];
  }

  const words = normalized.split(' ');
  const lines: string[] = [];
  let line = '';

  const pushLongWord = (word: string) => {
    let chunk = '';

    for (const char of word) {
      const candidate = `${chunk}${char}`;

      if (chunk && context.measureText(candidate).width > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else {
        chunk = candidate;
      }
    }

    return chunk;
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;

    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
    }

    if (context.measureText(word).width > maxWidth) {
      line = pushLongWord(word);
    } else {
      line = word;
    }
  }

  if (line) {
    lines.push(line);
  }

  return lines;
};

const drawWrappedText = ({
  context,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
}: {
  context: CanvasContext;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
}) => {
  const lines = wrapText(context, text, maxWidth);

  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
};

const measureWrappedText = (context: CanvasContext, text: string, maxWidth: number, lineHeight: number) => {
  return wrapText(context, text, maxWidth).length * lineHeight;
};

const drawLabelValue = ({
  context,
  label,
  value,
  x,
  y,
  labelWidth,
  valueWidth,
}: {
  context: CanvasContext;
  label: string;
  value: string;
  x: number;
  y: number;
  labelWidth: number;
  valueWidth: number;
}) => {
  setFont(context, 9, '700');
  context.fillStyle = mutedTextColor;
  context.fillText(label, x, y);

  setFont(context, 9);
  context.fillStyle = textColor;

  return drawWrappedText({
    context,
    text: value,
    x: x + labelWidth,
    y,
    maxWidth: valueWidth,
    lineHeight: smallLineHeight,
  });
};

const createProtocolPage = (pageNumber: number, envelopeId: string) => {
  const canvas = new Canvas(pageWidth, pageHeight);
  canvas.gpu = false;

  const context = canvas.getContext('2d');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pageWidth, pageHeight);

  setFont(context, 8);
  context.fillStyle = mutedTextColor;
  context.fillText(`Envelope ID: ${envelopeId}`, pageMargin, pageHeight - 20);
  context.fillText(`Page ${pageNumber}`, pageWidth - pageMargin - 34, pageHeight - 20);

  return {
    canvas,
    context,
  };
};

const drawSectionTitle = (context: CanvasContext, title: string, y: number) => {
  setFont(context, 13, '700');
  context.fillStyle = textColor;
  context.fillText(title, pageMargin, y);

  context.strokeStyle = accentColor;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(pageMargin, y + 8);
  context.lineTo(pageWidth - pageMargin, y + 8);
  context.stroke();

  return y + 24;
};

const drawCard = ({
  context,
  x,
  y,
  width,
  height,
}: {
  context: CanvasContext;
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  context.fillStyle = cardFillColor;
  context.strokeStyle = borderColor;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, width, height, 8);
  context.fill();
  context.stroke();
};

const getSignerInfoValue = (session: ProtocolSession, keys: string[]) => {
  return (
    getStringFromRecord(session.signerInfo, keys) ??
    getStringFromRecord(session.signatureArtifacts[0]?.signerInfo, keys)
  );
};

const measureSessionCardHeight = (context: CanvasContext, session: ProtocolSession, valueWidth: number) => {
  const signerName =
    getUaKepSignerCommonName(session.signerInfo) ?? (session.recipient.name || session.recipient.email);
  const rows = [
    ['Recipient', `${session.recipient.name || 'N/A'} <${session.recipient.email}>`],
    ['Role', session.recipient.role],
    ['Signer', signerName],
    ['Signed at', formatUaKepSigningTime(session.signedAt, DEFAULT_DOCUMENT_TIME_ZONE)],
    ['Method', getUaKepSigningMethodDisplayLabel(session.signingMethod)],
    ['Issuer', getSignerInfoValue(session, ['issuerCN', 'certIssuerCn']) ?? 'N/A'],
    ['EDRPOU / RNOKPP', getSignerInfoValue(session, ['edrpou', 'rnokpp']) ?? 'N/A'],
    ['Serial', getSignerInfoValue(session, ['serial', 'certSerial']) ?? 'N/A'],
    ['Evidence package', session.evidencePackage?.packageSha256 ?? 'N/A'],
  ];

  setFont(context, 9);

  const rowsHeight = rows.reduce((height, [, value]) => {
    return height + Math.max(smallLineHeight, measureWrappedText(context, value, valueWidth, smallLineHeight)) + 4;
  }, 0);

  return rowsHeight + 30;
};

const drawSessionCard = ({
  context,
  session,
  y,
  timeZone,
}: {
  context: CanvasContext;
  session: ProtocolSession;
  y: number;
  timeZone: string | null;
}) => {
  const cardX = pageMargin;
  const cardWidth = pageWidth - pageMargin * 2;
  const labelWidth = 104;
  const valueWidth = cardWidth - labelWidth - 28;
  const cardHeight = measureSessionCardHeight(context, session, valueWidth);

  drawCard({
    context,
    x: cardX,
    y,
    width: cardWidth,
    height: cardHeight,
  });

  let currentY = y + 20;
  const signerName =
    getUaKepSignerCommonName(session.signerInfo) ?? (session.recipient.name || session.recipient.email);
  const rows = [
    ['Recipient', `${session.recipient.name || 'N/A'} <${session.recipient.email}>`],
    ['Role', session.recipient.role],
    ['Signer', signerName],
    ['Signed at', formatUaKepSigningTime(session.signedAt, timeZone)],
    ['Method', getUaKepSigningMethodDisplayLabel(session.signingMethod)],
    ['Issuer', getSignerInfoValue(session, ['issuerCN', 'certIssuerCn']) ?? 'N/A'],
    ['EDRPOU / RNOKPP', getSignerInfoValue(session, ['edrpou', 'rnokpp']) ?? 'N/A'],
    ['Serial', getSignerInfoValue(session, ['serial', 'certSerial']) ?? 'N/A'],
    ['Evidence package', session.evidencePackage?.packageSha256 ?? 'N/A'],
  ];

  for (const [label, value] of rows) {
    const nextY = drawLabelValue({
      context,
      label,
      value,
      x: cardX + 14,
      y: currentY,
      labelWidth,
      valueWidth,
    });

    currentY = Math.max(currentY + smallLineHeight, nextY) + 4;
  }

  return y + cardHeight;
};

const measureArtifactCardHeight = (context: CanvasContext, artifact: ProtocolSession['signatureArtifacts'][number]) => {
  const valueWidth = pageWidth - pageMargin * 2 - 132;
  const rows = [
    ['Document', artifact.envelopeItem.title],
    ['Artifact', humanizeValue(artifact.artifactType)],
    ['Verification', humanizeValue(artifact.structuredValidationReport?.status ?? artifact.verificationStatus)],
    ['Certificate', humanizeValue(artifact.structuredValidationReport?.certificateStatus)],
    ['Document hash', artifact.documentHashB64],
    ['Signature SHA-256', artifact.signatureSha256],
  ];

  setFont(context, 9);

  const rowsHeight = rows.reduce((height, [, value]) => {
    return height + Math.max(smallLineHeight, measureWrappedText(context, value, valueWidth, smallLineHeight)) + 4;
  }, 0);

  return rowsHeight + 30;
};

const drawArtifactCard = ({
  context,
  artifact,
  y,
}: {
  context: CanvasContext;
  artifact: ProtocolSession['signatureArtifacts'][number];
  y: number;
}) => {
  const cardX = pageMargin;
  const cardWidth = pageWidth - pageMargin * 2;
  const labelWidth = 118;
  const valueWidth = cardWidth - labelWidth - 28;
  const cardHeight = measureArtifactCardHeight(context, artifact);

  drawCard({
    context,
    x: cardX,
    y,
    width: cardWidth,
    height: cardHeight,
  });

  let currentY = y + 20;
  const rows = [
    ['Document', artifact.envelopeItem.title],
    ['Artifact', humanizeValue(artifact.artifactType)],
    ['Verification', humanizeValue(artifact.structuredValidationReport?.status ?? artifact.verificationStatus)],
    ['Certificate', humanizeValue(artifact.structuredValidationReport?.certificateStatus)],
    ['Document hash', artifact.documentHashB64],
    ['Signature SHA-256', artifact.signatureSha256],
  ];

  for (const [label, value] of rows) {
    const nextY = drawLabelValue({
      context,
      label,
      value,
      x: cardX + 14,
      y: currentY,
      labelWidth,
      valueWidth,
    });

    currentY = Math.max(currentY + smallLineHeight, nextY) + 4;
  }

  return y + cardHeight;
};

const generateUaKepSigningProtocolPdf = async ({
  envelope,
  sessions,
}: {
  envelope: ProtocolEnvelope;
  sessions: ProtocolSession[];
}) => {
  ensureFontLibrary();

  const timeZone = envelope.documentMeta.timezone || DEFAULT_DOCUMENT_TIME_ZONE;
  const generatedAt = new Date();
  const pageBuffers: Uint8Array[] = [];
  let pageNumber = 1;
  let { canvas, context } = createProtocolPage(pageNumber, envelope.id);
  let y = pageMargin;

  const pushPage = async () => {
    const buffer = await canvas.toBuffer('pdf');
    pageBuffers.push(new Uint8Array(buffer));
    pageNumber += 1;
    const nextPage = createProtocolPage(pageNumber, envelope.id);
    canvas = nextPage.canvas;
    context = nextPage.context;
    y = pageMargin;
  };

  const ensureSpace = async (height: number) => {
    if (y + height <= contentBottom) {
      return;
    }

    await pushPage();
  };

  setFont(context, 22, '700');
  context.fillStyle = textColor;
  context.fillText('UA KEP Signing Protocol', pageMargin, y);
  y += 30;

  setFont(context, 10);
  context.fillStyle = mutedTextColor;
  y = drawWrappedText({
    context,
    text: 'Human-readable protocol for QES/AES signature evidence captured during this envelope completion.',
    x: pageMargin,
    y,
    maxWidth: pageWidth - pageMargin * 2,
    lineHeight: textLineHeight,
  });
  y += 18;

  y = drawSectionTitle(context, 'Envelope', y);

  const overviewRows = [
    ['Title', envelope.title],
    ['Envelope ID', envelope.id],
    ['Status', 'COMPLETED'],
    ['Created at', formatDate(envelope.createdAt, timeZone)],
    ['Completed at', formatDate(envelope.completedAt ?? generatedAt, timeZone)],
    ['Generated at', formatDate(generatedAt, timeZone)],
    ['Time zone', timeZone],
    ['Owner', `${envelope.user.name || 'N/A'} <${envelope.user.email}>`],
    ['Documents covered', String(envelope.envelopeItems.length)],
  ];

  for (const [label, value] of overviewRows) {
    await ensureSpace(32);
    const nextY = drawLabelValue({
      context,
      label,
      value,
      x: pageMargin,
      y,
      labelWidth: 118,
      valueWidth: pageWidth - pageMargin * 2 - 118,
    });

    y = Math.max(y + textLineHeight, nextY) + 5;
  }

  y += 12;
  await ensureSpace(44);
  y = drawSectionTitle(context, 'Signers', y);

  for (const session of sessions) {
    const cardHeight = measureSessionCardHeight(context, session, pageWidth - pageMargin * 2 - 132);
    await ensureSpace(cardHeight + 12);
    y = drawSessionCard({
      context,
      session,
      y,
      timeZone,
    });
    y += 12;
  }

  await ensureSpace(44);
  y = drawSectionTitle(context, 'Signature Artifacts', y);

  const artifacts = sessions.flatMap((session) => session.signatureArtifacts);

  for (const artifact of artifacts) {
    const cardHeight = measureArtifactCardHeight(context, artifact);
    await ensureSpace(cardHeight + 12);
    y = drawArtifactCard({
      context,
      artifact,
      y,
    });
    y += 12;
  }

  const finalBuffer = await canvas.toBuffer('pdf');
  pageBuffers.push(new Uint8Array(finalBuffer));

  const pdf = await PDF.merge(pageBuffers, {
    includeAnnotations: true,
  });

  return await pdf.save({ useXRefStream: true });
};

export const ensureUaKepSigningProtocolEnvelopeItem = async ({
  envelopeId,
  requestMetadata,
}: EnsureUaKepSigningProtocolEnvelopeItemOptions) => {
  const existingProtocol = await prisma.envelopeItem.findFirst({
    where: {
      envelopeId,
      title: UA_KEP_SIGNING_PROTOCOL_TITLE,
    },
    select: {
      id: true,
    },
  });

  if (existingProtocol) {
    return {
      created: false,
      envelopeItemId: existingProtocol.id,
    };
  }

  const [envelope, sessions] = await Promise.all([getProtocolEnvelope(envelopeId), getProtocolSessions(envelopeId)]);

  if (!envelope || sessions.length === 0) {
    return {
      created: false,
      envelopeItemId: null,
    };
  }

  const pdfBytes = await generateUaKepSigningProtocolPdf({
    envelope,
    sessions,
  });

  const { documentData } = await putPdfFileServerSide({
    name: UA_KEP_SIGNING_PROTOCOL_TITLE,
    type: 'application/pdf',
    arrayBuffer: async () => Promise.resolve(toArrayBuffer(pdfBytes)),
  });

  const envelopeItemId = prefixedId('envelope_item');
  const order = Math.max(0, ...envelope.envelopeItems.map((item) => item.order)) + 1;

  return prisma.$transaction(async (tx) => {
    const existingProtocolInTransaction = await tx.envelopeItem.findFirst({
      where: {
        envelopeId,
        title: UA_KEP_SIGNING_PROTOCOL_TITLE,
      },
      select: {
        id: true,
      },
    });

    if (existingProtocolInTransaction) {
      return {
        created: false,
        envelopeItemId: existingProtocolInTransaction.id,
      };
    }

    const envelopeItem = await tx.envelopeItem.create({
      data: {
        id: envelopeItemId,
        envelopeId,
        title: UA_KEP_SIGNING_PROTOCOL_TITLE,
        order,
        documentDataId: documentData.id,
      },
      select: {
        id: true,
      },
    });

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.ENVELOPE_ITEM_CREATED,
        envelopeId,
        data: {
          envelopeItemId: envelopeItem.id,
          envelopeItemTitle: UA_KEP_SIGNING_PROTOCOL_TITLE,
        },
        user: envelope.user,
        requestMetadata,
      }),
    });

    return {
      created: true,
      envelopeItemId: envelopeItem.id,
    };
  });
};
