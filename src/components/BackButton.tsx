import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface Props {
  label?: string;
  to?: string;
}

export function BackButton({ label = "Voltar", to }: Props) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Button>
  );
}
