"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  HardHat,
  LogIn,
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff
} from "lucide-react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      window.location.assign(result?.url?.includes("/dashboard") ? result.url : "/dashboard");
    }
  };

  return (
    <main className="pmc-split-login-page">
      <section className="pmc-split-login-shell" aria-label="PMC CONNEXT login">
        <aside className="pmc-split-visual">
          <div className="pmc-split-visual-overlay" />

          <div className="pmc-visual-brand">
            <span className="pmc-visual-brand-main">PICHAYAMONGKOL</span>
            <span className="pmc-visual-brand-sub">construction co. ltd</span>
          </div>

          <div className="pmc-visual-copy">
            <div className="pmc-system-brand">
              <span className="pmc-system-overline">Project Command Center</span>
              <strong>PMC CONNEXT</strong>
              <small>Construction Operations Platform</small>
              <em>Plan · Finance · RFI/RFA · QC · Site Reports</em>
            </div>
          </div>

          <div className="pmc-visual-modules" aria-label="ระบบหลัก">
            <article>
              <ShieldCheck size={20} />
              <span>Role-based access</span>
            </article>
            <article>
              <HardHat size={20} />
              <span>Site operations</span>
            </article>
            <article>
              <BriefcaseBusiness size={20} />
              <span>Project modules</span>
            </article>
          </div>

          <div className="pmc-visual-footnote">
            <span>Secure project access</span>
            <span>Plan · Finance · RFI/RFA · QC</span>
          </div>
        </aside>

        <section className="pmc-auth-panel">
          <div className="pmc-auth-mobile-bg" />

          <div className="pmc-auth-card">
            <div className="pmc-auth-logo-block">
              <span className="pmc-auth-logo-wrap">
                <Image src="/pichayamongkol-logo-transparent.png" alt="Pichayamongkol Construction" width={320} height={76} priority className="pmc-auth-logo" />
              </span>
            </div>

            <button
              type="button"
              disabled={googleLoading}
              onClick={() => {
                setGoogleLoading(true);
                signIn("google", { callbackUrl: "/dashboard" });
              }}
              className="pmc-google-button is-hidden"
            >
              <span className="pmc-google-mark">G</span>
              <span>{googleLoading ? "กำลังเปิด Google..." : "เข้าสู่ระบบด้วย Google"}</span>
            </button>

            <div className="pmc-auth-divider is-hidden">
              <span />
              <p>Email / PIN</p>
              <span />
            </div>

            <form className="pmc-login-form" onSubmit={handleSubmit}>
              {error && (
                <div className="pmc-login-error">
                  {error}
                </div>
              )}

              <label className="pmc-login-field">
                <span>อีเมล / รหัสผู้ใช้</span>
                <div className="pmc-input-wrap">
                  <User size={19} />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="อีเมลบริษัทหรืออีเมลที่ได้รับ"
                  />
                </div>
              </label>

              <label className="pmc-login-field">
                <span>PIN / รหัสผ่าน</span>
                <div className="pmc-input-wrap">
                  <Lock size={19} />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="PIN สำหรับลูกค้า/โฟร์แมน หรือรหัสผ่าน"
                  />
                  <button
                    type="button"
                    className="pmc-pass-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    title="แสดง/ซ่อน PIN"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <p className="pmc-auth-helper">ลูกค้าและโฟร์แมนใช้ PIN ที่ได้รับจากผู้ดูแลระบบ</p>

              <div className="pmc-login-options">
                <label className="pmc-remember">
                  <input type="checkbox" />
                  <span>จำอุปกรณ์นี้</span>
                </label>
                <a href="#" className="pmc-forgot-link">ขอรีเซ็ตรหัสผ่าน</a>
              </div>

              <button
                className={`pmc-login-submit ${loading ? 'is-loading' : ''}`}
                disabled={loading}
              >
                <LogIn size={17} />
                <span>{loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่แดชบอร์ด'}</span>
                <ArrowRight size={18} />
              </button>
            </form>

            <div className="pmc-auth-meta">
              <ShieldCheck size={16} />
              <span>ระบบจะพาคุณไปยังเมนูตามสิทธิ์การใช้งานหลังเข้าสู่ระบบ</span>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
