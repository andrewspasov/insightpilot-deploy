import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { NtrTrack } from "@/types/ntr";
import { TrendingUp, Clock, MapPin, Edit, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface TrackCardProps {
  track: NtrTrack;

  // Called when user clicks "Edit settings"
  onEdit: (track: NtrTrack) => void;

  // Called when user flips the switch
  // We send back the id AND the new status
  onToggleStatus?: (id: string, newStatus: "active" | "paused") => void;

  // Called when user clicks the trash icon
  onDelete?: (id: string) => void;
}

export function TrackCard({ track, onEdit, onToggleStatus, onDelete }: TrackCardProps) {
  // Helper to handle the switch change and compute the next status
  const handleStatusChange = (checked: boolean) => {
    const nextStatus: "active" | "paused" = checked ? "active" : "paused";
    onToggleStatus?.(track.id, nextStatus);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    // Stop the click from triggering any parent "onClick" on the card
    e.stopPropagation();
    onDelete?.(track.id);
  };

  return (
    <Card className="hover-lift cursor-pointer">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{track.name}</CardTitle>

          <div className="flex flex-col items-end gap-2">
            {/* Status switch */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {track.status === "active" ? "Active" : "Paused"}
              </span>
              <Switch
                checked={track.status === "active"}
                // Sends the new status up to the parent
                onCheckedChange={handleStatusChange}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Delete icon */}
            <button
              type="button"
              onClick={handleDeleteClick}
              className="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
              aria-label="Delete track"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {track.keywords.slice(0, 3).map((keyword, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {keyword}
            </Badge>
          ))}
          {track.keywords.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{track.keywords.length - 3}
            </Badge>
          )}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{track.marketRegion}</span>
            <span className="text-xs">•</span>
            <span className="capitalize">{track.category}</span>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="capitalize">{track.frequency}</span>
          </div>

          {track.lastRunAt && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">
                Last run{" "}
                {formatDistanceToNow(new Date(track.lastRunAt), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(track);
          }}
        >
          <Edit className="h-3.5 w-3.5 mr-2" />
          Edit Settings
        </Button>
      </CardFooter>
    </Card>
  );
}