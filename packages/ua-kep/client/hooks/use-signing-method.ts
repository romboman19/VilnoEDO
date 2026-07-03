import { useState } from 'react';

import type { TUaKepSigningMethod } from '../../types/signing-methods';

export const useSigningMethod = (initialMethod: TUaKepSigningMethod = 'file-key') => {
  const [signingMethod, setSigningMethod] = useState<TUaKepSigningMethod>(initialMethod);

  return {
    signingMethod,
    setSigningMethod,
  };
};
