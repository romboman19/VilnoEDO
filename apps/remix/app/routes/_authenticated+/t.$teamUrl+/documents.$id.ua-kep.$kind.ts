import { getSession } from '@documenso/auth/server/lib/utils/get-session';
import { getEnvelopeById } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';
import { ensureUaKepSigningProtocolEnvelopeItem } from '@documenso/lib/server-only/ua-kep/signing-protocol';
import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';
import { buildUaKepEvidenceArchive } from '@vilnoedo/ua-kep/server/evidence-archive';

import type { Route } from './+types/documents.$id.ua-kep.$kind';

const sanitizeDownloadName = (name: string) => {
  const sanitized = Array.from(name, (char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);

  return sanitized || 'document';
};

const toArrayBuffer = (bytes: Uint8Array) => {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const getAttachmentHeaders = (contentType: string, downloadName: string) => {
  return {
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
  };
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const { id, kind, teamUrl } = params;

  if (!id || !teamUrl || (kind !== 'pades' && kind !== 'archive')) {
    throw new Response('Not Found', { status: 404 });
  }

  const { user } = await getSession(request);
  const team = await getTeamByUrl({ userId: user.id, teamUrl });

  const envelope = await getEnvelopeById({
    id: {
      type: 'envelopeId',
      id,
    },
    type: EnvelopeType.DOCUMENT,
    userId: user.id,
    teamId: team.id,
  }).catch(() => null);

  if (!envelope) {
    throw new Response('Not Found', { status: 404 });
  }

  const evidencePackage = await prisma.uaKepEvidencePackage.findFirst({
    where: {
      envelopeId: envelope.id,
    },
    select: {
      id: true,
      recipientId: true,
      uaKepSessionId: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!evidencePackage) {
    throw new Response('Not Found', { status: 404 });
  }

  if (kind === 'pades') {
    const url = new URL(request.url);
    const envelopeItemId = url.searchParams.get('envelopeItemId');

    const padesArtifact = await prisma.uaKepSignatureArtifact.findFirst({
      where: {
        uaKepSessionId: evidencePackage.uaKepSessionId,
        artifactType: { startsWith: 'PADES' },
        ...(envelopeItemId ? { envelopeItemId } : {}),
      },
      select: {
        signatureBase64: true,
        envelopeItem: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        envelopeItemId: 'asc',
      },
    });

    if (!padesArtifact) {
      throw new Response('Not Found', { status: 404 });
    }

    const pdfBytes = Buffer.from(padesArtifact.signatureBase64.replace(/\s/g, ''), 'base64');
    const downloadName = `${sanitizeDownloadName(padesArtifact.envelopeItem.title)}-pades.pdf`;

    return new Response(toArrayBuffer(pdfBytes), {
      headers: getAttachmentHeaders('application/pdf', downloadName),
    });
  }

  const recipient = await prisma.recipient.findUnique({
    where: {
      id: evidencePackage.recipientId,
    },
    select: {
      token: true,
    },
  });

  if (!recipient) {
    throw new Response('Not Found', { status: 404 });
  }

  await ensureUaKepSigningProtocolEnvelopeItem({
    envelopeId: envelope.id,
  });

  const archive = await buildUaKepEvidenceArchive({
    prisma,
    input: {
      evidencePackageId: evidencePackage.id,
      envelopeId: envelope.id,
      recipientId: evidencePackage.recipientId,
      recipientToken: recipient.token,
    },
  });

  if (!archive) {
    throw new Response('Not Found', { status: 404 });
  }

  const downloadName = `${sanitizeDownloadName(envelope.title)}-ua-kep-evidence.zip`;

  return new Response(toArrayBuffer(archive.zipBytes), {
    headers: getAttachmentHeaders('application/zip', downloadName),
  });
}
