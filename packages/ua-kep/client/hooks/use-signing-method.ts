import { useState } from 'react';

import type { TUaKepSigningMethod } from '../../types/signing-methods';

export const useSigningMethod = (initialMethod: TUaKepSigningMethod = 'privatbank-jks') => {
  const [signingMethod, setSigningMethod] = useState<TUaKepSigningMethod>(initialMethod);

  return {
    signingMethod,
    setSigningMethod,
  };
};
