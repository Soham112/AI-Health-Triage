'use client';

import { useState, useRef, useEffect } from 'react';
import {
  AlertCircle, Activity, MessageSquare, TrendingUp,
  Users, Loader2, CheckCircle, Clock, Heart,
  BarChart3, Lock, ArrowRight, X, AlertTriangle, Info,
  DollarSign, ExternalLink, ShieldAlert
} from 'lucide-react';
import { MOCK_MEMBERS } from '@/lib/mockData';

// ─── Types ────────────────────────────────────────────────────────

type Tab = 'triage' | 'chat' | 'preventive' | 'dashboard';
type CareLevel = 'emergency' | 'urgent_care' | 'telehealth' | 'pcp' | 'specialist' | 'self_care';

interface KBSource { title: string; url: string; accessed_date?: string }
interface KBMatch {
  entry_id: string;
  category: string;
  decision: string;
  confidence: number;
  reasoning: string;
  sources: KBSource[];
}

interface TriageResult {
  recommendation: { careLevel: CareLevel; label: string; confidence: number; timeToSee: string; estimatedCost: number };
  clinicalReasoning: string;
  reasoning: { redFlags: string[]; immediateActions: string[]; followUpRecommendations: string[]; memberContextUsed: string; estimatedTimeframe: string };
  memberContext: { age: number; riskScore: number; activeConditions: number };
  costComparison: { recommended: { label: string; estimatedCost: number }; alternatives: Array<{ option: string; label: string; estimatedCost: number }>; potentialSavings: number };
  safetyInfo: { disclaimers: string[]; confidenceScore: number };
  kbMatch?: KBMatch | null;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: string; confidence?: number; warnings?: string[]; disclaimer?: string; responseTimeMs?: number; error?: boolean }
interface Campaign { title: string; clinicalRationale: string; evidenceBase: string; projectedSavings: number; urgency: string; priority: number; interventionSteps?: string[] }
interface PreventiveResult {
  campaigns: Campaign[];
  reasoning: { populationRiskSummary: string; estimatedTotalSavings: number; claimsPatternsFound: string[] };
  riskAnalysis: { overallRisk: number; riskTier: string; predictedAnnualCost: number; hospitalizationProbability: number; riskDriverSummary: string };
}
interface DashboardData {
  overview: { totalMembers: number; totalClaimsCost: number; averageCostPerMember: number; preventableEdVisits: number; estimatedPreventableCost: number; highRiskMemberCount: number };
  riskDistribution: Record<string, number>;
  topRiskMembers: Array<{ id: string; age: number; riskScore: number; riskTier: string; conditions: string[]; predictedAnnualCost: number }>;
  campaignStats: { total: number; completed: number; engaged: number; totalProjectedSavings: number };
  claimsByMonth: Array<{ month: string; cost: number; count: number }>;
  recentActivity: Array<{ action: string; timestamp: string; resource: string }>;
}

// ─── Constants ────────────────────────────────────────────────────

const CARE_COLORS: Record<CareLevel, string> = {
  emergency:   'bg-red-50 border-red-200 text-red-800',
  urgent_care: 'bg-orange-50 border-orange-200 text-orange-800',
  telehealth:  'bg-teal-50 border-teal-200 text-teal-800',
  pcp:         'bg-blue-50 border-blue-200 text-blue-800',
  specialist:  'bg-purple-50 border-purple-200 text-purple-800',
  self_care:   'bg-green-50 border-green-200 text-green-800',
};

const CARE_ICONS: Record<CareLevel, string> = {
  emergency: '🚨', urgent_care: '⚡', telehealth: '💻', pcp: '👨‍⚕️', specialist: '🔬', self_care: '🏠',
};

// ─── Shared Components ────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const tier = score >= 85 ? { label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200' }
             : score >= 65 ? { label: 'High', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
             : score >= 35 ? { label: 'Moderate', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
             :                { label: 'Low', cls: 'bg-green-100 text-green-700 border-green-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${tier.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {tier.label} ({score})
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, teal }: { label: string; value: string; sub?: string; icon: React.ElementType; teal?: boolean }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-2 ${teal ? 'text-[#00A896]' : 'text-gray-900'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${teal ? 'bg-[#e6f7f5]' : 'bg-gray-50'}`}>
          <Icon size={18} className={teal ? 'text-[#00A896]' : 'text-gray-500'} />
        </div>
      </div>
    </div>
  );
}

// ─── Member Selection Grid ────────────────────────────────────────

function MemberGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = MOCK_MEMBERS.filter(m => 
    m.id.toLowerCase().includes(search.toLowerCase()) ||
    m.age.toString().includes(search) ||
    m.conditions.some(c => c.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 12);

  return (
    <div className="mb-5">
      <label className="block text-sm font-semibold text-gray-700 mb-3">Select Member</label>
      <input 
        type="text" 
        placeholder="Search by ID, age, or condition..."
        value={search} 
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm mb-3 focus:outline-none focus:border-[#00A896]"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {filtered.map(member => (
          <button
            key={member.id}
            onClick={() => onChange(member.id)}
            className={`p-3 rounded-xl text-left transition-all border-2 ${
              value === member.id 
                ? 'border-[#00A896] bg-[#e6f7f5]' 
                : 'border-gray-100 bg-white hover:border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-sm text-gray-900">{member.id}</p>
                <p className="text-xs text-gray-500">Age {member.age}</p>
              </div>
              <RiskBadge score={member.risk_score} />
            </div>
            {member.conditions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {member.conditions.slice(0, 2).map((cond, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    {cond}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Member Context Sidebar ───────────────────────────────────────

function MemberContext({ memberId }: { memberId: string }) {
  const member = MOCK_MEMBERS.find(m => m.id === memberId);
  if (!member) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-20">
      <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
        <div className="w-2 h-2 bg-[#00A896] rounded-full" />
        Member Context
      </h3>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">ID</p>
          <p className="font-semibold text-gray-900 mt-1">{member.id}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide">Risk Score</p>
          <div className="mt-2">
            <RiskBadge score={member.risk_score} />
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1.5">Demographics</p>
          <div className="bg-gray-50 rounded-lg p-2.5 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-gray-600">Age:</span><span className="font-semibold text-gray-900">{member.age}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Gender:</span><span className="font-semibold text-gray-900">{member.gender}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Plan:</span><span className="font-semibold text-gray-900">{member.plan_type}</span></div>
          </div>
        </div>
        {member.conditions.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Active Conditions</p>
            <div className="space-y-1.5">
              {member.conditions.map((cond, i) => (
                <div key={i} className="text-xs bg-red-50 border border-red-200 text-red-700 px-2.5 py-1.5 rounded">
                  {cond}
                </div>
              ))}
            </div>
          </div>
        )}
        {member.medications.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-2">Medications ({member.medications.length})</p>
            <div className="space-y-1">
              {member.medications.slice(0, 3).map((med, i) => (
                <p key={i} className="text-xs text-gray-700">{med}</p>
              ))}
              {member.medications.length > 3 && (
                <p className="text-xs text-gray-400 italic">+{member.medications.length - 3} more</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KB Match Card ────────────────────────────────────────────────

const KB_DECISION_STYLE: Record<string, { bg: string; border: string; text: string; badge: string; label: string }> = {
  CALL_911:            { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-900',    badge: 'bg-red-600 text-white',    label: 'CALL 911 IMMEDIATELY' },
  GO_TO_ER:            { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-900', badge: 'bg-orange-500 text-white', label: 'GO TO EMERGENCY ROOM' },
  GO_TO_URGENT_CARE:   { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-900', badge: 'bg-yellow-500 text-white', label: 'GO TO URGENT CARE' },
  PRIOR_AUTH_REQUIRED: { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-900',   badge: 'bg-blue-600 text-white',   label: 'PRIOR AUTH REQUIRED' },
  GET_SCREENING:       { bg: 'bg-teal-50',   border: 'border-teal-300',   text: 'text-teal-900',   badge: 'bg-teal-600 text-white',   label: 'SCREENING RECOMMENDED' },
  SCHEDULE_PCP:        { bg: 'bg-teal-50',   border: 'border-teal-300',   text: 'text-teal-900',   badge: 'bg-teal-600 text-white',   label: 'SCHEDULE WITH PCP' },
};
const KB_DEFAULT_STYLE = { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-900', badge: 'bg-gray-600 text-white', label: '' };

const KB_CATEGORY_LABEL: Record<string, string> = {
  emergency: 'EMERGENCY GUIDELINE',
  urgent:    'URGENT CARE GUIDELINE',
  insurance: 'INSURANCE GUIDANCE',
  screening: 'PREVENTIVE SCREENING',
  drug:      'MEDICATION GUIDANCE',
};

function KBMatchCard({ match }: { match: KBMatch }) {
  const style = KB_DECISION_STYLE[match.decision] ?? KB_DEFAULT_STYLE;
  const label = style.label || match.decision.replace(/_/g, ' ');
  const categoryLabel = KB_CATEGORY_LABEL[match.category] ?? 'CLINICAL GUIDELINE';
  const isEmergency = match.category === 'emergency';

  return (
    <div className={`rounded-xl border-2 p-5 ${style.bg} ${style.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className={`${style.text} opacity-70 flex-shrink-0`} />
          <p className={`text-xs font-bold uppercase tracking-widest ${style.text} opacity-70`}>
            {categoryLabel}
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${style.badge}`}>
          {label}
        </span>
      </div>

      {/* Rule + confidence */}
      <div className={`flex items-center justify-between py-2 border-t border-b mb-4 ${style.border} gap-4`}>
        <div>
          <p className={`text-xs opacity-50 uppercase tracking-wide font-semibold ${style.text}`}>Matched Rule</p>
          <code className={`text-sm font-mono font-bold mt-0.5 block ${style.text}`}>{match.entry_id}</code>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xs opacity-50 uppercase tracking-wide font-semibold ${style.text}`}>Confidence</p>
          <p className={`text-lg font-bold mt-0.5 ${style.text}`}>{Math.round(match.confidence * 100)}%</p>
        </div>
      </div>

      {/* Why / clinical reasoning from KB rule */}
      {match.reasoning && (
        <div className="mb-4">
          <p className={`text-xs font-semibold uppercase tracking-wide mb-1.5 ${style.text} opacity-50`}>
            Why
          </p>
          <p className={`text-sm leading-relaxed ${style.text} opacity-80`}>{match.reasoning}</p>
        </div>
      )}

      {/* Sources */}
      {match.sources.length > 0 && (
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${style.text} opacity-50`}>
            Clinical Sources
          </p>
          <ul className="space-y-1.5">
            {match.sources.map((src, i) => (
              <li key={i}>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-start gap-1.5 text-xs hover:underline ${style.text} opacity-80 hover:opacity-100 transition-opacity`}
                >
                  <ExternalLink size={11} className="flex-shrink-0 mt-0.5" />
                  {src.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pulse strip for 911 urgency */}
      {isEmergency && match.decision === 'CALL_911' && (
        <div className="mt-4 p-2.5 bg-red-600 rounded-lg text-center">
          <p className="text-white text-xs font-bold uppercase tracking-widest animate-pulse">
            ⚠ This is a medical emergency — call 911 now
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────────

function ResultsPanel({ result, careLevel }: { result: TriageResult; careLevel: CareLevel }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* 1. KB matched rule — decision FIRST */}
      {result.kbMatch && <KBMatchCard match={result.kbMatch} />}

      {/* 2. Recommendation badge */}
      <div className={`rounded-xl p-6 border-2 ${CARE_COLORS[careLevel]}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{CARE_ICONS[careLevel]}</span>
            <div>
              <p className="text-2xl font-bold">{result.recommendation.label}</p>
              <p className="text-xs opacity-70 mt-0.5">{result.recommendation.timeToSee}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-3xl font-bold">{result.recommendation.confidence}%</p>
            <p className="text-xs opacity-60">confidence</p>
          </div>
        </div>

        {/* Collapsible details */}
        <button
          onClick={() => setDetailsOpen(v => !v)}
          className="mt-4 flex items-center gap-1.5 text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity"
        >
          <Info size={12} />
          {detailsOpen ? 'Hide Details' : 'Show Details'}
        </button>
        {detailsOpen && result.clinicalReasoning && (
          <p className="text-sm leading-relaxed mt-3 opacity-80">{String(result.clinicalReasoning)}</p>
        )}
      </div>

      {/* 3. Red flags */}
      {result.reasoning.redFlags.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="font-bold text-red-900 text-sm mb-3 flex items-center gap-2">
            <AlertTriangle size={15} />Red Flags
          </p>
          {result.reasoning.redFlags.map((f, i) => (
            <p key={i} className="text-sm text-red-700 mb-1.5">• {f}</p>
          ))}
        </div>
      )}

      {/* 4. Cost comparison */}
      <div className="bg-white rounded-lg border border-gray-100 p-4">
        <p className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
          <DollarSign size={15} className="text-[#00A896]" />Cost Breakdown
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-[#e6f7f5] rounded-lg">
            <span className="font-semibold text-[#00A896]">✓ Recommended</span>
            <span className="font-bold text-[#00A896]">
              ${result.costComparison.recommended.estimatedCost.toLocaleString()}
            </span>
          </div>
          {result.costComparison.alternatives.map((alt, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-600">{alt.label}</span>
              <span className="font-semibold text-gray-700">${alt.estimatedCost.toLocaleString()}</span>
            </div>
          ))}
        </div>
        {result.costComparison.potentialSavings > 0 && (
          <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs font-bold text-green-700">
              Potential Savings: ${result.costComparison.potentialSavings.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* 5. Next steps */}
      {result.reasoning.immediateActions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-100 p-4">
          <p className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
            <CheckCircle size={15} className="text-[#00A896]" />Next Steps
          </p>
          {result.reasoning.immediateActions.map((a, i) => (
            <p key={i} className="text-sm text-gray-700 mb-2">
              <span className="font-bold text-[#00A896]">{i + 1}.</span> {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Triage Section ───────────────────────────────────────────────

function TriageSection() {
  const [memberId, setMemberId] = useState('mbr_001');
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState('');

  async function handleTriage() {
    if (!symptoms.trim()) { setError('Please describe symptoms'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, symptoms }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Triage failed'); return; }
      setResult(data);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  const careLevel = result?.recommendation.careLevel as CareLevel | undefined;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Context sidebar */}
      <div>
        <MemberContext memberId={memberId} />
      </div>

      {/* Main triage panel */}
      <div className="lg:col-span-3 space-y-5">
        {/* Member selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <MemberGrid value={memberId} onChange={setMemberId} />
        </div>

        {/* Symptom input */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-4">Chief Complaint</h2>
          <textarea 
            value={symptoms} 
            onChange={e => setSymptoms(e.target.value)} 
            placeholder="Describe symptoms and current presentation..."
            rows={4} 
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:border-[#00A896]"
          />
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
              <AlertCircle size={15} />{error}
            </div>
          )}
          <button 
            onClick={handleTriage} 
            disabled={loading || !symptoms.trim()}
            className="w-full mt-4 py-3 bg-[#00A896] hover:bg-[#008f7f] disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <><Loader2 size={17} className="animate-spin" />Analyzing...</> : <>Get Recommendation</>}
          </button>
        </div>

        {/* Results */}
        {result && careLevel && (
          <ResultsPanel result={result} careLevel={careLevel} />
        )}
      </div>
    </div>
  );
}

// ─── Chat Section ─────────────────────────────────────────────────

const CHAT_STORAGE_KEY = (memberId: string) => `chat_history_${memberId}`;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function ChatSection() {
  const [memberId, setMemberId] = useState('mbr_001');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load persisted history when member changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CHAT_STORAGE_KEY(memberId));
      setMessages(saved ? (JSON.parse(saved) as ChatMessage[]) : []);
    } catch {
      setMessages([]);
    }
  }, [memberId]);

  // Persist messages on every change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(CHAT_STORAGE_KEY(memberId), JSON.stringify(messages.slice(-50)));
    } catch { /* storage full — silent */ }
  }, [messages, memberId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  function clearChat() {
    setMessages([]);
    try { localStorage.removeItem(CHAT_STORAGE_KEY(memberId)); } catch { /* noop */ }
  }

  function switchMember(id: string) {
    setMemberId(id);
    // messages will load from localStorage via the useEffect above
  }

  async function sendMessage() {
    if (!message.trim() || loading) return;
    const text = message;
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, message: text, sessionId }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errorMsg =
          res.status === 429 ? (data.error || 'Too many requests. Wait a moment.')
          : res.status === 400 ? (data.error || 'Please ask a health-related question.')
          : res.status === 503 ? 'AI service temporarily unavailable.'
          : (data.error || 'Connection failed. Try again.');
        setMessages(prev => [...prev, { role: 'assistant', content: errorMsg, timestamp: new Date().toISOString(), error: true }]);
        return;
      }

      const disclaimer = data.metadata?.disclaimers?.[0];
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || 'Unable to respond',
        timestamp: new Date().toISOString(),
        confidence: data.metadata?.confidenceScore,
        warnings: data.warnings,
        disclaimer,
        responseTimeMs: data.metadata?.responseTimeMs,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection failed. Try again.', timestamp: new Date().toISOString(), error: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
      {/* Sidebar */}
      <div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-20">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Select Member</h3>
          <select value={memberId} onChange={e => switchMember(e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm mb-3 focus:outline-none focus:border-[#00A896]">
            {MOCK_MEMBERS.slice(0, 10).map(m => <option key={m.id} value={m.id}>{m.id} (Age {m.age})</option>)}
          </select>
          <MemberContext memberId={memberId} />
        </div>
      </div>

      {/* Chat panel */}
      <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col" style={{ height: '560px' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-[#00A896]" />
            <span className="text-sm font-semibold text-gray-800">Health Chat</span>
            {messages.length > 0 && (
              <span className="text-xs text-gray-400">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          {messages.length > 0 && (
            <button onClick={clearChat} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50">
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare size={32} className="text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Start a conversation</p>
              <p className="text-xs text-gray-400 mt-1">Ask about health conditions, medications, or preventive care</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-sm space-y-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                {/* Bubble */}
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[#00A896] text-white rounded-br-sm'
                    : msg.error
                    ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Meta row */}
                <div className={`flex items-center gap-2 px-1 flex-wrap ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-xs text-gray-400">{formatTime(msg.timestamp)}</span>

                  {msg.role === 'assistant' && msg.confidence !== undefined && !msg.error && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                      msg.confidence >= 85 ? 'bg-green-50 text-green-700 border-green-200'
                      : msg.confidence >= 70 ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                    }`}>
                      {msg.confidence}% confident
                    </span>
                  )}

                  {msg.responseTimeMs !== undefined && (
                    <span className="text-xs text-gray-300">
                      {(msg.responseTimeMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>

                {/* Disclaimer */}
                {msg.disclaimer && (
                  <div className="flex items-start gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 max-w-sm">
                    <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">{msg.disclaimer}</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#00A896]" />
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex gap-2">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask about your health..."
              maxLength={1000}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#00A896]"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !message.trim()}
              className="px-4 py-2.5 bg-[#00A896] hover:bg-[#008f7f] disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />}
            </button>
          </div>
          <p className="text-xs text-gray-300 mt-1.5 text-right">{message.length}/1000</p>
        </div>
      </div>
    </div>
  );
}

// ─── Preventive Section ───────────────────────────────────────────

function PreventiveSection() {
  const [memberId, setMemberId] = useState('mbr_025');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreventiveResult | null>(null);
  const [error, setError] = useState('');

  async function analyze() {
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/preventive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Analysis failed'); return; }
      setResult(data);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Preventive Care Opportunities</h2>
        <MemberGrid value={memberId} onChange={setMemberId} />
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">{error}</div>}
        <button onClick={analyze} disabled={loading}
          className="w-full py-3 bg-[#00A896] hover:bg-[#008f7f] disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 size={17} className="animate-spin" />Analyzing...</> : <>Analyze Member</>}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          {/* Risk summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard label="Risk Score" value={String(result.riskAnalysis.overallRisk)} icon={Activity} teal />
            <StatCard label="Projected Cost" value={`$${Math.round(result.riskAnalysis.predictedAnnualCost / 1000)}K`} icon={DollarSign} />
            <StatCard label="Hospitalization Risk" value={`${Math.round(result.riskAnalysis.hospitalizationProbability * 100)}%`} icon={AlertCircle} />
          </div>

          {/* Projected savings */}
          {result.reasoning?.estimatedTotalSavings > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm font-bold text-green-900 mb-2">Potential Savings with Preventive Interventions</p>
              <p className="text-2xl font-bold text-green-700">${result.reasoning.estimatedTotalSavings.toLocaleString()}</p>
            </div>
          )}

          {/* Campaigns */}
          {result.campaigns && result.campaigns.map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{c.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{c.clinicalRationale}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${
                  c.urgency === 'high' ? 'bg-red-50 text-red-700 border border-red-200' :
                  c.urgency === 'medium' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                  'bg-green-50 text-green-700 border border-green-200'}`}>
                  {c.urgency}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <p className="text-xs text-gray-500">{c.evidenceBase}</p>
                <p className="font-bold text-green-600">${c.projectedSavings?.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Section ────────────────────────────────────────────

function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 size={30} className="animate-spin text-[#00A896] mb-3" />
    </div>
  );
  if (!data) return null;

  const { overview, riskDistribution, topRiskMembers, claimsByMonth } = data;
  const maxCost = Math.max(...claimsByMonth.map(m => m.cost), 1);

  return (
    <div className="space-y-5">
      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Members" value={overview.totalMembers.toString()} icon={Users} teal />
        <StatCard label="Total Claims" value={`$${Math.round(overview.totalClaimsCost / 1000)}K`} sub="YTD" icon={DollarSign} />
        <StatCard label="High Risk" value={overview.highRiskMemberCount.toString()} icon={AlertCircle} />
        <StatCard label="Preventable ED" value={overview.preventableEdVisits.toString()} icon={Activity} />
        <StatCard label="Avg Cost" value={`$${overview.averageCostPerMember.toLocaleString()}`} sub="/yr" icon={BarChart3} />
        <StatCard label="Savings Projected" value={`$${Math.round(overview.estimatedPreventableCost / 1000)}K`} icon={TrendingUp} teal />
      </div>

      {/* Risk distribution */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-4">Population Risk Distribution</h3>
        {[
          { label: 'Critical (85-100)', key: 'critical', color: 'bg-red-500' },
          { label: 'High (65-84)', key: 'high', color: 'bg-orange-500' },
          { label: 'Moderate (35-64)', key: 'moderate', color: 'bg-yellow-500' },
          { label: 'Low (0-34)', key: 'low', color: 'bg-green-500' },
        ].map(({ label, key, color }) => {
          const count = riskDistribution[key] || 0;
          const pct = overview.totalMembers > 0 ? Math.round((count / overview.totalMembers) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-4 mb-3">
              <div className="w-32 text-xs text-gray-600">{label}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-12 text-right">
                <span className="text-xs font-bold text-gray-900">{count}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Claims trend */}
      {claimsByMonth.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-base font-bold text-gray-900 mb-4">Monthly Claims Trend</h3>
          <div className="flex items-end gap-2 h-32">
            {claimsByMonth.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full bg-[#00A896] rounded-t" style={{ height: `${Math.round((m.cost / maxCost) * 100)}px`, minHeight: '4px' }} />
                <span className="text-xs text-gray-500">{m.month.split('-')[1]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top risk members */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-bold text-gray-900 mb-4">Members at Highest Risk</h3>
        <div className="space-y-2">
          {topRiskMembers.slice(0, 5).map(m => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-[#e6f7f5] transition-colors">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{m.id}</p>
                <p className="text-xs text-gray-500">{m.conditions.slice(0, 2).join(', ')}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <RiskBadge score={m.riskScore} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('triage');

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'triage',     label: 'Triage',     icon: Activity },
    { id: 'chat',       label: 'Chat',       icon: MessageSquare },
    { id: 'preventive', label: 'Preventive', icon: TrendingUp },
    { id: 'dashboard',  label: 'Dashboard',  icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Minimal Header */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#00A896] rounded-lg flex items-center justify-center">
                <Heart size={16} className="text-white" />
              </div>
              <h1 className="text-lg font-bold text-gray-900">Healthcare AI</h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    activeTab === id 
                      ? 'bg-white text-[#00A896] shadow-sm border border-gray-200' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}>
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'triage'     && <TriageSection />}
        {activeTab === 'chat'       && <ChatSection />}
        {activeTab === 'preventive' && <PreventiveSection />}
        {activeTab === 'dashboard'  && <DashboardSection />}
      </div>
    </div>
  );
}
