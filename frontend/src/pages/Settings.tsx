import { useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon, Save, Monitor, Mail, Shield, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('account');

  // Account settings
  const [name, setName] = useState('Sarah Johnson');
  const [email, setEmail] = useState('sarah.johnson@example.com');
  const [timezone, setTimezone] = useState('UTC-5');
  const [language, setLanguage] = useState('en');

  // Notification settings
  const [dailyTrendEmail, setDailyTrendEmail] = useState(true);
  const [weeklyReportEmail, setWeeklyReportEmail] = useState(true);
  const [importantAlerts, setImportantAlerts] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState(false);

  // Workspace settings
  const [companyName, setCompanyName] = useState('InsightPilot Inc.');
  const [website, setWebsite] = useState('https://insightpilot.com');
  const [industry, setIndustry] = useState('ecommerce');

  const handleSaveAccount = () => {
    toast({
      title: 'Settings saved',
      description: 'Your account settings have been updated successfully.',
    });
  };

  const handleChangePassword = () => {
    toast({
      title: 'Password change',
      description: 'Password change flow would open here.',
    });
  };

  const handleSaveWorkspace = () => {
    toast({
      title: 'Workspace updated',
      description: 'Your workspace settings have been saved.',
    });
  };

  return (
    <div className="space-y-6 animate-in">
      <PageHeader
        title="Settings"
        description="Manage your account preferences and workspace settings"
        icon={SettingsIcon}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="account" className="gap-2">
            <Monitor className="h-4 w-4" />
            Account
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Mail className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="workspace" className="gap-2">
            <Users className="h-4 w-4" />
            Workspace
          </TabsTrigger>
        </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Update your personal information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Contact support to change your email address
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Time Zone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTC-8">Pacific Time (UTC-8)</SelectItem>
                        <SelectItem value="UTC-5">Eastern Time (UTC-5)</SelectItem>
                        <SelectItem value="UTC+0">London (UTC+0)</SelectItem>
                        <SelectItem value="UTC+1">Central Europe (UTC+1)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleSaveAccount}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Password & Security</CardTitle>
                <CardDescription>
                  Manage your password and security preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-medium mb-2">Change Password</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Keep your account secure with a strong password
                  </p>
                  <Button onClick={handleChangePassword}>Change Password</Button>
                </div>

                <div className="pt-6 border-t">
                  <h4 className="font-medium mb-4">Active Sessions</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Current Session</p>
                        <p className="text-sm text-muted-foreground">
                          Chrome on MacOS • San Francisco, CA
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Last active: Just now
                        </p>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <p className="font-medium">Mobile App</p>
                        <p className="text-sm text-muted-foreground">
                          iOS App • San Francisco, CA
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Last active: 2 hours ago
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>
                  Choose what updates you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="daily-trend">Daily Trend Email</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive daily product trend updates
                    </p>
                  </div>
                  <Switch
                    id="daily-trend"
                    checked={dailyTrendEmail}
                    onCheckedChange={setDailyTrendEmail}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="weekly-report">Weekly Report Email</Label>
                    <p className="text-sm text-muted-foreground">
                      Get comprehensive weekly market reports
                    </p>
                  </div>
                  <Switch
                    id="weekly-report"
                    checked={weeklyReportEmail}
                    onCheckedChange={setWeeklyReportEmail}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="important-alerts">Important Account Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Security alerts and account notifications
                    </p>
                  </div>
                  <Switch
                    id="important-alerts"
                    checked={importantAlerts}
                    onCheckedChange={setImportantAlerts}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="price-alerts">Price Change Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when competitor prices change significantly
                    </p>
                  </div>
                  <Switch
                    id="price-alerts"
                    checked={priceAlerts}
                    onCheckedChange={setPriceAlerts}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workspace Tab */}
          <TabsContent value="workspace" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workspace Information</CardTitle>
                <CardDescription>
                  Manage your organization details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Company Name</Label>
                  <Input
                    id="company"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger id="industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ecommerce">E-commerce</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="technology">Technology</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleSaveWorkspace}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Workspace
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  Invite and manage team members
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Team collaboration features coming soon
                  </p>
                  <Badge variant="secondary">Pro Feature</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
      </Tabs>
    </div>
  );
}
