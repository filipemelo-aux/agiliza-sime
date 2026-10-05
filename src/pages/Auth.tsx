import "@fontsource/exo/800-italic.css";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ForcePasswordChangeDialog } from "@/components/ForcePasswordChangeDialog";
import { z } from "zod";
import agilizaLogo from "@/assets/brand/agiliza-tms-logo.png";
import fsmLogo from "@/assets/brand/fsm-systems-logo-horizontal.png";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForceChange, setShowForceChange] = useState(false);
  const [pendingRedirectUserId, setPendingRedirectUserId] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleRedirectAfterAuth = async (userId: string) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const isAdmin = roles?.some((r) => r.role === "admin");
    const isModerator = roles?.some((r) => r.role === "moderator");
    const isOperador = roles?.some((r) => r.role === "operador");

    const isConsultor = roles?.some((r) => r.role === "consultor");
    if (roles?.some((r) => r.role === "superadmin")) {
      navigate("/superadmin");
    } else if (isAdmin || isModerator || isOperador || isConsultor) {
      navigate("/admin");
    } else {
      await supabase.auth.signOut();
      toast({ title: "Acesso não liberado", description: "Seu usuário ainda não possui perfil de acesso ao sistema.", variant: "destructive" });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // Don't redirect if user must change password
          if (session.user.user_metadata?.must_change_password) return;
          setTimeout(() => {
            handleRedirectAfterAuth(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        if (session.user.user_metadata?.must_change_password) {
          setPendingRedirectUserId(session.user.id);
          setShowForceChange(true);
          return;
        }
        handleRedirectAfterAuth(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const finalValue = name === "email" ? value.toLowerCase() : value;
    setFormData((prev) => ({ ...prev, [name]: finalValue }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      loginSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
        return;
      }
    }

    setLoading(true);

    try {
      const { data: signInData, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast({
            title: "Credenciais inválidas",
            description: "Verifique seu e-mail e senha.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      // Check if user must change password
      if (signInData?.user?.user_metadata?.must_change_password) {
        setPendingRedirectUserId(signInData.user.id);
        setShowForceChange(true);
        return;
      }

      toast({
        title: "Bem-vindo de volta!",
        description: "Login realizado com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Ocorreu um erro. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = forgotEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        title: "E-mail inválido",
        description: "Informe o e-mail da sua conta para receber o link de redefinição.",
        variant: "destructive",
      });
      return;
    }

    setForgotSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotOpen(false);
      toast({
        title: "Link enviado",
        description: "Verifique sua caixa de entrada para redefinir a senha.",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível enviar o link de redefinição.",
        variant: "destructive",
      });
    } finally {
      setForgotSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
      <div className="max-w-md w-full mx-auto">
        <div className="flex flex-col items-center mb-8">
          <img
            src={agilizaLogo}
            alt="Agiliza TMS"
            width={1142}
            height={202}
            className="mb-4 h-auto w-full max-w-sm object-contain"
          />
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-medium text-muted-foreground">by</span>
            <img src={fsmLogo} alt="FSM Sistemas" className="h-5 w-auto object-contain" />
          </div>
          <p className="text-sm text-muted-foreground">Acesse sua conta</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="seu@email.com"
              value={formData.email}
              onChange={handleChange}
              className="input-transport"
              disabled={loading}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                className="input-transport pr-12"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>

          <Button
            type="submit"
            className=" w-full py-6 text-base"
            disabled={loading}
          >
            {loading ? "Carregando..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-primary hover:underline font-medium"
          >
            Esqueceu sua senha?
          </button>
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>
              Informe o e-mail da sua conta. Enviaremos um link para você definir uma nova senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">E-mail</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={forgotSending}
              onClick={handleForgotPassword}
            >
              {forgotSending ? "Enviando..." : "Enviar link de redefinição"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ForcePasswordChangeDialog
        open={showForceChange}
        onChanged={() => {
          setShowForceChange(false);
          if (pendingRedirectUserId) {
            handleRedirectAfterAuth(pendingRedirectUserId);
          }
        }}
      />
    </div>
  );
}
