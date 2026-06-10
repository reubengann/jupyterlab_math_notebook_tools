import { extractDisplayEquations, wrapDisplayEquation } from '../tex';

describe('jupyterlab_math_notebook_tools', () => {
  it('extracts display equations in source order', () => {
    const equations = extractDisplayEquations(`
Some text

$$
g = h - Ts
$$

More text

\\[
F = ma
\\]

\\begin{align}
a &= b + c
\\end{align}
`);

    expect(equations.map(equation => equation.body)).toEqual([
      'g = h - Ts',
      'F = ma',
      'a &= b + c'
    ]);
  });

  it('does not double-count environments wrapped in display delimiters', () => {
    const equations = extractDisplayEquations(`
$$
\\begin{align}
a &= b
\\end{align}
$$
`);

    expect(equations).toHaveLength(1);
    expect(equations[0].source.trim()).toMatch(/^\$\$/);
  });

  it('extracts tagged eqnarray environments', () => {
    const equations = extractDisplayEquations(`
\\begin{eqnarray}
x &=& y \\tag{7-25}
\\end{eqnarray}
`);

    expect(equations).toHaveLength(1);
    expect(equations[0].source).toContain('\\tag{7-25}');
  });

  it('wraps bare equation bodies for clipboard use', () => {
    expect(wrapDisplayEquation('g = h - Ts')).toBe('$$\ng = h - Ts\n$$');
    expect(wrapDisplayEquation('$$\ng = h - Ts\n$$')).toBe(
      '$$\ng = h - Ts\n$$'
    );
  });
});
