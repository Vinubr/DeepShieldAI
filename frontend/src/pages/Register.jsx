import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, User, Eye, EyeOff, ShieldCheck, ArrowRight } from "lucide-react";
import apiClient, { apiError } from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";
import AuthBrandPanel from "../components/AuthBrandPanel";
import { Button, Alert, Input, Label } from "../components/ui";

export default function Register() {
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(location.state?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await apiClient.post("/auth/register", {
        full_name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      // Auto sign-in immediately so user never has to re-type credentials
      try {
        const loginRes = await apiClient.post("/auth/login", {
          email: email.trim().toLowerCase(),
          password,
        });
        login(loginRes.data.access_token);
        navigate("/dashboard", { replace: true });
        return;
      } catch {
        setMessage("Account created successfully. Redirecting to sign in…");
        setTimeout(() => navigate("/login"), 1200);
      }
    } catch (err) {
      setError(apiError(err, "Unable to register. Check your details."));
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

          <p className="hud-label text-volt-400">New operator</p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-50">
            Create your account
          </h1>
          <p className="mt-2.5 text-sm text-slate-400">
            Accounts are provisioned with the standard User role.
          </p>

          <div className="mt-6 flex rounded-xl border border-line/10 bg-void-900/60 p-1">
            <Link
              to="/login"
              className="flex-1 rounded-lg py-2 text-center text-sm font-semibold text-slate-400 transition hover:text-slate-100"
            >
              Sign in
            </Link>
            <div className="flex-1 rounded-lg bg-volt-500/15 py-2 text-center text-sm font-semibold text-volt-300 border border-volt-500/25">
              Create account
            </div>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                icon={User}
                value={name}
                onChange={(event) => setName(event.target.value)}
                type="text"
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </div>

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
              <Label htmlFor="password" hint="min 8 characters">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  icon={Lock}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  minLength={8}
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

            {error && <Alert variant="error">{error}</Alert>}
            {message && <Alert variant="success">{message}</Alert>}

            <Button
              type="submit"
              variant="volt"
              size="lg"
              className="w-full"
              loading={loading}
              icon={!loading ? ArrowRight : undefined}
            >
              {loading ? "Creating account…" : "Create account"}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Already registered?{" "}
            <Link
              to="/login"
              className="font-semibold text-volt-400 transition hover:text-volt-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
