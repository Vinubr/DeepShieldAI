import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import apiClient, { apiError } from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";
import AuthBrandPanel from "../components/AuthBrandPanel";
import { Button, Alert, Input, Label } from "../components/ui";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Return the user to whatever they were trying to reach before the
  // ProtectedRoute redirect sent them here.
  const from = location.state?.from?.pathname ?? "/dashboard";

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await apiClient.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      login(response.data.access_token);
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiError(err, "Unable to sign in. Check your credentials."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <AuthBrandPanel />

      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon-gradient shadow-tile">
              <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-50">
              DEEPSHIELD<span className="text-neon-400">AI</span>
            </span>
          </div>

          <p className="hud-label text-neon-400">Secure access</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-50">
            Welcome back
          </h1>
          <p className="mt-2.5 text-sm text-slate-400">
            Authenticate to reach the detection console.
          </p>

          <div className="mt-6 flex rounded-xl border border-line/10 bg-void-900/60 p-1">
            <div className="flex-1 rounded-lg bg-neon-gradient py-2 text-center text-sm font-semibold text-white shadow-tile">
              Sign in
            </div>
            <Link
              to="/register"
              className="flex-1 rounded-lg py-2 text-center text-sm font-semibold text-slate-400 transition hover:text-slate-100"
            >
              Create account
            </Link>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                icon={Mail}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  icon={Lock}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 transition hover:text-slate-300"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="error">
                <div className="space-y-1.5">
                  <p>{error}</p>
                  <p className="text-xs text-threat/90">
                    Want to create a new account?{" "}
                    <Link
                      to="/register"
                      state={{ email }}
                      className="font-bold underline hover:text-white"
                    >
                      Click here to register
                    </Link>
                  </p>
                </div>
              </Alert>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={loading}
              icon={!loading ? ArrowRight : undefined}
            >
              {loading ? "Authenticating…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Don&apos;t have an account yet?{" "}
            <Link
              to="/register"
              className="font-semibold text-neon-400 transition hover:text-neon-300"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
