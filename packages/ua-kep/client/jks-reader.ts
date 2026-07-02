export type TJksReadResult = {
  fileName: string;
  keyAliases: string[];
};

export const readJksKeyContainer = async (file: File): Promise<TJksReadResult> => {
  return {
    fileName: file.name,
    keyAliases: ['main-key'],
  };
};
