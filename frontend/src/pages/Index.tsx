import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowDown,
  Apple,
  Compass,
  Dumbbell,
  Menu,
  X,
  Check,
  ScanLine,
  ChartNoAxesCombined,
  Sparkles,
} from "lucide-react";
import "./landing.css";
const Planet = lazy(() => import("@/components/landing/Planet"));
export default function Index() {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            observer.unobserve(e.target);
          }
        }),
      { threshold: 0.1 },
    );
    root.current
      ?.querySelectorAll("[data-rise]")
      .forEach((e) => observer.observe(e));
    return () => observer.disconnect();
  }, []);
  return (
    <div className="ip-landing" ref={root}>
      <Suspense fallback={null}>
        <Planet />
      </Suspense>
      <div className="ip-content">
        <header className="ip-nav">
          <Link className="ip-brand" to="/">
            <Compass />
            InsightPilot<span>.</span>
          </Link>
          <nav
            aria-label="Main navigation"
            className={menu ? "ip-links open" : "ip-links"}
          >
            <a href="#products" onClick={() => setMenu(false)}>
              Our products
            </a>
            <Link to="/nutrition">Nutrition</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/about">About us</Link>
          </nav>
          <div className="ip-nav-actions">
            <Link to="/login">Log in</Link>
            <Link className="ip-button small" to="/signup">
              Get started <ArrowRight size={15} />
            </Link>
            <button
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </header>
        <main>
          <section className="ip-hero">
            <div data-rise>
              <div className="ip-eyebrow">
                A healthier world starts with you
              </div>
              <h1>
                InsightPilot
                <br />
                <span>
                  Better habits.
                  <br />
                  Bigger possibilities.
                </span>
              </h1>
              <p>
                Make sense of your nutrition. Build habits that last. Discover
                thoughtful tools for your everyday wellbeing, all in one place.
              </p>
              <div className="ip-actions">
                <Link className="ip-button" to="/nutrition">
                  Explore nutrition <ArrowRight size={18} />
                </Link>
                <a className="ip-button outline" href="#products">
                  Discover our products
                </a>
              </div>
              <div className="ip-note">
                <i /> Nutrition, available now <span /> Fitness, on the horizon
              </div>
            </div>
            <a href="#products" className="ip-scroll">
              <ArrowDown size={16} /> A little progress. Every day.
            </a>
            <span className="ip-coordinate">
              ONE WORLD. YOUR OWN WAY FORWARD.
            </span>
          </section>
          <section className="ip-section" id="products">
            <div className="ip-section-head" data-rise>
              <div className="ip-eyebrow">Your everyday, elevated</div>
              <h2>
                Small steps.
                <br />A world of difference.
              </h2>
              <p>
                Purpose-built products to help you understand yourself better
                and move forward with confidence.
              </p>
            </div>
            <div className="ip-product-grid">
              <article className="ip-product" data-rise>
                <div className="ip-product-top">
                  <Apple size={28} />
                  <span>Available now</span>
                </div>
                <small>01 / NUTRITION</small>
                <h3>Know what fuels you.</h3>
                <p>
                  Track your meals, understand your nutrition, and see your
                  daily habits come together in one clear view.
                </p>
                <ul>
                  <li>
                    <Check /> Food and meal logging
                  </li>
                  <li>
                    <Check /> Nutrition insights and reports
                  </li>
                  <li>
                    <Check /> An AI assistant for your questions
                  </li>
                </ul>
                <Link className="ip-text-link" to="/nutrition">
                  Meet your nutrition companion <ArrowRight size={18} />
                </Link>
              </article>
              <article className="ip-product ip-fitness" data-rise>
                <div className="ip-product-top">
                  <Dumbbell size={28} />
                  <span>On the horizon</span>
                </div>
                <small>02 / FITNESS</small>
                <h3>
                  Your next chapter.
                  <br />
                  In motion.
                </h3>
                <p>
                  A separate fitness experience is on the way. Built for the web
                  and mobile, with the same focus on making progress feel
                  personal.
                </p>
                <div className="ip-fitness-art">
                  <span />
                  <Dumbbell size={48} />
                  <span />
                </div>
                <small>A dedicated web app & mobile app. Coming later.</small>
              </article>
            </div>
          </section>
          <section className="ip-section ip-showcase">
            <div data-rise>
              <div className="ip-eyebrow">Clarity over complexity</div>
              <h2>
                A clearer picture.
                <br />A healthier everyday.
              </h2>
              <p>
                Less guesswork. More understanding. Bring your meals, insights,
                reports, and AI support into a nutrition workspace that keeps
                you focused on what matters.
              </p>
              <Link to="/nutrition" className="ip-button">
                Find your balance <ArrowRight size={18} />
              </Link>
            </div>
            <div className="ip-preview" data-rise>
              <div className="ip-preview-top">
                <span>
                  <Apple size={16} /> Nutrition overview
                </span>
                <small>Product preview</small>
              </div>
              <h3>Your day, at a glance</h3>
              <p>One meal at a time.</p>
              <div className="ip-ring">
                <div>
                  <Apple size={30} />
                  <strong>
                    Find your
                    <br />
                    balance
                  </strong>
                </div>
              </div>
              <div className="ip-macros">
                <span>Protein</span>
                <span>Carbs</span>
                <span>Fat</span>
              </div>
              <div className="ip-tools">
                <span>
                  <ScanLine size={17} />
                  Meal logging
                </span>
                <span>
                  <ChartNoAxesCombined size={17} />
                  Insights
                </span>
                <span>
                  <Sparkles size={17} />
                  AI support
                </span>
              </div>
            </div>
          </section>
          <section className="ip-section ip-principles">
            {[
              [
                "01",
                "Understand your habits",
                "Turn everyday nutrition into a clearer picture.",
              ],
              [
                "02",
                "Find your own rhythm",
                "Make progress that fits your life, not the other way around.",
              ],
              [
                "03",
                "Keep moving forward",
                "Build on small, consistent steps, one day at a time.",
              ],
            ].map(([n, title, copy]) => (
              <div key={n} data-rise>
                <small>{n}</small>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </section>
          <section className="ip-section ip-final" data-rise>
            <div className="ip-eyebrow">Your next step starts here</div>
            <h2>
              Good habits.
              <br />
              <span>Greater horizons.</span>
            </h2>
            <p>
              Start with nutrition. See where a little clarity can take you.
            </p>
            <Link to="/nutrition" className="ip-button">
              Explore InsightPilot Nutrition <ArrowRight size={18} />
            </Link>
          </section>
        </main>
        <footer className="ip-footer">
          <div>
            <Link to="/" className="ip-brand">
              <Compass />
              InsightPilot.
            </Link>
            <p>Thoughtful tools. Everyday progress.</p>
          </div>
          <nav aria-label="Footer navigation">
            <Link to="/nutrition">Nutrition</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/about">About</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
          <small>© {new Date().getFullYear()} InsightPilot</small>
        </footer>
      </div>
    </div>
  );
}
