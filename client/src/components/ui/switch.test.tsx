import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders without crashing', () => {
    const { container } = render(<Switch />);
    expect(container.querySelector('button')).toBeInTheDocument();
  });

  it('toggles state when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<Switch onCheckedChange={handleChange} />);

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('renders in checked state', () => {
    render(<Switch checked={true} />);

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'checked');
  });

  it('renders in unchecked state', () => {
    render(<Switch checked={false} />);

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'unchecked');
  });

  it('is disabled when disabled prop is true', () => {
    render(<Switch disabled />);

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toBeDisabled();
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<Switch disabled onCheckedChange={handleChange} />);

    const switchElement = screen.getByRole('switch');
    await user.click(switchElement);

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies custom className', () => {
    const { container } = render(<Switch className="custom-switch" />);

    const switchElement = container.querySelector('button');
    expect(switchElement).toHaveClass('custom-switch');
  });

  it('can be controlled', async () => {
    const user = userEvent.setup();
    let checked = false;
    const handleChange = vi.fn((newChecked: boolean) => {
      checked = newChecked;
    });

    const { rerender } = render(
      <Switch checked={checked} onCheckedChange={handleChange} />
    );

    const switchElement = screen.getByRole('switch');
    expect(switchElement).toHaveAttribute('data-state', 'unchecked');

    await user.click(switchElement);
    expect(handleChange).toHaveBeenCalledWith(true);

    // Simulate parent component updating the state
    rerender(<Switch checked={true} onCheckedChange={handleChange} />);
    expect(switchElement).toHaveAttribute('data-state', 'checked');
  });
});
