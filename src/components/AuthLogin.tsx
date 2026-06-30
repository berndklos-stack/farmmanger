import { LogIn, Tractor } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const demoAccounts = [
  { labelKey: "auth.demoSupport", email: "support@schlaglink.app", password: "1234" },
  { labelKey: "auth.demoFarmer", email: "landwirt@schlaglink.app" },
  { labelKey: "auth.demoFarmerAndersson", email: "andersson@schlaglink.app", password: "1234" },
  { labelKey: "auth.demoDispatcher", email: "einsatzleiter@schlaglink.app" },
  { labelKey: "auth.demoBerndDispatcher", email: "bernd@kolaretorp.se", password: "1234" },
  { labelKey: "auth.demoNordDispatcher", email: "nord@schlaglink.app", password: "1234" },
  { labelKey: "auth.demoDriverMax", email: "max@schlaglink.app" },
  { labelKey: "auth.demoDriverJens", email: "jens@schlaglink.app" },
  { labelKey: "auth.demoDriverLisa", email: "lisa@schlaglink.app" },
  { labelKey: "auth.demoDriverTom", email: "tom@schlaglink.app" },
  { labelKey: "auth.demoDriverOlof", email: "olof@schlaglink.app" },
  { labelKey: "auth.demoDriverTobias", email: "tobias@schlaglink.app" },
];

export function AuthLogin({
  error,
  isLoading,
  onSignIn,
}: {
  error: string;
  isLoading: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("max@schlaglink.app");
  const [password, setPassword] = useState("schlaglink-demo");

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
          <h1>{t("auth.title")}</h1>
          <p className="auth-copy">{t("auth.copy")}</p>
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
          {demoAccounts.map((account) => (
            <button disabled={isLoading} key={account.email} onClick={() => useDemoAccount(account.email, account.password)} type="button">
              {t(account.labelKey)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
