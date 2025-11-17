import { Settings as SettingsIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';

export function Settings() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="refresh-interval">Refresh Interval</Label>
            <select
              id="refresh-interval"
              className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="10">10 seconds</option>
              <option value="30" selected>
                30 seconds
              </option>
              <option value="60">1 minute</option>
              <option value="300">5 minutes</option>
            </select>
          </div>

          <div className="space-y-4">
            <Label>Alert Notifications</Label>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="critical-alerts" className="text-sm font-normal">
                  Critical alerts
                </Label>
                <Switch id="critical-alerts" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="warning-alerts" className="text-sm font-normal">
                  Warning alerts
                </Label>
                <Switch id="warning-alerts" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="info-alerts" className="text-sm font-normal">
                  Info alerts
                </Label>
                <Switch id="info-alerts" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TrueNAS Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-url">API URL</Label>
            <Input id="api-url" type="text" placeholder="http://truenas.local/api/v2.0" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input id="api-key" type="password" placeholder="Enter API key" />
          </div>

          <Button>Test Connection</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version:</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Build:</span>
              <span className="font-medium">Production</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Server:</span>
              <span className="font-medium">Connected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Uptime:</span>
              <span className="font-medium">2d 5h 23m</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button>Save Settings</Button>
        <Button variant="secondary">Reset to Defaults</Button>
      </div>
    </div>
  );
}
