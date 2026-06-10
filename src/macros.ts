import { IExtensionSettings } from './settings';

export type MathJaxMacro = string | [string, number] | unknown[];

export function normalizeMacros(
  macros: IExtensionSettings['mathMacros']
): Record<string, MathJaxMacro> {
  const normalized: Record<string, MathJaxMacro> = {};
  for (const [name, value] of Object.entries(macros)) {
    if (!isValidMacroName(name)) {
      continue;
    }
    if (typeof value === 'string') {
      normalized[name] = value;
      continue;
    }
    if (
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      (value.length === 1 || typeof value[1] === 'number')
    ) {
      normalized[name] = value;
    }
  }
  return normalized;
}

function isValidMacroName(name: string): boolean {
  return /^[A-Za-z]+$/.test(name);
}
