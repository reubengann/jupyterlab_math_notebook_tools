export type MathJaxMacroValue = string | [string, number];

export const BOLD_VECTOR_MACROS: Record<string, MathJaxMacroValue> = {
  vec: ['\\mathbf{#1}', 1]
};

export function normalizeMacros(
  macros: Record<string, unknown>,
  enableBoldVectorMacro = false
): Record<string, MathJaxMacroValue> {
  const normalized: Record<string, MathJaxMacroValue> = enableBoldVectorMacro
    ? { ...BOLD_VECTOR_MACROS }
    : {};

  for (const [name, value] of Object.entries(macros)) {
    if (!/^[A-Za-z]+$/.test(name)) {
      continue;
    }

    if (typeof value === 'string') {
      normalized[name] = value;
      continue;
    }

    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'number' &&
      Number.isInteger(value[1]) &&
      value[1] >= 0
    ) {
      normalized[name] = [value[0], value[1]];
    }
  }

  return normalized;
}

export function buildMathJaxSeed(
  macros: Record<string, MathJaxMacroValue>
): string {
  const definitions = Object.entries(macros).map(([name, value]) => {
    const [replacement, argumentCount] =
      typeof value === 'string' ? [value, 0] : value;
    const parameters = Array.from(
      { length: argumentCount },
      (_, index) => `#${index + 1}`
    ).join('');

    return `\\def\\${name}${parameters}{${replacement}}`;
  });

  return definitions.length > 0 ? `$$\n${definitions.join('\n')}\n$$` : '';
}
