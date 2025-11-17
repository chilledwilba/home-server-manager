import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { QuickActions } from './QuickActions';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('QuickActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all action buttons', () => {
    render(<QuickActions />);

    expect(screen.getByText('Refresh All Data')).toBeInTheDocument();
    expect(screen.getByText('View All Alerts')).toBeInTheDocument();
    expect(screen.getByText('Feature Flags')).toBeInTheDocument();
    expect(screen.getByText('System Settings')).toBeInTheDocument();
  });

  it('refreshes all data when refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);

    const refreshButton = screen.getByText('Refresh All Data');
    await user.click(refreshButton);

    expect(toast.success).toHaveBeenCalledWith('Refreshing all data...');
  });

  it('navigates to alerts page when alerts button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);

    const alertsButton = screen.getByText('View All Alerts');
    await user.click(alertsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/alerts');
  });

  it('navigates to feature flags page when feature flags button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);

    const featureFlagsButton = screen.getByText('Feature Flags');
    await user.click(featureFlagsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/feature-flags');
  });

  it('navigates to settings page when settings button is clicked', async () => {
    const user = userEvent.setup();
    render(<QuickActions />);

    const settingsButton = screen.getByText('System Settings');
    await user.click(settingsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/settings');
  });

  it('renders buttons with correct variants', () => {
    const { container } = render(<QuickActions />);

    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(4);

    // Refresh button should have secondary variant
    expect(buttons[0]).toHaveClass('bg-secondary');

    // Other buttons should have outline variant
    expect(buttons[1]).toHaveClass('border');
    expect(buttons[2]).toHaveClass('border');
    expect(buttons[3]).toHaveClass('border');
  });

  it('displays icons for each action', () => {
    const { container } = render(<QuickActions />);

    // Check for SVG icons (lucide-react renders SVGs)
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });
});
