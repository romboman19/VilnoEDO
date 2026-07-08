import { DeleteEmailIdentityCommand } from '@aws-sdk/client-sesv2';

import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { getSesClient } from './ses-client';

type DeleteEmailDomainOptions = {
  emailDomainId: string;
};

/**
 * Delete the email domain and its SES identity.
 *
 * Permission is assumed to be checked in the caller. A missing SES identity is
 * treated as already gone so the DB row is still removed.
 */
export const deleteEmailDomain = async ({ emailDomainId }: DeleteEmailDomainOptions) => {
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

  await getSesClient()
    .send(
      new DeleteEmailIdentityCommand({
        EmailIdentity: emailDomain.domain,
      }),
    )
    .catch((err) => {
      if (err.name === 'NotFoundException') {
        return;
      }

      console.error(err);
    });

  await prisma.emailDomain.delete({
    where: {
      id: emailDomainId,
    },
  });
};
