import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Sparkles, 
  Zap, 
  BarChart3, 
  MessageSquare, 
  TrendingUp, 
  Brain,
  Target,
  Lightbulb,
  Shield,
  ArrowRight,
  Play
} from 'lucide-react';

const About = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hoveredMedia, setHoveredMedia] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible((prev) => ({ ...prev, [entry.target.id]: true }));
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('[id^="section-"]').forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToFounder = () => {
    document.getElementById('section-founder')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden" style={{ fontFamily: '-apple-system, system-ui, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif' }}>
      {/* Animated Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, transparent 70%)',
            animation: 'gradient-shift 40s ease-in-out infinite',
            filter: 'blur(60px)'
          }}
        />
        <div 
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(147, 51, 234, 0.5) 0%, transparent 70%)',
            animation: 'gradient-shift 35s ease-in-out infinite',
            animationDelay: '-10s',
            filter: 'blur(60px)'
          }}
        />
        <div 
          className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, rgba(14, 165, 233, 0.5) 0%, transparent 70%)',
            animation: 'gradient-shift 30s ease-in-out infinite',
            animationDelay: '-20s',
            filter: 'blur(50px)'
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/60 backdrop-blur-xl border-b border-white/5">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold text-xl tracking-tight">InsightPilot</span>
          </Link>
          <div className="flex items-center gap-8">
            <Link to="/" className="text-sm text-white/60 hover:text-white transition-all duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[2px] after:bg-gradient-to-r after:from-blue-500 after:to-purple-600 hover:after:w-full after:transition-all after:duration-300">
              Home
            </Link>
            <Link to="/about" className="text-sm font-medium text-white relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-gradient-to-r after:from-blue-500 after:to-purple-600">
              About
            </Link>
            <Link to="/blog" className="text-sm text-white/60 hover:text-white transition-all duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[2px] after:bg-gradient-to-r after:from-blue-500 after:to-purple-600 hover:after:w-full after:transition-all after:duration-300">
              Blog
            </Link>
            <Link to="/dashboard">
              <Button size="sm" className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-lg hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105 transition-all duration-200 border-0">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-32 px-4 relative" id="section-hero">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
        <div className="container mx-auto max-w-7xl relative">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold leading-[0.9] tracking-tight">
                InsightPilot is your{' '}
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  automation co-founder
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-white/70 leading-relaxed font-light">
                We build plug-and-play automations and an AI agent that handles the boring operations work, 
                so founders can focus on building.
              </p>
              <div className="flex flex-wrap gap-4 pt-6">
                <Link to="/dashboard">
                  <Button size="lg" className="h-14 px-8 text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-2xl hover:shadow-blue-500/50 hover:scale-105 transition-all duration-200 border-0 group">
                    Explore automations
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Button 
                  size="lg" 
                  onClick={scrollToFounder}
                  className="h-14 px-8 text-base bg-white/5 hover:bg-white/10 text-white backdrop-blur-xl border border-white/10 hover:border-white/20 hover:scale-105 transition-all duration-200 shadow-xl"
                >
                  Meet the founder
                </Button>
              </div>
            </div>
            
            <div className="relative" style={{ animation: 'float 8s ease-in-out infinite' }}>
              <div 
                className="relative transform transition-transform duration-500"
                style={{
                  transform: `perspective(1000px) rotateY(${(mousePosition.x / window.innerWidth - 0.5) * 8}deg) rotateX(${-(mousePosition.y / window.innerHeight - 0.5) * 8}deg)`
                }}
              >
                {/* 3D Layered Card Composition */}
                <div className="relative">
                  {/* Back layer */}
                  <div className="absolute -right-6 -top-6 w-full h-full rounded-3xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 backdrop-blur-xl border border-white/10 transform rotate-6" />
                  
                  {/* Middle layer */}
                  <div className="absolute -right-3 -top-3 w-full h-full rounded-3xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10 transform rotate-3" />
                  
                  {/* Front layer */}
                  <Card className="relative p-8 bg-[#0f0f1a]/80 backdrop-blur-2xl border border-white/10 shadow-2xl hover:shadow-blue-500/20 transition-all duration-500 hover:scale-[1.02] rounded-3xl">
                    <div className="space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                          <TrendingUp className="h-7 w-7 text-white" />
                        </div>
                        <div>
                          <div className="font-semibold text-lg">Niche Trend Radar</div>
                          <div className="text-sm text-white/50">Active monitoring</div>
                        </div>
                      </div>
                      
                      <div className="h-40 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-sm flex items-end p-4 overflow-hidden border border-white/5 relative">
                        {/* Animated scanning line */}
                        <div 
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"
                          style={{
                            animation: 'shimmer-cta 3s linear infinite',
                            backgroundSize: '200% 100%'
                          }}
                        />
                        
                        <div className="flex gap-2 items-end w-full justify-around relative z-10">
                          {[40, 65, 50, 80, 70, 90, 85].map((height, i) => (
                            <div 
                              key={i}
                              className="bg-gradient-to-t from-blue-500 to-purple-600 rounded-sm shadow-lg shadow-blue-500/30 transition-all duration-300 hover:scale-105"
                              style={{ 
                                width: '12%', 
                                height: `${height}%`,
                                animation: `slide-in 0.6s ease-out ${i * 0.1}s both`
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-wrap">
                        {['Trending', 'AI', 'SaaS', 'Automation'].map((tag, i) => (
                          <span 
                            key={i}
                            className="px-4 py-2 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium border border-blue-500/20 hover:bg-blue-500/20 hover:scale-105 transition-all duration-200 cursor-default backdrop-blur-sm"
                            style={{ animation: `scale-in 0.3s ease-out ${i * 0.1 + 0.6}s both` }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>
                
                {/* Glow effects */}
                <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-blue-500/30 blur-3xl" style={{ animation: 'glow-pulse 4s ease-in-out infinite' }} />
                <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-purple-500/30 blur-3xl" style={{ animation: 'glow-pulse 4s ease-in-out infinite', animationDelay: '2s' }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section id="section-founder" className="py-32 px-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent" />
        <div className="container mx-auto max-w-7xl relative">
          <h2 className="text-5xl md:text-6xl font-bold text-center mb-20 tracking-tight">
            Meet the founder
          </h2>
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="flex justify-center">
              <div className="relative group cursor-pointer">
                {/* Rotating gradient ring */}
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 opacity-50 group-hover:opacity-100 blur-xl transition-all duration-500 group-hover:scale-110" style={{ animation: 'glow-pulse 3s ease-in-out infinite' }} />
                
                <Card className="relative p-8 bg-[#0f0f1a]/90 backdrop-blur-2xl border border-white/10 hover:border-white/20 transition-all duration-500 max-w-md rounded-3xl group-hover:scale-105 shadow-2xl">
                  <div className="aspect-square rounded-2xl bg-gradient-to-br from-blue-500/30 to-purple-600/30 flex items-center justify-center mb-6 overflow-hidden border border-white/10 relative group-hover:shadow-2xl group-hover:shadow-blue-500/20 transition-all duration-500">
                    <div className="text-8xl font-bold bg-gradient-to-br from-blue-400 to-purple-400 bg-clip-text text-transparent">A</div>
                    
                    {/* Hover glow overlay */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/20 group-hover:to-purple-500/20 transition-all duration-500" />
                  </div>
                  <h3 className="text-3xl font-bold mb-2">Andrej</h3>
                  <p className="text-white/60">Founder & CEO</p>
                </Card>
              </div>
            </div>
            
            <div className="space-y-10">
              <p className="text-xl md:text-2xl text-white/70 leading-relaxed font-light">
                With a background in customer support, operations, and automation, Andrej is obsessed with 
                building tools that remove repetitive work. He built InsightPilot to give solo founders and 
                small teams the kind of automation stack big companies have.
              </p>
              
              <div className="space-y-6">
                {[
                  { icon: Shield, text: 'Years of experience with operations and customer support' },
                  { icon: Zap, text: 'Hands-on with trading, SaaS, and automation' },
                  { icon: Target, text: 'Goal: "Make automations as easy as flipping a switch"' }
                ].map((item, i) => (
                  <div 
                    key={i}
                    className="flex gap-5 items-start group hover:translate-x-2 transition-transform duration-300"
                  >
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-blue-500/30 transition-all duration-300">
                      <item.icon className="h-6 w-6 text-blue-400" />
                    </div>
                    <p className="text-white/90 text-lg pt-2.5">{item.text}</p>
                  </div>
                ))}
              </div>

              <div className="pt-8">
                <div className="relative">
                  {/* Animated gradient line */}
                  <div className="absolute left-5 top-0 bottom-0 w-[2px] bg-gradient-to-b from-blue-500 via-purple-500 to-cyan-500 opacity-50" />
                  
                  {/* Animated pulse dot */}
                  <div 
                    className="absolute left-4 top-0 h-3 w-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"
                    style={{ animation: 'float 3s ease-in-out infinite' }}
                  />
                  
                  {[
                    { year: '2015-2020', label: 'Ops & Support Years' },
                    { year: '2021-2022', label: 'First Automations' },
                    { year: '2023', label: 'InsightPilot Launch' }
                  ].map((milestone, i) => (
                    <div 
                      key={i}
                      className="relative pl-16 pb-10 last:pb-0 group hover:translate-x-2 transition-transform duration-300"
                    >
                      <div className="absolute left-3.5 top-2.5 h-4 w-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 border-4 border-[#0a0a0f] shadow-lg shadow-blue-500/30 group-hover:scale-125 group-hover:shadow-xl group-hover:shadow-blue-500/50 transition-all duration-300" />
                      <div className="font-semibold text-lg text-white">{milestone.year}</div>
                      <div className="text-white/60">{milestone.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What InsightPilot Does */}
      <section className="py-32 px-4" id="section-pillars">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
              What InsightPilot does for you
            </h2>
            <p className="text-xl md:text-2xl text-white/70 max-w-4xl mx-auto font-light leading-relaxed">
              Pre-built automation tools you can turn on and configure, plus an AI agent inside your 
              dashboard that helps you set up and optimize everything.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: 'Automations Library',
                description: 'Ready-to-use automation tools that handle everything from trend monitoring to price optimization.',
                gradient: 'from-blue-500 to-purple-600'
              },
              {
                icon: Brain,
                title: 'AI Agent in Dashboard',
                description: 'Your AI copilot that suggests the right automations, configures them, and keeps you updated.',
                gradient: 'from-purple-500 to-pink-500'
              },
              {
                icon: BarChart3,
                title: 'Clean Analytics',
                description: 'Simple, digestible summaries and insights instead of overwhelming raw data dumps.',
                gradient: 'from-cyan-500 to-blue-600'
              }
            ].map((pillar, i) => (
              <div key={i} className="relative group">
                {/* Glow effect on hover */}
                <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-r ${pillar.gradient} opacity-0 group-hover:opacity-30 blur-2xl transition-all duration-500`} />
                
                <Card className="relative p-8 bg-[#0f0f1a]/60 backdrop-blur-2xl border border-white/10 hover:border-white/20 transition-all duration-500 hover:scale-105 rounded-3xl group h-full shadow-xl">
                  <div className={`h-20 w-20 rounded-2xl bg-gradient-to-br ${pillar.gradient} flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg`}>
                    <pillar.icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4 tracking-tight">{pillar.title}</h3>
                  <p className="text-white/70 leading-relaxed text-lg">{pillar.description}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Niche Trend Radar Highlight */}
      <section className="py-32 px-4 relative" id="section-ntr">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent" />
        <div className="container mx-auto max-w-7xl relative">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-400 text-sm font-semibold mb-12 backdrop-blur-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Automation 01
          </div>
          
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-5xl md:text-6xl font-bold tracking-tight">
                Niche Trend Radar
                <span className="block text-2xl text-white/50 font-normal mt-4">
                  Our first automation
                </span>
              </h2>
              
              <p className="text-xl md:text-2xl text-white/70 leading-relaxed font-light">
                It scans data about niches and trends, surfaces ideas and opportunities so you can see what's 
                starting to move, and sends back clear, digestible insights rather than raw noise.
              </p>
              
              <div className="space-y-5 pt-6">
                {[
                  'Automatically track niche momentum',
                  'Spot early trend shifts before everyone else',
                  'Get simple summaries instead of raw data overload'
                ].map((feature, i) => (
                  <div 
                    key={i}
                    className="flex gap-4 items-center group hover:translate-x-2 transition-transform duration-300"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 group-hover:scale-125 group-hover:shadow-lg group-hover:shadow-blue-500/50 transition-all duration-300">
                      <div className="h-2.5 w-2.5 rounded-full bg-white" />
                    </div>
                    <span className="text-white text-lg">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative group">
              {/* Outer glow */}
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500 to-purple-600 opacity-30 blur-2xl group-hover:opacity-50 transition-all duration-500" />
              
              <Card className="relative p-10 bg-[#0f0f1a]/80 backdrop-blur-2xl border border-white/10 hover:border-white/20 rounded-3xl group-hover:scale-[1.02] transition-all duration-500 shadow-2xl">
                <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-2xl">Trending Insights</h3>
                    <span className="px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30 backdrop-blur-xl">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2 animate-pulse" />
                      Live
                    </span>
                  </div>
                  
                  <div className="relative h-56 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-6 overflow-hidden border border-white/10 backdrop-blur-sm">
                    {/* Animated scanning effect */}
                    <div 
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent"
                      style={{
                        animation: 'shimmer-cta 4s linear infinite',
                        backgroundSize: '200% 100%'
                      }}
                    />
                    
                    <svg className="w-full h-full relative z-10" viewBox="0 0 400 180">
                      <defs>
                        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: 'rgb(59, 130, 246)', stopOpacity: 0.6 }} />
                          <stop offset="100%" style={{ stopColor: 'rgb(147, 51, 234)', stopOpacity: 0 }} />
                        </linearGradient>
                        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" style={{ stopColor: 'rgb(59, 130, 246)' }} />
                          <stop offset="50%" style={{ stopColor: 'rgb(147, 51, 234)' }} />
                          <stop offset="100%" style={{ stopColor: 'rgb(6, 182, 212)' }} />
                        </linearGradient>
                      </defs>
                      
                      <path
                        d="M0,140 Q50,110 100,85 T200,60 T300,35 L300,180 L0,180 Z"
                        fill="url(#chartGradient)"
                      />
                      <path
                        d="M0,140 Q50,110 100,85 T200,60 T300,35"
                        stroke="url(#lineGradient)"
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                      />
                      
                      {/* Animated dots */}
                      {[
                        { x: 0, y: 140 },
                        { x: 100, y: 85 },
                        { x: 200, y: 60 },
                        { x: 300, y: 35 }
                      ].map((point, i) => (
                        <circle
                          key={i}
                          cx={point.x}
                          cy={point.y}
                          r="5"
                          fill="rgb(59, 130, 246)"
                          style={{
                            animation: `glow-pulse 2s ease-in-out infinite`,
                            animationDelay: `${i * 0.3}s`
                          }}
                        />
                      ))}
                    </svg>
                  </div>
                  
                  <div className="bg-blue-500/10 rounded-2xl p-6 border border-blue-500/20 backdrop-blur-xl hover:border-blue-500/40 transition-all duration-300 group/insight hover:scale-[1.02]">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                        <Sparkles className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-400 mb-1">AI Insight</p>
                        <p className="text-white/90 leading-relaxed">
                          Standing desks in EU show a 22% increase in interest compared to last week. 
                          Consider testing a higher price point.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Coming Soon Automations */}
      <section className="py-32 px-4" id="section-future">
        <div className="container mx-auto max-w-7xl">
          <h2 className="text-5xl md:text-6xl font-bold text-center mb-20 tracking-tight">
            Many more automations on the way
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Lead Follow-Up Autopilot', description: 'Never miss a lead with automated follow-up sequences', delay: 0 },
              { title: 'CEO Daily Command Center', description: 'Your daily digest of metrics and priorities', delay: 0.1 },
              { title: 'Price Optimization Engine', description: 'Dynamic pricing based on market signals', delay: 0.2 },
              { title: 'Content Trend Scanner', description: 'Spot viral content patterns in your niche', delay: 0.3 }
            ].map((automation, i) => (
              <div 
                key={i} 
                className="relative group"
                style={{ animation: `slide-in 0.6s ease-out ${automation.delay}s both` }}
              >
                {/* Hover glow */}
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-hover:opacity-30 blur-xl transition-all duration-500" />
                
                <Card className="relative p-8 bg-[#0f0f1a]/60 backdrop-blur-2xl border border-white/10 hover:border-white/20 transition-all duration-500 hover:scale-105 hover:-rotate-1 rounded-3xl h-full shadow-xl">
                  <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:bg-gradient-to-br group-hover:from-purple-500/20 group-hover:to-pink-500/20 group-hover:border-purple-500/30 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg">
                    <Sparkles className="h-8 w-8 text-white/50 group-hover:text-purple-400 transition-colors duration-300" />
                  </div>
                  <h3 className="font-semibold text-xl mb-3 tracking-tight">{automation.title}</h3>
                  <p className="text-white/60 leading-relaxed mb-6">{automation.description}</p>
                  <span className="inline-block px-4 py-2 rounded-full bg-purple-500/10 text-purple-400 text-xs font-semibold border border-purple-500/30 backdrop-blur-xl">
                    Coming soon
                  </span>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agent Section */}
      <section className="py-32 px-4 relative" id="section-ai">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent" />
        <div className="container mx-auto max-w-7xl relative">
          <h2 className="text-5xl md:text-6xl font-bold text-center mb-20 tracking-tight">
            Your AI copilot inside InsightPilot
          </h2>
          
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-10">
              <p className="text-xl md:text-2xl text-white/70 leading-relaxed font-light">
                Inside the app, there's an AI agent that asks you a few questions, suggests the right automations, 
                and can set up and tweak automation settings for you.
              </p>
              
              <div className="space-y-8">
                {[
                  { step: '1', title: 'Tell the agent what you\'re trying to do', icon: MessageSquare },
                  { step: '2', title: 'It suggests automations and config', icon: Lightbulb },
                  { step: '3', title: 'It keeps you updated with plain language', icon: BarChart3 }
                ].map((step, i) => (
                  <div 
                    key={i}
                    className="flex gap-6 items-start group hover:translate-x-2 transition-transform duration-300"
                  >
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-white font-bold text-2xl shadow-lg group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-blue-500/40 transition-all duration-300">
                      {step.step}
                    </div>
                    <div className="pt-3">
                      <h4 className="font-semibold text-xl mb-2">{step.title}</h4>
                      <step.icon className="h-6 w-6 text-white/40" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative group" style={{ animation: 'float 6s ease-in-out infinite' }}>
              {/* Outer glow */}
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500 to-purple-600 opacity-30 blur-2xl group-hover:opacity-50 transition-all duration-500" />
              
              <Card className="relative p-8 bg-[#0f0f1a]/80 backdrop-blur-2xl border border-white/10 hover:border-white/20 rounded-3xl shadow-2xl transition-all duration-500">
                <div className="space-y-6">
                  {/* User message */}
                  <div className="flex gap-4 group/msg hover:scale-[1.02] transition-transform duration-200">
                    <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-xl flex-shrink-0 border border-white/20" />
                    <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-2xl rounded-tl-none p-5 border border-white/10">
                      <p className="text-white/90">Hey! I want to track trends in the standing desk market.</p>
                    </div>
                  </div>
                  
                  {/* Agent message */}
                  <div className="flex gap-4 justify-end group/msg hover:scale-[1.02] transition-transform duration-200">
                    <div className="flex-1 bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-2xl rounded-tr-none p-5 border border-blue-500/20">
                      <p className="text-white/90">Great! I'll set up Niche Trend Radar for you. What region are you targeting?</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 shadow-lg" />
                  </div>
                  
                  {/* User message */}
                  <div className="flex gap-4 group/msg hover:scale-[1.02] transition-transform duration-200">
                    <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-xl flex-shrink-0 border border-white/20" />
                    <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-2xl rounded-tl-none p-5 border border-white/10">
                      <p className="text-white/90">EU market</p>
                    </div>
                  </div>
                  
                  {/* Agent message */}
                  <div className="flex gap-4 justify-end group/msg hover:scale-[1.02] transition-transform duration-200">
                    <div className="flex-1 bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-2xl rounded-tr-none p-5 border border-blue-500/20">
                      <p className="text-white/90">
                        Perfect! I've configured your EU standing desk trend monitor. You'll get weekly reports 
                        starting next Monday. 📊
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 shadow-lg" />
                  </div>
                  
                  {/* Typing indicator */}
                  <div className="flex gap-4 items-center">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0 shadow-lg" />
                    <div className="flex gap-2 p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-2xl border border-blue-500/20">
                      {[0, 1, 2].map((i) => (
                        <div 
                          key={i}
                          className="h-2 w-2 rounded-full bg-blue-400"
                          style={{ 
                            animation: 'float 1s ease-in-out infinite',
                            animationDelay: `${i * 0.2}s`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Media Gallery */}
      <section className="py-32 px-4" id="section-media">
        <div className="container mx-auto max-w-7xl">
          <h2 className="text-5xl md:text-6xl font-bold text-center mb-20 tracking-tight">
            Behind the scenes
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { type: 'chart', color: 'from-blue-500/30 to-purple-500/30' },
              { type: 'dashboard', color: 'from-purple-500/30 to-pink-500/30' },
              { type: 'automation', color: 'from-cyan-500/30 to-blue-500/30' },
              { type: 'insights', color: 'from-pink-500/30 to-purple-500/30' },
              { type: 'trends', color: 'from-blue-500/30 to-cyan-500/30' },
              { type: 'reports', color: 'from-purple-500/30 to-blue-500/30' }
            ].map((media, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-3xl overflow-hidden group cursor-pointer"
                onMouseEnter={() => setHoveredMedia(i)}
                onMouseLeave={() => setHoveredMedia(null)}
                style={{ 
                  animation: `slide-in 0.6s ease-out ${i * 0.05}s both`,
                  animationDirection: i % 2 === 0 ? 'normal' : 'reverse'
                }}
              >
                {/* Background gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${media.color} transition-all duration-700 ${hoveredMedia === i ? 'scale-125 blur-xl opacity-50' : 'scale-100 opacity-100'}`} />
                
                {/* Glassmorphic overlay */}
                <div className="absolute inset-0 bg-[#0f0f1a]/40 backdrop-blur-md border border-white/10 group-hover:border-white/30 transition-all duration-500" />
                
                {/* Icon/Content */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`transition-all duration-700 ${hoveredMedia === i ? 'scale-[2] opacity-10 blur-sm' : 'scale-100 opacity-60'}`}>
                    <BarChart3 className="h-20 w-20 text-white" />
                  </div>
                </div>
                
                {/* Play icon on hover */}
                {hoveredMedia === i && (
                  <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'scale-in 0.3s ease-out' }}>
                    <div className="h-20 w-20 rounded-full bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center shadow-2xl">
                      <Play className="h-10 w-10 text-white ml-1" fill="white" />
                    </div>
                  </div>
                )}
                
                {/* Label overlay */}
                {hoveredMedia === i && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-6" style={{ animation: 'fade-in 0.3s ease-out' }}>
                    <p className="text-lg font-semibold capitalize">{media.type} View</p>
                  </div>
                )}
                
                {/* Hover glow */}
                <div className={`absolute -inset-1 rounded-3xl bg-gradient-to-r ${media.color} opacity-0 group-hover:opacity-50 blur-2xl transition-all duration-500 -z-10`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-32 px-4 relative" id="section-values">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent" />
        <div className="container mx-auto max-w-5xl relative">
          <h2 className="text-5xl md:text-6xl font-bold text-center mb-20 tracking-tight">
            How we think about automation
          </h2>
          
          <div className="space-y-10">
            {[
              { icon: Target, text: 'Automation should feel like delegation, not like configuring a robot' },
              { icon: Lightbulb, text: 'Insights should be simple and actionable, not overwhelming' },
              { icon: Brain, text: 'AI should help, not overwhelm or replace the user' },
              { icon: Zap, text: 'Setup should take minutes, not hours or days' }
            ].map((value, i) => (
              <div 
                key={i}
                className="flex gap-8 items-center justify-center group hover:translate-x-4 transition-transform duration-300"
                style={{ animation: `slide-in 0.6s ease-out ${i * 0.1}s both` }}
              >
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-xl group-hover:scale-110 group-hover:rotate-6 group-hover:shadow-2xl group-hover:shadow-blue-500/40 transition-all duration-300">
                  <value.icon className="h-10 w-10 text-white" />
                </div>
                <p className="text-xl md:text-2xl max-w-2xl font-light text-white/90">{value.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 px-4 relative overflow-hidden" id="section-cta">
        {/* Animated gradient background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10" />
          <div 
            className="absolute inset-0 opacity-30"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.3), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer-cta 4s linear infinite'
            }}
          />
        </div>
        
        <div className="container mx-auto max-w-5xl relative">
          <div className="relative group">
            {/* Mega glow effect */}
            <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 opacity-40 blur-3xl group-hover:opacity-60 transition-all duration-500" />
            
            <Card className="relative p-16 text-center bg-[#0f0f1a]/90 backdrop-blur-2xl border border-white/20 hover:border-white/30 rounded-[2.5rem] shadow-2xl group-hover:scale-[1.02] transition-all duration-500">
              <h2 className="text-5xl md:text-6xl font-bold mb-8 tracking-tight">
                Ready to see what InsightPilot can do for you?
              </h2>
              <p className="text-xl md:text-2xl text-white/70 mb-12 max-w-3xl mx-auto font-light leading-relaxed">
                Start automating the boring stuff and get back to building what matters.
              </p>
              <div className="flex flex-wrap gap-6 justify-center">
                <Link to="/dashboard">
                  <Button 
                    size="lg" 
                    className="h-16 px-10 text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-2xl hover:shadow-blue-500/60 hover:scale-110 transition-all duration-300 border-0 group/btn rounded-2xl"
                  >
                    Get started
                    <ArrowRight className="ml-3 h-6 w-6 group-hover/btn:translate-x-2 transition-transform" />
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button 
                    size="lg" 
                    className="h-16 px-10 text-lg bg-white/5 hover:bg-white/10 text-white backdrop-blur-xl border-2 border-white/20 hover:border-white/40 hover:scale-110 transition-all duration-300 shadow-xl rounded-2xl"
                  >
                    Explore automations
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 border-t border-white/10 bg-[#0a0a0f]/80 backdrop-blur-xl relative">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center gap-3 group">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-blue-500/40 transition-all duration-300">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <span className="font-semibold text-2xl tracking-tight">InsightPilot</span>
            </div>
            <div className="flex gap-10 text-sm">
              <Link to="/" className="text-white/60 hover:text-white transition-all duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[2px] after:bg-gradient-to-r after:from-blue-500 after:to-purple-600 hover:after:w-full after:transition-all after:duration-300">
                Home
              </Link>
              <Link to="/about" className="text-white hover:text-white transition-all duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-gradient-to-r after:from-blue-500 after:to-purple-600">
                About
              </Link>
              <Link to="/dashboard" className="text-white/60 hover:text-white transition-all duration-200 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[2px] after:bg-gradient-to-r after:from-blue-500 after:to-purple-600 hover:after:w-full after:transition-all after:duration-300">
                Dashboard
              </Link>
            </div>
            <p className="text-sm text-white/50">
              © 2025 InsightPilot. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default About;
