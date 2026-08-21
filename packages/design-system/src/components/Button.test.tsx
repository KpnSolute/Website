import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label and responds to clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Sign in</Button>);
    const button = screen.getByRole('button', { name: 'Sign in' });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button and marks it busy while loading', () => {
    render(<Button loading>Submitting</Button>);
    const button = screen.getByRole('button', { name: /submitting/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
