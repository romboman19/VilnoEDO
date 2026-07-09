import { prisma } from '@documenso/prisma';

type CheckStatus = 'ok' | 'warning' | 'error';

// VilnoEDO is UA-only: the legally meaningful signature is the Ukrainian
// КЕП/УЕП/electronic seal created client-side via IIT. The upstream Documenso
// instance .p12 seal is not part of this flow, so health does not check for it.
export const loader = async () => {
  const checks: {
    database: { status: CheckStatus };
  } = {
    database: { status: 'ok' },
  };

  let overallStatus: CheckStatus = 'ok';

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    checks.database = { status: 'error' };
    overallStatus = 'error';
  }

  return Response.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: overallStatus === 'error' ? 500 : 200 },
  );
};
