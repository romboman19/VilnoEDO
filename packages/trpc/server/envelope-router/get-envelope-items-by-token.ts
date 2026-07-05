import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getEnvelopeWhereInput } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { getOrganisationTemplateWhereInput } from '@documenso/lib/server-only/template/get-organisation-template-by-id';
import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { maybeAuthenticatedProcedure } from '../trpc';
import {
  ZGetEnvelopeItemsByTokenRequestSchema,
  ZGetEnvelopeItemsByTokenResponseSchema,
} from './get-envelope-items-by-token.types';

// Not intended for V2 API usage.
// NOTE: THIS IS A PUBLIC PROCEDURE
export const getEnvelopeItemsByTokenRoute = maybeAuthenticatedProcedure
  .input(ZGetEnvelopeItemsByTokenRequestSchema)
  .output(ZGetEnvelopeItemsByTokenResponseSchema)
  .query(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    const { envelopeId, access } = input;

    ctx.logger.info({
      input: {
        envelopeId,
        access,
      },
    });

    if (access.type === 'user') {
      if (!user || !teamId) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, {
          message: 'User not found',
        });
      }

      const { envelopeItems: data } = await handleGetEnvelopeItemsByUser({
        envelopeId,
        userId: user.id,
        teamId,
      });

      return {
        data,
        uaKepEvidence: await getUaKepEvidenceDownload({ envelopeId }),
      };
    }

    const { envelopeItems: data } = await handleGetEnvelopeItemsByToken({
      envelopeId,
      token: access.token,
    });

    return {
      data,
      uaKepEvidence: await getUaKepEvidenceDownload({ envelopeId, recipientToken: access.token }),
    };
  });

const getUaKepEvidenceDownload = async ({
  envelopeId,
  recipientToken,
}: {
  envelopeId: string;
  recipientToken?: string;
}) => {
  const evidencePackage = await prisma.uaKepEvidencePackage.findFirst({
    where: {
      envelopeId,
      ...(recipientToken
        ? {
            recipient: {
              token: recipientToken,
            },
          }
        : {}),
    },
    select: {
      id: true,
      uaKepSessionId: true,
      recipient: {
        select: {
          id: true,
          token: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!evidencePackage) {
    return null;
  }

  const padesArtifacts = await prisma.uaKepSignatureArtifact.findMany({
    where: {
      uaKepSessionId: evidencePackage.uaKepSessionId,
      artifactType: { startsWith: 'PADES' },
    },
    select: {
      envelopeItemId: true,
    },
  });

  const padesEnvelopeItemIds = [...new Set(padesArtifacts.map((artifact) => artifact.envelopeItemId))];

  return {
    evidencePackageId: evidencePackage.id,
    recipientId: evidencePackage.recipient.id,
    recipientToken: evidencePackage.recipient.token,
    hasPades: padesEnvelopeItemIds.length > 0,
    padesEnvelopeItemIds,
  };
};

const handleGetEnvelopeItemsByToken = async ({ envelopeId, token }: { envelopeId: string; token: string }) => {
  const envelope = await prisma.envelope.findFirst({
    where: {
      id: envelopeId,
      type: EnvelopeType.DOCUMENT, // You cannot get template envelope items by token.
      recipients: {
        some: {
          token,
        },
      },
    },
    include: {
      envelopeItems: {
        include: {
          documentData: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  });

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Envelope could not be found',
    });
  }

  return {
    envelopeItems: envelope.envelopeItems,
  };
};

const handleGetEnvelopeItemsByUser = async ({
  envelopeId,
  userId,
  teamId,
}: {
  envelopeId: string;
  userId: number;
  teamId: number;
}) => {
  const { envelopeWhereInput, team: callerTeam } = await getEnvelopeWhereInput({
    id: {
      type: 'envelopeId',
      id: envelopeId,
    },
    type: null,
    userId,
    teamId,
  });

  // Try the standard team-scoped access path first (owner / current team / team email).
  let envelope = await prisma.envelope.findUnique({
    where: envelopeWhereInput,
    include: {
      envelopeItems: {
        include: {
          documentData: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
    },
  });

  // Fallback: if the envelope is an ORGANISATION template owned by a sibling team
  // in the caller's organisation, allow read access to the items metadata.
  // Mirrors the access logic used by `createDocumentFromTemplate` and the
  // file-download endpoint's `checkEnvelopeFileAccess` so this route stays in
  // sync with where actual file access is granted.
  if (!envelope) {
    envelope = await prisma.envelope.findFirst({
      where: getOrganisationTemplateWhereInput({
        id: { type: 'envelopeId', id: envelopeId },
        organisationId: callerTeam.organisationId,
        teamRole: callerTeam.currentTeamRole,
      }),
      include: {
        envelopeItems: {
          include: {
            documentData: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });
  }

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Envelope could not be found',
    });
  }

  return {
    envelopeItems: envelope.envelopeItems,
  };
};
