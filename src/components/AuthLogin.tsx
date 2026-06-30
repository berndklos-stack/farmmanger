import { LogIn, Tractor } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type LoginAppMode = "admin" | "driver" | "auto";

const demoAccounts = [
  { labelKey: "auth.demoSupport", email: "support@schlaglink.app", password: "1234", app: "admin" },
  { labelKey: "auth.demoFarmer", email: "landwirt@schlaglink.app", app: "admin" },
  { labelKey: "auth.demoFarmerAndersson", email: "andersson@schlaglink.app", password: "1234", app: "admin" },
  { labelKey: "auth.demoDispatcher", email: "einsatzleiter@schlaglink.app", app: "admin" },
  { labelKey: "auth.demoBerndDispatcher", email: "bernd@kolaretorp.se", password: "1234", app: "admin" },
  { labelKey: "auth.demoNordDispatcher", email: "nord@schlaglink.app", password: "1234", app: "admin" },
  { labelKey: "auth.demoDriverMax", email: "max@schlaglink.app", app: "driver" },
  { labelKey: "auth.demoDriverJens", email: "jens@schlaglink.app", app: "driver" },
  { labelKey: "auth.demoDriverLisa", email: "lisa@schlaglink.app", app: "driver" },
  { labelKey: "auth.demoDriverTom", email: "tom@schlaglink.app", app: "driver" },
  { labelKey: "auth.demoDriverOlof", email: "olof@schlaglink.app", app: "driver" },
  { labelKey: "auth.demoDriverTobias", email: "tobias@schlaglink.app", app: "driver" },
];

export function AuthLogin({
  appMode = "auto",
  error,
  isLoading,
  onSignIn,
}: {
  appMode?: LoginAppMode;
  error: string;
  isLoading: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const visibleDemoAccounts = demoAccounts.filter((account) => appMode === "auto" || account.app === appMode);
  const defaultDemoAccount = visibleDemoAccounts[0] ?? demoAccounts[0];
  const [email, setEmail] = useState(defaultDemoAccount.email);
  const [password, setPassword] = useState(defaultDemoAccount.password ?? "schlaglink-demo");

  async function submit() {
    await onSignIn(email.trim(), password);
  }

  async function useDemoAccount(nextEmail: string, nextPassword = "schlaglink-demo") {
    setEmail(nextEmail);
    setPassword(nextPassword);
    await onSignIn(nextEmail, nextPassword);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <Tractor size={24} />
          </div>
          <div>
            <strong>SchlagLink</strong>
            <span>{t("auth.subtitle")}</span>
          </div>
        </div>
        <div>
          <p className="eyebrow">{t("auth.eyebrow")}</p>
          <h1>{t(appMode === "driver" ? "auth.driverTitle" : appMode === "admin" ? "auth.adminTitle" : "auth.title")}</h1>
          <p className="auth-copy">{t(appMode === "driver" ? "auth.driverCopy" : appMode === "admin" ? "auth.adminCopy" : "auth.copy")}</p>
        </div>
        <div className="auth-form">
          <label>
            {t("auth.email")}
            <input autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </label>
          <label>
            {t("auth.password")}
            <input autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-action wide" disabled={isLoading} onClick={submit} type="button">
            <LogIn size={18} /> {isLoading ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </div>
        <div className="demo-login-grid">
          <span>{t("auth.demoAccounts")}</span>
          {visibleDemoAccounts.map((account) => (
            <button disabled={isLoading} key={account.email} onClick={() => useDemoAccount(account.email, account.password)} type="button">
              {t(account.labelKey)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
