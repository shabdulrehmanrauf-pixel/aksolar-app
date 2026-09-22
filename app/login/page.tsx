import type { Metadata } from "next";
import LogoMark from "@/components/LogoMark";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="login-art relative flex flex-col justify-between gap-12 overflow-hidden p-6 text-white md:p-12">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9" />
          <span className="font-display text-2xl font-bold tracking-wide">AK Solar</span>
        </div>

        {/* A full battery gauge: the same motif used for stock levels inside the app. */}
        <div aria-hidden="true" className="hidden items-center md:flex">
          <div className="flex gap-2 rounded-2xl border-[3px] border-white/25 p-2.5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{ "--seg": i } as React.CSSProperties}
                className={`h-24 w-7 rounded-lg ${
                  i < 5 ? "gauge-seg bg-linear-to-b from-amber-300 to-sun" : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <div className="h-10 w-2 rounded-r bg-white/30" />
        </div>

        <p className="max-w-xs font-display text-3xl font-semibold leading-[1.05] md:text-5xl">
          Al Karam Batteries & Solar
        </p>
      </section>

      <main className="flex items-center justify-center p-5 md:p-12">
        <div className="card anim-rise w-full max-w-sm p-6 shadow-lift sm:p-8">
          <h1 className="font-display text-4xl font-bold">Sign in</h1>
          <p className="mt-2 text-lead">Use the email and password set up for you by the shop owner.</p>
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
