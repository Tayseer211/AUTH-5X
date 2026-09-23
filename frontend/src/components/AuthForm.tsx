"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check, Eye, EyeOff, QrCode, Receipt, Repeat } from "./icons";

type Mode = "signup" | "signin";
type AccountType = "personal" | "business";
type Errors = Partial<Record<"name" | "email" | "password", string>>;

const copy = {
  signup: {
    title: "Create your account",
    subtitle: "Start protecting your payments in under a minute.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/signin",
  },
  signin: {
    title: "Sign in to your account",
    subtitle: "Welcome back. Enter your details to continue.",
    submit: "Sign in",
    switchText: "New to fraud.auth?",
    switchLink: "Create an account",
    switchHref: "/signup",
  },
};

const passwordRules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One number", test: (p: string) => /\d/.test(p) },
  { label: "Upper and lower case letters", test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
];

const nextSteps = [
  { icon: Repeat, label: "Check a standing order", href: "/#products" },
  { icon: Receipt, label: "Scan a refund receipt", href: "/#products" },
  { icon: QrCode, label: "Verify a refund QR", href: "/#products" },
];

const cardClass =
  "rounded-2xl bg-white p-6 shadow-[0_30px_60px_-12px_rgb(50_50_93/0.25),0_18px_36px_-18px_rgb(0_0_0/0.3)] ring-1 ring-ink/5 sm:p-8";

const inputClass =
  "block w-full rounded-lg bg-white px-3.5 py-2.5 text-[15px] text-ink shadow-sm ring-1 ring-line transition outline-none placeholder:text-muted/70 focus:ring-2 focus:ring-brand aria-invalid:ring-red-400 aria-invalid:focus:ring-red-500";

function validate(mode: Mode, name: string, email: string, password: string): Errors {
  const errors: Errors = {};
  if (mode === "signup" && !name.trim()) errors.name = "Enter your full name.";
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = "Enter a valid email, like name@example.com.";
  if (!password) errors.password = "Enter your password.";
  else if (mode === "signup" && !passwordRules.every((r) => r.test(password)))
    errors.password = "Your password doesn’t meet all the requirements yet.";
  return errors;
}

function Field({
  id,
  label,
  error,
  aside,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {aside}
      </div>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[13px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 animate-spin" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Success({ mode, name }: { mode: Mode; name: string }) {
  const firstName = name.trim().split(/\s+/)[0];

  return (
    <div className={cardClass}>
      <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-6" strokeWidth={3} />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">
        {mode === "signup"
          ? `Welcome to fraud.auth${firstName ? `, ${firstName}` : ""}`
          : "You’re signed in"}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-body">
        {mode === "signup"
          ? "Your account is ready. Here’s where most people start:"
          : "Welcome back. Pick up where you left off."}
      </p>

      {mode === "signup" && (
        <ul className="mt-6 divide-y divide-line rounded-xl ring-1 ring-line">
          {nextSteps.map(({ icon: Icon, label, href }) => (
            <li key={label}>
              <Link
                href={href}
                className="group flex items-center gap-3 px-4 py-3.5 text-[15px] font-medium text-ink transition-colors hover:bg-surface"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="size-4.5" />
                </span>
                {label}
                <ArrowRight className="ml-auto size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/"
        className="group mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-white shadow-lg shadow-brand/25 transition-colors hover:bg-brand-dark"
      >
        Go to homepage
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

export function AuthForm({ mode }: { mode: Mode }) {
  const t = copy[mode];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Re-check a field as the user fixes it, once it has shown an error.
  const recheck = (next: { name?: string; email?: string; password?: string }) => {
    if (Object.keys(errors).length === 0) return;
    const fresh = validate(
      mode,
      next.name ?? name,
      next.email ?? email,
      next.password ?? password,
    );
    setErrors((prev) => {
      const kept: Errors = {};
      for (const key of Object.keys(prev) as (keyof Errors)[]) {
        if (fresh[key]) kept[key] = fresh[key];
      }
      return kept;
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validate(mode, name, email, password);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = (["name", "email", "password"] as const).find((k) => found[k]);
      if (first) document.getElementById(first)?.focus();
      return;
    }
    // No account backend yet: simulate the request so the flow can be tried end to end.
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      setDone(true);
    }, 900);
  };

  if (done) return <Success mode={mode} name={name} />;

  return (
    <>
      <div className={cardClass}>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-1.5 text-[15px] text-body">{t.subtitle}</p>

        <form noValidate onSubmit={onSubmit} className="mt-7 space-y-5">
          {mode === "signup" && (
            <>
              <fieldset>
                <legend className="text-sm font-medium text-ink">
                  How will you use fraud.auth?
                </legend>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1 ring-1 ring-line">
                  {(
                    [
                      { value: "personal", label: "Personal" },
                      { value: "business", label: "Business" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`cursor-pointer rounded-md px-3 py-2 text-center text-sm font-semibold transition has-focus-visible:ring-2 has-focus-visible:ring-brand ${
                        accountType === opt.value
                          ? "bg-white text-ink shadow-sm ring-1 ring-ink/5"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <input
                        type="radio"
                        name="accountType"
                        value={opt.value}
                        checked={accountType === opt.value}
                        onChange={() => setAccountType(opt.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <Field
                id="name"
                label={accountType === "business" ? "Your full name" : "Full name"}
                error={errors.name}
              >
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    recheck({ name: e.target.value });
                  }}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? "name-error" : undefined}
                  className={inputClass}
                />
              </Field>
            </>
          )}

          <Field
            id="email"
            label={mode === "signup" && accountType === "business" ? "Work email" : "Email"}
            error={errors.email}
          >
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                recheck({ email: e.target.value });
              }}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              className={inputClass}
            />
          </Field>

          <Field id="password" label="Password" error={errors.password}>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  recheck({ password: e.target.value });
                }}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={
                  [mode === "signup" && "password-rules", errors.password && "password-error"]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            {mode === "signup" && (
              <ul id="password-rules" className="mt-2.5 space-y-1">
                {passwordRules.map((rule) => {
                  const met = rule.test(password);
                  return (
                    <li
                      key={rule.label}
                      className={`flex items-center gap-1.5 text-[13px] transition-colors ${
                        met ? "text-emerald-600" : "text-muted"
                      }`}
                    >
                      {met ? (
                        <Check className="size-3.5" strokeWidth={2.75} />
                      ) : (
                        <span className="mx-[5px] size-1 rounded-full bg-current" />
                      )}
                      {rule.label}
                      <span className="sr-only">{met ? "(done)" : "(not yet)"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Field>

          {mode === "signin" && (
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                defaultChecked
                className="size-4 rounded border-line accent-brand"
              />
              Keep me signed in on this device
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="group flex w-full items-center justify-center gap-1.5 rounded-full bg-brand px-5 py-3 text-[15px] font-semibold text-white shadow-lg shadow-brand/25 transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-80"
          >
            {submitting ? (
              <>
                <Spinner />
                {mode === "signup" ? "Creating account…" : "Signing in…"}
              </>
            ) : (
              <>
                {t.submit}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="mt-6 rounded-xl bg-white/70 px-4 py-3.5 text-center text-sm text-body ring-1 ring-ink/5 backdrop-blur">
        {t.switchText}{" "}
        <Link href={t.switchHref} className="font-semibold text-brand hover:text-brand-dark">
          {t.switchLink}
        </Link>
      </p>
    </>
  );
}
