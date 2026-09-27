import { useEffect, useState } from "react";
import {
  UserRound,
  Mail,
  Lock,
  Save,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
  CalendarDays,
  BadgeCheck,
  Hash,
  Activity,
  FileStack,
  UserPlus,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";
import {
  Card,
  Button,
  Badge,
  PageHeader,
  Alert,
  Input,
  Select,
  Label,
} from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";
import { formatDateTime } from "../lib/format";

export default function Profile() {
  const { user, profileLoading, refreshProfile, isAdmin } = useAuth();

  // ---- profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileStatus, setProfileStatus] = useState("");

  // ---- password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");

  // ---- account activity
  const [counts, setCounts] = useState({ documents: 0, predictions: 0 });

  // ---- admin user provisioning form
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("User");
  const [provisioningUser, setProvisioningUser] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  const [provisionStatus, setProvisionStatus] = useState("");

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setProvisionError("");
    setProvisionStatus("");
    setProvisioningUser(true);
    try {
      await apiClient.post("/auth/users", {
        full_name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        password: newUserPassword,
        role_name: newUserRole,
      });
      setProvisionStatus(`User account '${newUserEmail.trim().toLowerCase()}' provisioned successfully as ${newUserRole}.`);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("User");
    } catch (err) {
      setProvisionError(apiError(err, "Unable to create user account."));
    } finally {
      setProvisioningUser(false);
    }
  };

  // Seed the form once the profile arrives.
  useEffect(() => {
    if (user) {
      setFullName(user.fullName ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  useEffect(() => {
    apiClient
      .get("/predictions/stats")
      .then((response) =>
        setCounts({
          documents: response.data.total_documents,
          predictions: response.data.total_predictions,
        })
      )
      .catch(() => setCounts({ documents: 0, predictions: 0 }));
  }, []);

  const dirty =
    user && (fullName !== (user.fullName ?? "") || email !== (user.email ?? ""));

  const handleProfileSubmit = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileStatus("");
    setSavingProfile(true);

    try {
      // PATCH semantics: send only what actually changed.
      const payload = {};
      if (fullName !== user.fullName) payload.full_name = fullName;
      if (email !== user.email) payload.email = email;

      if (Object.keys(payload).length === 0) {
        setProfileStatus("Nothing to save.");
        return;
      }

      await apiClient.patch("/auth/me", payload);
      await refreshProfile();
      setProfileStatus("Profile updated.");
    } catch (err) {
      setProfileError(apiError(err, "Unable to update your profile."));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordStatus("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    setSavingPassword(true);

    try {
      await apiClient.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordStatus(
        "Password updated. Your current session stays signed in."
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(apiError(err, "Unable to change your password."));
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = (user?.fullName || user?.email || "U")
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <PageHeader
          eyebrow="Account"
          title="Profile settings"
          description="Manage your identity, credentials and account details."
        />

        {/* Identity banner */}
        <Card padding="p-0" className="relative overflow-hidden">
          <div className="h-28 bg-hero-gradient" />
          <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-volt-gradient text-2xl font-extrabold text-white ring-4 ring-void-800 transition-transform duration-300 hover:scale-105">
                {initials}
              </div>
              <div className="min-w-0 pb-1">
                {profileLoading && !user ? (
                  <Skeleton className="h-6 w-40" />
                ) : (
                  <p className="truncate text-lg font-bold text-slate-50">
                    {user?.fullName ?? "—"}
                  </p>
                )}
                <p className="truncate text-sm text-slate-400">{user?.email}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-1">
              <Badge tone="brand" dot>
                {user?.role ?? "…"}
              </Badge>
              <Badge tone={user?.isActive ? "success" : "danger"}>
                {user?.isActive ? "Active" : "Disabled"}
              </Badge>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            {/* Edit profile */}
            <Card>
              <div className="flex items-center gap-2.5">
                <span className="tile h-9 w-9">
                  <UserRound className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-50">Edit profile</p>
                  <p className="text-xs text-slate-400">
                    Your display name and sign-in email
                  </p>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      icon={UserRound}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Your name"
                      maxLength={100}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      icon={Mail}
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>

                {profileError && <Alert variant="error">{profileError}</Alert>}
                {profileStatus && (
                  <Alert variant="success">{profileStatus}</Alert>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    icon={Save}
                    loading={savingProfile}
                    disabled={!dirty}
                  >
                    Save changes
                  </Button>
                  {dirty && (
                    <button
                      type="button"
                      onClick={() => {
                        setFullName(user.fullName ?? "");
                        setEmail(user.email ?? "");
                        setProfileError("");
                        setProfileStatus("");
                      }}
                      className="text-sm font-semibold text-slate-500 transition-colors hover:text-slate-300"
                    >
                      Discard
                    </button>
                  )}
                </div>
              </form>
            </Card>

            {/* Change password */}
            <Card>
              <div className="flex items-center gap-2.5">
                <span className="tile h-9 w-9 bg-volt-gradient">
                  <KeyRound className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-50">Change password</p>
                  <p className="text-xs text-slate-400">
                    Requires your current password
                  </p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Current password</Label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      icon={Lock}
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent((prev) => !prev)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                      tabIndex={-1}
                      aria-label={showCurrent ? "Hide password" : "Show password"}
                    >
                      {showCurrent ? (
                        <EyeOff className="h-[18px] w-[18px]" />
                      ) : (
                        <Eye className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="newPassword" hint="min 8 characters">
                      New password
                    </Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        icon={Lock}
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        minLength={8}
                        className="pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                        tabIndex={-1}
                        aria-label={showNew ? "Hide password" : "Show password"}
                      >
                        {showNew ? (
                          <EyeOff className="h-[18px] w-[18px]" />
                        ) : (
                          <Eye className="h-[18px] w-[18px]" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="confirmPassword">Confirm new password</Label>
                    <Input
                      id="confirmPassword"
                      icon={Lock}
                      type={showNew ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                </div>

                {passwordError && <Alert variant="error">{passwordError}</Alert>}
                {passwordStatus && (
                  <Alert variant="success">{passwordStatus}</Alert>
                )}

                <Button
                  type="submit"
                  variant="volt"
                  icon={ShieldCheck}
                  loading={savingPassword}
                >
                  Update password
                </Button>
              </form>
            </Card>
          </div>

          {/* Account details */}
          <div className="space-y-5">
            <Card>
              <p className="text-sm font-bold text-slate-50">Account details</p>
              <div className="mt-4 space-y-2.5">
                {[
                  { icon: Hash, label: "User ID", value: user?.id ?? "—" },
                  {
                    icon: BadgeCheck,
                    label: "Role",
                    value: user?.role ?? "—",
                  },
                  {
                    icon: CalendarDays,
                    label: "Member since",
                    value: user?.createdAt ? formatDateTime(user.createdAt) : "—",
                  },
                ].map((row) => {
                  const Icon = row.icon;
                  return (
                    <div
                      key={row.label}
                      className="flex items-center gap-3 rounded-xl border border-line/8 bg-void-700/40 px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-neon-500/30"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-neon-400" />
                      <span className="flex-1 text-sm text-slate-400">
                        {row.label}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-50">
                        {row.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <p className="text-sm font-bold text-slate-50">Workspace activity</p>
              <p className="mt-1 text-xs text-slate-400">
                Totals across the system
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  {
                    icon: FileStack,
                    label: "Documents",
                    value: counts.documents,
                    tile: "bg-neon-gradient",
                  },
                  {
                    icon: Activity,
                    label: "Predictions",
                    value: counts.predictions,
                    tile: "bg-volt-gradient",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="group/stat rounded-2xl border border-line/8 bg-void-700/40 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-neon-500/30"
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.tile} transition-transform duration-200 group-hover/stat:scale-110`}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </span>
                      <p className="mt-3 text-xl font-bold text-slate-50">
                        {item.value}
                      </p>
                      <p className="text-xs text-slate-500">{item.label}</p>
                    </div>
                  );
                })}
              </div>
            </Card>

            {isAdmin && (
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neon-gradient text-white">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-50">
                      Provision User Account
                    </h2>
                    <p className="text-xs text-slate-400">
                      Create operator or analyst accounts directly as an Admin
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div>
                    <Label htmlFor="newUserName">Full Name</Label>
                    <Input
                      id="newUserName"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newUserEmail">Email Address</Label>
                    <Input
                      id="newUserEmail"
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="operator@deepshield.ai"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newUserPassword" hint="min 8 characters">
                      Initial Password
                    </Label>
                    <Input
                      id="newUserPassword"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newUserRole">Assigned Role</Label>
                    <Select
                      id="newUserRole"
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                    >
                      <option value="User">User (Standard Operator)</option>
                      <option value="Analyst">Analyst (Forensic Reviewer)</option>
                      <option value="Admin">Administrator (Full Privileges)</option>
                    </Select>
                  </div>

                  {provisionError && <Alert variant="error">{provisionError}</Alert>}
                  {provisionStatus && <Alert variant="success">{provisionStatus}</Alert>}

                  <Button
                    type="submit"
                    variant="primary"
                    loading={provisioningUser}
                    icon={UserPlus}
                    className="w-full"
                  >
                    Provision Account
                  </Button>
                </form>
              </Card>
            )}

            <Alert variant="info" title="Role changes need an administrator">
              Roles cannot be edited here — self-service escalation would defeat
              the access control. Use{" "}
              <code className="font-mono text-xs">scripts/create_admin.py</code>{" "}
              or the admin user management arriving in phase 11.
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}
