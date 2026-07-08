import { GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { getSesClient } from './ses-client';

/**
 * Poll SES for the current verification status of a domain identity and mirror
 * it onto the stored `EmailDomain` row (ACTIVE once SES reports SUCCESS).
 */
export const verifyEmailDomain = async (emailDomainId: string) => {
  const emailDomain = await prisma.emailDomain.findUnique({
    where: {
      id: emailDomainId,
    },
  });

  if (!emailDomain) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Email domain not found',
    });
  }

  const response = await getSesClient().send(
    new GetEmailIdentityCommand({
      EmailIdentity: emailDomain.domain,
    }),
  );

  const isVerified = response.VerificationStatus === 'SUCCESS';

  const updatedEmailDomain = await prisma.emailDomain.update({
    where: {
      id: emailDomainId,
    },
    data: {
      status: isVerified ? EmailDomainStatus.ACTIVE : EmailDomainStatus.PENDING,
      lastVerifiedAt: new Date(),
    },
  });

  return {
    emailDomain: updatedEmailDomain,
    isVerified,
  };
};
