import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Flag, RefreshCw, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../ui/button';

export function QuickActions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRefreshAll = () => {
    queryClient.invalidateQueries();
    toast.success('Refreshing all data...');
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleRefreshAll}
        className="w-full justify-start gap-3 h-auto py-3"
        variant="secondary"
      >
        <RefreshCw className="w-5 h-5" />
        <span className="font-medium">Refresh All Data</span>
      </Button>

      <Button
        onClick={() => navigate('/alerts')}
        className="w-full justify-start gap-3 h-auto py-3"
        variant="outline"
      >
        <AlertCircle className="w-5 h-5" />
        <span className="font-medium">View All Alerts</span>
      </Button>

      <Button
        onClick={() => navigate('/feature-flags')}
        className="w-full justify-start gap-3 h-auto py-3"
        variant="outline"
      >
        <Flag className="w-5 h-5" />
        <span className="font-medium">Feature Flags</span>
      </Button>

      <Button
        onClick={() => navigate('/settings')}
        className="w-full justify-start gap-3 h-auto py-3"
        variant="outline"
      >
        <Settings className="w-5 h-5" />
        <span className="font-medium">System Settings</span>
      </Button>
    </div>
  );
}
