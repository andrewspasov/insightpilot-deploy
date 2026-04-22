import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { NtrTrack } from '@/types/ntr';
import { X } from 'lucide-react';

interface TrackFormDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (track: Partial<NtrTrack>) => void;
  track?: NtrTrack;
}

export function TrackFormDrawer({ isOpen, onClose, onSave, track }: TrackFormDrawerProps) {
  const [formData, setFormData] = useState<Partial<NtrTrack>>({
    name: '',
    keywords: [],
    marketRegion: 'Global',
    category: 'ecommerce',
    frequency: 'daily',
    status: 'active',
  });
  const [keywordInput, setKeywordInput] = useState('');

  useEffect(() => {
    if (track) {
      setFormData(track);
    } else {
      setFormData({
        name: '',
        keywords: [],
        marketRegion: 'Global',
        category: 'ecommerce',
        frequency: 'daily',
        status: 'active',
      });
    }
  }, [track, isOpen]);

  const handleAddKeyword = () => {
    if (keywordInput.trim() && formData.keywords) {
      setFormData({
        ...formData,
        keywords: [...formData.keywords, keywordInput.trim()],
      });
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index: number) => {
    if (formData.keywords) {
      setFormData({
        ...formData,
        keywords: formData.keywords.filter((_, i) => i !== index),
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{track ? 'Edit Track' : 'Create New Track'}</SheetTitle>
          <SheetDescription>
            Configure your trend monitoring track
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Track Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Standing Desks in EU"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords *</Label>
            <div className="flex gap-2">
              <Input
                id="keywords"
                placeholder="Add a keyword"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyPress={handleKeyPress}
              />
              <Button type="button" variant="secondary" onClick={handleAddKeyword}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {formData.keywords?.map((keyword, index) => (
                <Badge key={index} variant="secondary" className="gap-1">
                  {keyword}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => handleRemoveKeyword(index)}
                  />
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="region">Market Region</Label>
              <Select
                value={formData.marketRegion}
                onValueChange={(value) => setFormData({ ...formData, marketRegion: value })}
              >
                <SelectTrigger id="region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Global">Global</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="EU">Europe</SelectItem>
                  <SelectItem value="UK">United Kingdom</SelectItem>
                  <SelectItem value="APAC">Asia Pacific</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ecommerce">Ecommerce</SelectItem>
                  <SelectItem value="SaaS">SaaS</SelectItem>
                  <SelectItem value="info product">Info Product</SelectItem>
                  <SelectItem value="services">Services</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="frequency">Monitoring Frequency</Label>
            <Select
              value={formData.frequency}
              onValueChange={(value: 'daily' | 'weekly') => setFormData({ ...formData, frequency: value })}
            >
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {track ? 'Update Track' : 'Create Track'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
