import { useState, useEffect } from "react";
import { User } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserAvatarProps {
  userId: string;
  showName?: boolean;
  size?: "sm" | "md" | "lg";
}

export function UserAvatar({ userId, showName = false, size = "md" }: UserAvatarProps) {
  const [profile, setProfile] = useState<{ full_name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (data) {
        setProfile(data);
      }
    };

    fetchProfile();
  }, [userId]);

  const sizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-12 w-12",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  return (
    <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
      <Avatar className={sizeClasses[size]}>
        {profile?.avatar_url && (
          <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
        )}
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
          {profile?.full_name ? getInitials(profile.full_name) : <User className={iconSizes[size]} />}
        </AvatarFallback>
      </Avatar>
      {showName && profile && (
        <span className="text-sm font-medium text-foreground hidden lg:block max-w-24 truncate">
          {profile.full_name.split(" ")[0]}
        </span>
      )}
    </Link>
  );
}
