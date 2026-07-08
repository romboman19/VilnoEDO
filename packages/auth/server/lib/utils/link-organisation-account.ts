import { IS_BILLING_ENABLED } from '@documenso/lib/constants/app';
import {
  ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
  ORGANISATION_USER_ACCOUNT_TYPE,
} from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { addUserToOrganisation } from '@documenso/lib/server-only/organisation/accept-organisation-invitation';
import { ZOrganisationAccountLinkMetadataSchema } from '@documenso/lib/types/organisation';
import type { RequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prisma } from '@documenso/prisma';
import { UserSecurityAuditLogType } from '@prisma/client';

import { getOrganisationAuthenticationPortalOptions } from './organisation-portal';

export interface LinkOrganisationAccountOptions {
  token: string;
  requestMeta: RequestMetadata;
}

/**
 * Complete an organisation SSO account link/creation flow.
 *
 * Consumes the one-time verification token, links the OIDC account onto the
 * user (verifying their email and clearing any unverified password), and adds
 * them to the organisation when they aren't already a member.
 */
export const linkOrganisationAccount = async ({ token, requestMeta }: LinkOrganisationAccountOptions) => {
  if (!IS_BILLING_ENABLED()) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Billing is not enabled',
    });
  }

  // Consume the token immediately — it carries sensitive OAuth material.
  const verificationToken = await prisma.verificationToken.delete({
    where: {
      token,
      identifier: ORGANISATION_ACCOUNT_LINK_VERIFICATION_TOKEN_IDENTIFIER,
    },
    include: {
      user: {
        select: {
          id: true,
          emailVerified: true,
          accounts: {
            select: {
              provider: true,
              providerAccountId: true,
            },
          },
        },
      },
    },
  });

  if (!verificationToken) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Verification token not found, used or expired',
    });
  }

  if (verificationToken.completed) {
    throw new AppError('ALREADY_USED');
  }

  if (verificationToken.expires < new Date()) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Verification token not found, used or expired',
    });
  }

  const tokenMetadata = ZOrganisationAccountLinkMetadataSchema.safeParse(verificationToken.metadata);

  if (!tokenMetadata.success) {
    console.error('Invalid token metadata', tokenMetadata.error);

    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Verification token not found, used or expired',
    });
  }

  const user = verificationToken.user;
  const { organisationId, oauthConfig } = tokenMetadata.data;

  const { clientOptions, organisation } = await getOrganisationAuthenticationPortalOptions({
    type: 'id',
    organisationId,
  });

  const organisationMember = await prisma.organisationMember.findFirst({
    where: {
      userId: user.id,
      organisationId,
    },
  });

  const userAlreadyLinked = user.accounts.some(
    (account) => account.provider === clientOptions.id && account.providerAccountId === oauthConfig.providerAccountId,
  );

  if (organisationMember && userAlreadyLinked) {
    return;
  }

  if (!userAlreadyLinked) {
    await prisma.$transaction(async (tx) => {
      await tx.account.create({
        data: {
          type: ORGANISATION_USER_ACCOUNT_TYPE,
          provider: clientOptions.id,
          providerAccountId: oauthConfig.providerAccountId,
          access_token: oauthConfig.accessToken,
          expires_at: oauthConfig.expiresAt,
          token_type: 'Bearer',
          id_token: oauthConfig.idToken,
          userId: user.id,
        },
      });

      await tx.userSecurityAuditLog.create({
        data: {
          userId: user.id,
          ipAddress: requestMeta.ipAddress,
          userAgent: requestMeta.userAgent,
          type: UserSecurityAuditLogType.ORGANISATION_SSO_LINK,
        },
      });

      // An unverified account can't have a self-set password we trust; linking
      // via verified SSO verifies the email and drops that password so it can't
      // be used to sign in.
      if (!user.emailVerified) {
        await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            emailVerified: new Date(),
            password: null,
          },
        });
      }
    });
  }

  // Outside the transaction to avoid nesting and holding a connection across the
  // membership job's network I/O.
  if (!organisationMember) {
    await addUserToOrganisation({
      userId: user.id,
      organisationId,
      organisationGroups: organisation.groups,
      organisationMemberRole: organisation.organisationAuthenticationPortal.defaultOrganisationRole,
    });
  }
};
