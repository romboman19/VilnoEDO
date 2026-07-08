import { DeleteEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { prisma } from '@documenso/prisma';
import { EmailDomainStatus } from '@prisma/client';

import { DOCUMENSO_ENCRYPTION_KEY } from '../../constants/crypto';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { symmetricDecrypt } from '../../universal/crypto';
import { getSesClient, registerDomainIdentityWithDkim } from './ses-client';

type ReregisterEmailDomainOptions = {
  emailDomainId: string;
};

/**
 * Re-register an email domain in SES using the stored DKIM key pair.
 *
 * Deletes the current SES identity and recreates it with the same selector and
 * private key, so the operator's existing DNS records keep working. Status is
 * reset to PENDING until the next verification poll confirms it.
 *
 * Permission is assumed to be checked in the caller.
 */
export const reregisterEmailDomain = async ({ emailDomainId }: ReregisterEmailDomainOptions) => {
  const encryptionKey = DOCUMENSO_ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error('Missing DOCUMENSO_ENCRYPTION_KEY');
  }

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

      throw err;
    });

  const decryptedPrivateKeyBytes = symmetricDecrypt({
    key: encryptionKey,
    data: emailDomain.privateKey,
  });

  const decryptedPrivateKey = new TextDecoder().decode(decryptedPrivateKeyBytes);

  // The stored `selector` is the full record name
  // ("documenso-<org>._domainkey.<domain>"); SES wants just the leading label.
  const selector = emailDomain.selector.split('._domainkey.')[0];

  if (!selector) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Could not extract selector from email domain record',
    });
  }

  await registerDomainIdentityWithDkim(emailDomain.domain, selector, decryptedPrivateKey);

  return prisma.emailDomain.update({
    where: {
      id: emailDomainId,
    },
    data: {
      status: EmailDomainStatus.PENDING,
      lastVerifiedAt: new Date(),
    },
  });
};
