import { useState } from "react";
import { useLocation } from "wouter";
import { HeartHandshake, Loader2, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../store/AuthContext";

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { signIn, register } = useAuth();
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (mode === "register") await register(name, email, password);
      else await signIn(email, password);
      setLocation("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <HeartHandshake className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="font-serif text-3xl">{mode === "sign-in" ? "Welcome back" : "Create your account"}</CardTitle>
          <CardDescription>Sign in securely to access the care circles you belong to.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {mode === "register" && <div className="space-y-2"><Label htmlFor="name">Full name</Label><Input id="name" data-testid="input-name" value={name} onChange={(event) => setName(event.target.value)} required /></div>}
            <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" data-testid="input-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" data-testid="input-password" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
            {error && <p className="text-sm text-destructive" role="alert" data-testid="status-auth-error">{error}</p>}
            <Button className="w-full gap-2" type="submit" disabled={pending} data-testid="button-auth-submit">
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "sign-in" ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {mode === "sign-in" ? "Sign in" : "Register"}
            </Button>
          </form>
          <Button variant="link" className="w-full mt-3" onClick={() => { setMode(mode === "sign-in" ? "register" : "sign-in"); setError(null); }} data-testid="button-toggle-auth">
            {mode === "sign-in" ? "Need an account? Register" : "Already have an account? Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}