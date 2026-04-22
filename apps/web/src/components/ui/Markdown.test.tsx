import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Markdown from './Markdown';

describe('Markdown', () => {
  it('renders plain text', () => {
    render(<Markdown>Hola mundo</Markdown>);
    expect(screen.getByText('Hola mundo')).toBeInTheDocument();
  });

  it('renders markdown bold', () => {
    const { container } = render(<Markdown>{'Esto es **negrita**'}</Markdown>);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.textContent).toBe('negrita');
  });

  it('renders GFM task lists (remark-gfm)', () => {
    const { container } = render(
      <Markdown>{'- [x] Hecho\n- [ ] Pendiente'}</Markdown>,
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
  });

  it('opens links in new tab', () => {
    const { container } = render(
      <Markdown>{'[foody](https://example.com)'}</Markdown>,
    );
    const a = container.querySelector('a');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });
});
