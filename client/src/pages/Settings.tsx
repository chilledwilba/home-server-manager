import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { SettingsSkeleton } from '@/components/Settings/SettingsSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { apiClient } from '@/lib/api-client';

interface Settings {
  refreshInterval: number;
  alertNotifications: {
    critical: boolean;
    warning: boolean;
    info: boolean;
  };
  truenasUrl: string;
  truenasApiKey: string;
}

export function Settings() {
  const queryClient = useQueryClient();

  // Fetch settings
  const { data: response, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings(),
  });

  const settings = response?.data;

  // Local state for form
  const [formData, setFormData] = useState<Settings | null>(null);

  // Initialize form data when settings load
  useEffect(() => {
    if (settings && !formData) {
      setFormData(settings);
    }
  }, [settings, formData]);

  // Use form data or fallback to loaded settings
  const currentSettings = formData || settings;

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: Settings) => apiClient.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved successfully');
      setFormData(null); // Reset form data after successful save
    },
    onError: (error: Error) => {
      toast.error('Failed to save settings', {
        description: error.message,
      });
    },
  });

  const handleSave = () => {
    if (currentSettings) {
      updateMutation.mutate(currentSettings);
    }
  };

  const handleReset = () => {
    setFormData(settings || null);
    toast.info('Settings reset to last saved values');
  };

  if (isLoading) {
    return <SettingsSkeleton />;
  }

  if (!currentSettings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Failed to load settings</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h1>
      </div>

      <Card
        className="transition-shadow duration-200 hover:shadow-md animate-in fade-in"
        style={{ animationDelay: '100ms' }}
      >
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>Configure your monitoring preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refresh-interval">Refresh Interval</Label>
            <Select
              value={String(currentSettings.refreshInterval)}
              onValueChange={(value) =>
                setFormData({ ...currentSettings, refreshInterval: Number(value) })
              }
            >
              <SelectTrigger id="refresh-interval">
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Alert Notifications</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="critical-alerts" className="font-normal">
                  Critical alerts
                </Label>
                <Switch
                  id="critical-alerts"
                  checked={currentSettings.alertNotifications.critical}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...currentSettings,
                      alertNotifications: {
                        ...currentSettings.alertNotifications,
                        critical: checked,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="warning-alerts" className="font-normal">
                  Warning alerts
                </Label>
                <Switch
                  id="warning-alerts"
                  checked={currentSettings.alertNotifications.warning}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...currentSettings,
                      alertNotifications: {
                        ...currentSettings.alertNotifications,
                        warning: checked,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="info-alerts" className="font-normal">
                  Info alerts
                </Label>
                <Switch
                  id="info-alerts"
                  checked={currentSettings.alertNotifications.info}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...currentSettings,
                      alertNotifications: {
                        ...currentSettings.alertNotifications,
                        info: checked,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card
        className="transition-shadow duration-200 hover:shadow-md animate-in fade-in"
        style={{ animationDelay: '200ms' }}
      >
        <CardHeader>
          <CardTitle>TrueNAS Connection</CardTitle>
          <CardDescription>Configure your TrueNAS API connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-url">API URL</Label>
            <Input
              id="api-url"
              type="url"
              placeholder="http://truenas.local/api/v2.0"
              value={currentSettings.truenasUrl}
              onChange={(e) => setFormData({ ...currentSettings, truenasUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Enter API key"
              value={currentSettings.truenasApiKey}
              onChange={(e) => setFormData({ ...currentSettings, truenasApiKey: e.target.value })}
            />
          </div>
          <Button variant="outline">Test Connection</Button>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button size="lg" onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
        <Button variant="outline" size="lg" onClick={handleReset}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
