import { CreateEmailIdentityCommand, SESv2Client } from '@aws-sdk/client-sesv2';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { env } from '../../utils/env';

/**
 * Build an AWS SESv2 client from the instance SES credentials.
 *
 * Throws when any of the three required env vars is missing so callers surface
 * a clear configuration error instead of an opaque AWS SDK failure.
 */
export const getSesClient = () => {
  const accessKeyId = env('NEXT_PRIVATE_SES_ACCESS_KEY_ID');
  const secretAccessKey = env('NEXT_PRIVATE_SES_SECRET_ACCESS_KEY');
  const region = env('NEXT_PRIVATE_SES_REGION');

  if (!accessKeyId || !secretAccessKey || !region) {
    throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
      message: 'Missing AWS SES credentials',
    });
  }

  return new SESv2Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
};

/**
 * Register (or re-register) an SES email identity for `domain` using a
 * caller-supplied DKIM selector and private key (BYODKIM).
 */
export const registerDomainIdentityWithDkim = async (domain: string, selector: string, privateKey: string) => {
  const command = new CreateEmailIdentityCommand({
    EmailIdentity: domain,
    DkimSigningAttributes: {
      DomainSigningSelector: selector,
      DomainSigningPrivateKey: privateKey,
    },
  });

  return getSesClient().send(command);
};
