/**
 * Repairs model output that is JSON wrapped in markdown code fences or
 * surrounded by prose. Some OpenAI-compatible providers (e.g. Ollama cloud
 * models) do not enforce `response_format: json_schema` and return
 * ```json ... ``` blocks instead of raw JSON, which breaks `generateObject`.
 *
 * Intended for the `experimental_repairText` option of `generateObject`.
 */
export const repairJsonText = async ({ text }: { text: string }): Promise<string | null> => {
  const trimmed = text.trim();

  // Prefer the contents of a fenced code block when present.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

  const candidate = (fenceMatch ? fenceMatch[1] : trimmed).trim();

  if (candidate.startsWith('{') || candidate.startsWith('[')) {
    return candidate;
  }

  // Fall back to extracting the outermost JSON object or array.
  const start = candidate.search(/[{[]/);

  if (start === -1) {
    return null;
  }

  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(close);

  if (end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
};
