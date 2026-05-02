"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  HardHat,
  LogIn,
  ShieldCheck,
  Sparkles,
  User,
  Lock,
  Eye,
  EyeOff,
  KeyRound
} from "lucide-react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <main className="vehicle-login-page">
      <div className="vehicle-login-bg">
        <div className="vehicle-login-grid" />
        <div className="vehicle-login-sweep vehicle-login-sweep-1" />
        <div className="vehicle-login-sweep vehicle-login-sweep-2" />
        <div className="vehicle-login-shine" />
        <div className="vehicle-login-wave" />
        <div className="vehicle-login-wave" />
        <div className="vehicle-login-wave" />
      </div>

      <section className="vehicle-login-shell">
        <aside className="vehicle-login-hero">
          <div className="vehicle-hero-brand">
            <span className="vehicle-brand-mark">
              <Building2 size={30} />
            </span>
            <div>
              <strong>PMC CONNEXT</strong>
              <small>Construction Operations Platform</small>
            </div>
          </div>

          <div className="vehicle-hero-copy">
            <span className="vehicle-hero-pill">
              <Sparkles size={15} />
              Construction Management
            </span>
            <h1>
              <span>จัดการไซต์งานก่อสร้าง</span>
              <span className="vehicle-hero-title-accent">แบบครบวงจร</span>
            </h1>
            <p>เข้าสู่ระบบด้วยอีเมลและ PIN ที่ได้รับจากผู้ดูแลระบบ</p>
          </div>

          <div className="vehicle-hero-features">
            <article>
              <ShieldCheck size={22} />
              <span>
                <strong>Role-based UX</strong>
                <small>เมนูและสิทธิ์เปลี่ยนตามบทบาท</small>
              </span>
            </article>
            <article>
              <HardHat size={22} />
              <span>
                <strong>Site-first workflow</strong>
                <small>เลือกไซต์ก่อนเข้า Project Detail</small>
              </span>
            </article>
            <article>
              <BriefcaseBusiness size={22} />
              <span>
                <strong>ERP modules</strong>
                <small>Plan, Finance, RFI/RFA, QC ครบวงจร</small>
              </span>
            </article>
          </div>
        </aside>

        <section className="vehicle-login-panel">
          <div className="vehicle-login-card">
            <div className="vehicle-login-card-head">
              <span className="vehicle-login-card-mark">
                <Building2 size={24} />
              </span>
              <div>
                <h2>ยินดีต้อนรับกลับมา</h2>
                <p>กรุณาเข้าสู่ระบบเพื่อจัดการโครงการและไซต์งาน</p>
              </div>
            </div>

            <form className="vehicle-login-form mt-6" onSubmit={handleSubmit}>
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">
                  {error}
                </div>
              )}

              <label className="vehicle-login-field">
                <span>อีเมล</span>
                <div className="vehicle-input-wrap">
                  <User size={19} />
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="กรอกอีเมลของคุณ"
                  />
                </div>
              </label>

              <label className="vehicle-login-field">
                <span>PIN / รหัสผ่าน</span>
                <div className="vehicle-input-wrap">
                  <Lock size={19} />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="กรอก PIN หรือรหัสผ่าน"
                  />
                  <button
                    type="button"
                    className="vehicle-pass-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    title="แสดง/ซ่อน PIN"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <div className="flex items-center justify-between mt-1 mb-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center w-5 h-5 border-2 border-gray-300 rounded-md group-hover:border-orange-500 transition-colors bg-white">
                    <input type="checkbox" className="peer absolute opacity-0 w-full h-full cursor-pointer" />
                    <svg className="w-3.5 h-3.5 text-white peer-checked:text-white peer-checked:block hidden pointer-events-none" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div className="absolute inset-0 bg-orange-600 rounded-[4px] opacity-0 peer-checked:opacity-100 transition-opacity -z-10 pointer-events-none"></div>
                  </div>
                  <span className="text-sm font-medium text-gray-600 select-none group-hover:text-gray-900 transition-colors">จดจำการเข้าระบบ</span>
                </label>
                <a href="#" className="text-sm font-semibold text-orange-600 hover:text-orange-700 transition-colors">ลืมรหัสผ่าน?</a>
              </div>

              <button
                className={`vehicle-login-submit ${loading ? 'is-loading' : ''}`}
                disabled={loading}
              >
                {loading ? <KeyRound size={17} /> : <LogIn size={17} />}
                <span>{loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}</span>
                <ArrowRight className="vehicle-login-arrow" size={18} />
              </button>
            </form>
          </div>
        </section>
      </section>
    </main>
  );
}
