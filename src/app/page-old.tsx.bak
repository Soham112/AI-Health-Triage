'use client';

import { useState, useRef, useEffect } from 'react';
import {
  AlertCircle, Activity, MessageSquare, Shield, TrendingUp,
  Users, Loader2, CheckCircle, Clock, Heart,
  Brain, BarChart3, FileText, Lock, Zap, ArrowRight,
  ChevronDown, Star, DollarSign, AlertTriangle, Info,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'triage' | 'chat' | 'preventive' | 'dashboard';
type CareLevel = 'emergency' | 'urgent_care' | 'telehealth' | 'pcp' | 'specialist' | 'self_care';

interface TriageResult {
  recommendation: { careLevel: CareLevel; label: string; confidence: number; timeToSee: string; estimatedCost: number };
  clinicalReasoning: string;
  reasoning: { redFlags: string[]; immediateActions: string[]; followUpRecommendations: string[]; memberContextUsed: string; estimatedTimeframe: string };
  memberContext: { age: number; riskScore: number; activeConditions: number };
  costComparison: { recommended: { label: string; estimatedCost: number }; alternatives: Array<{ option: string; label: string; estimatedCost: number }>; potentialSavings: number };
  safetyInfo: { disclaimers: string[]; confidenceScore: number };
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; timestamp: string; confidence?: number; warnings?: string[] }
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

// ─── Constants ────────────────────────────────────────────────────────────────

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

const DEMO_MEMBERS = [
  { id: 'mbr_001', label: 'John, 67 — Diabetic, HTN, CKD (Risk: 87)', riskScore: 87 },
  { id: 'mbr_003', label: 'Robert, 72 — CHF, Afib, CAD (Risk: 94)', riskScore: 94 },
  { id: 'mbr_006', label: 'Maria, 61 — Diabetic, Neuropathy (Risk: 81)', riskScore: 81 },
  { id: 'mbr_008', label: 'William, 78 — COPD, Diabetic, CKD (Risk: 96)', riskScore: 96 },
  { id: 'mbr_022', label: 'David, 51 — Sleep Apnea, Obesity (Risk: 46)', riskScore: 46 },
  { id: 'mbr_025', label: 'George, 82 — CHF, Afib, COPD, CKD (Risk: 98)', riskScore: 98 },
  { id: 'mbr_050', label: 'Tyler, 25 — Healthy (Risk: 5)', riskScore: 5 },
];

const DEMO_SYMPTOMS = [
  'My blood sugar has been running 300-350 for 3 days. Very thirsty, blurry vision.',
  'Gained 8 pounds in 3 days, ankles very swollen, short of breath lying down.',
  'Sore throat, runny nose, mild fever 100.2°F since yesterday.',
  'Chest tightness and shortness of breath that woke me up at night.',
  'Worsening cough and yellow sputum for 5 days, mild fever — I have COPD.',
];

// ─── Shared Components ────────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  const tier = score >= 85 ? { label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200' }
             : score >= 65 ? { label: 'High', cls: 'bg-orange-100 text-orange-700 border-orange-200' }
             : score >= 35 ? { label: 'Moderate', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
             :                { label: 'Low', cls: 'bg-green-100 text-green-700 border-green-200' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${tier.cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {tier.label} · {score}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, teal }: { label: string; value: string; sub?: string; icon: React.ElementType; teal?: boolean }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className={`text-xl font-bold mt-1 ${teal ? 'text-[#00A896]' : 'text-gray-900'}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${teal ? 'bg-[#e6f7f5]' : 'bg-gray-50'}`}>
          <Icon size={18} className={teal ? 'text-[#00A896]' : 'text-gray-500'} />
        </div>
      </div>
    </div>
  );
}

function MemberSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-2">Select Member</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-800 appearance-none focus:outline-none focus:border-[#00A896] focus:ring-1 focus:ring-[#00A896]">
          {DEMO_MEMBERS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      <div className="mt-2">
        <RiskBadge score={DEMO_MEMBERS.find(m => m.id === value)?.riskScore || 0} />
      </div>
    </div>
  );
}

// ─── Triage Section ───────────────────────────────────────────────────────────

function TriageSection() {
  const [memberId, setMemberId] = useState('mbr_001');
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState('');

  async function handleTriage() {
    if (!symptoms.trim()) { setError('Please describe your symptoms'); return; }
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
    } catch { setError('Network error — please try again'); }
    finally { setLoading(false); }
  }

  const careLevel = result?.recommendation.careLevel as CareLevel | undefined;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-[#e6f7f5] rounded-xl"><Activity size={20} className="text-[#00A896]" /></div>
          <div>
            <h2 className="text-base font-bold text-gray-900">AI-Powered Triage</h2>
            <p className="text-xs text-gray-500">Extended reasoning routes to the right care setting</p>
          </div>
        </div>

        <MemberSelect value={memberId} onChange={setMemberId} />

        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Describe Symptoms</label>
          <textarea value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="What are you experiencing..."
            rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#00A896] focus:ring-1 focus:ring-[#00A896]" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO_SYMPTOMS.map((s, i) => (
              <button key={i} onClick={() => setSymptoms(s)}
                className="text-xs px-2.5 py-1 bg-gray-50 hover:bg-[#e6f7f5] hover:text-[#00A896] rounded-full border border-gray-200 transition-colors">
                Example {i + 1}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={15} />{error}
          </div>
        )}

        <button onClick={handleTriage} disabled={loading || !symptoms.trim()}
          className="w-full py-3 bg-[#00A896] hover:bg-[#008f7f] disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><Loader2 size={17} className="animate-spin" />Analyzing with extended reasoning...</>
            : <><Zap size={17} />Get Triage Recommendation</>}
        </button>
      </div>

      {result && careLevel && (
        <div className="space-y-4">
          {/* Main recommendation */}
          <div className={`rounded-2xl p-5 border-2 ${CARE_COLORS[careLevel]}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{CARE_ICONS[careLevel]}</span>
                  <span className="text-lg font-bold">{result.recommendation.label}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-medium opacity-80">
                  <span className="flex items-center gap-1"><Clock size={12} />{result.recommendation.timeToSee}</span>
                  <span className="flex items-center gap-1"><DollarSign size={12} />${result.recommendation.estimatedCost.toLocaleString()} est.</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{result.recommendation.confidence}%</div>
                <div className="text-xs opacity-60">confidence</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed">{result.clinicalReasoning}</p>
          </div>

          {result.reasoning.redFlags.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2"><AlertTriangle size={15} />Red Flags</div>
              {result.reasoning.redFlags.map((f, i) => (
                <p key={i} className="text-sm text-red-600 flex items-start gap-1.5">
                  <span className="mt-2 w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />{f}
                </p>
              ))}
            </div>
          )}

          {result.reasoning.immediateActions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><CheckCircle size={15} className="text-[#00A896]" />Immediate Actions</h3>
              {result.reasoning.immediateActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 mb-2">
                  <span className="w-5 h-5 bg-[#e6f7f5] text-[#00A896] rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{i+1}</span>
                  <p className="text-sm text-gray-700">{a}</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
            <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2"><DollarSign size={15} className="text-[#00A896]" />Cost Comparison</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2.5 bg-[#e6f7f5] rounded-lg">
                <span className="text-sm font-semibold text-[#00A896]">✓ {result.costComparison.recommended.label}</span>
                <span className="text-sm font-bold text-[#00A896]">${result.costComparison.recommended.estimatedCost.toLocaleString()}</span>
              </div>
              {result.costComparison.alternatives.slice(0, 2).map((alt, i) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-500">{alt.label}</span>
                  <span className="text-xs text-gray-400">${alt.estimatedCost.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {result.costComparison.potentialSavings > 0 && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold text-center">
                Potential savings vs ER: ${result.costComparison.potentialSavings.toLocaleString()}
              </div>
            )}
          </div>

          {result.reasoning.memberContextUsed && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2">
              <Info size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-0.5">How Member History Was Used</p>
                <p className="text-xs text-blue-700">{result.reasoning.memberContextUsed}</p>
              </div>
            </div>
          )}

          {result.safetyInfo.disclaimers.length > 0 && (
            <div className="text-xs text-gray-400 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <Shield size={11} className="inline mr-1 mb-0.5" />
              {result.safetyInfo.disclaimers[0]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chat Section ─────────────────────────────────────────────────────────────

function ChatSection() {
  const [memberId, setMemberId] = useState('mbr_001');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || data.error || 'Unable to respond',
        timestamp: new Date().toISOString(),
        confidence: data.metadata?.confidenceScore,
        warnings: data.warnings,
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error — please try again.', timestamp: new Date().toISOString() }]);
    } finally { setLoading(false); }
  }

  const quickQuestions = ['What should I watch for with my diabetes?', 'My foot looks different — should I be worried?', 'Can I skip my CPAP for a few nights?'];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-[#e6f7f5] rounded-xl"><MessageSquare size={20} className="text-[#00A896]" /></div>
          <div>
            <h2 className="text-base font-bold text-gray-900">AI Health Chat</h2>
            <p className="text-xs text-gray-500">Context-aware responses using member history and conditions</p>
          </div>
        </div>
        <MemberSelect value={memberId} onChange={v => { setMemberId(v); setMessages([]); }} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col" style={{ height: '420px' }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-12 h-12 bg-[#e6f7f5] rounded-2xl flex items-center justify-center mb-3">
                <MessageSquare size={22} className="text-[#00A896]" />
              </div>
              <p className="text-gray-500 text-sm font-medium">Ask Arlo about your health</p>
              <p className="text-gray-400 text-xs mt-1 mb-4">Personalized to your conditions and medical history</p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {quickQuestions.map(q => (
                  <button key={q} onClick={() => setMessage(q)}
                    className="text-left text-xs px-3 py-2 bg-gray-50 hover:bg-[#e6f7f5] hover:text-[#00A896] border border-gray-200 rounded-xl transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-[#00A896] text-white rounded-br-md' : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-bl-md'}`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <div className={`flex items-center gap-2 mt-1 text-xs ${msg.role === 'user' ? 'text-teal-100' : 'text-gray-400'}`}>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {msg.confidence !== undefined && <span>· {msg.confidence}% conf</span>}
                </div>
                {msg.warnings && msg.warnings.length > 0 && (
                  <div className="mt-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1">{msg.warnings[0]}</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-[#00A896]" />
                <span className="text-sm text-gray-400">Arlo is thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-3 border-t border-gray-100">
          <div className="flex gap-2">
            <input value={message} onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Type your health question..."
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#00A896]" />
            <button onClick={sendMessage} disabled={loading || !message.trim()}
              className="px-4 py-2.5 bg-[#00A896] hover:bg-[#008f7f] disabled:opacity-50 text-white rounded-xl transition-colors">
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Preventive Section ───────────────────────────────────────────────────────

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
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 bg-[#e6f7f5] rounded-xl"><TrendingUp size={20} className="text-[#00A896]" /></div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Preventive Care Intelligence</h2>
            <p className="text-xs text-gray-500">Claims-driven campaigns with ROI projections and evidence base</p>
          </div>
        </div>
        <MemberSelect value={memberId} onChange={setMemberId} />
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={15} />{error}
          </div>
        )}
        <button onClick={analyze} disabled={loading}
          className="w-full py-3 bg-[#00A896] hover:bg-[#008f7f] disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
          {loading ? <><Loader2 size={17} className="animate-spin" />Analyzing claims & risk...</> : <><Brain size={17} />Generate Preventive Campaigns</>}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Risk Analysis</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: 'Risk Score', value: String(result.riskAnalysis.overallRisk), color: 'text-[#00A896]' },
                { label: 'Predicted Cost', value: `$${Math.round(result.riskAnalysis.predictedAnnualCost / 1000)}K`, color: 'text-gray-800' },
                { label: 'Hosp. Risk', value: `${Math.round(result.riskAnalysis.hospitalizationProbability * 100)}%`, color: 'text-orange-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                </div>
              ))}
            </div>
            <RiskBadge score={result.riskAnalysis.overallRisk} />
            <p className="text-xs text-gray-500 mt-2">{result.riskAnalysis.riskDriverSummary}</p>
          </div>

          {result.reasoning?.estimatedTotalSavings > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <DollarSign size={20} className="text-green-600 flex-shrink-0" />
              <div>
                <div className="text-xs text-green-700 font-semibold">Total Projected Savings</div>
                <div className="text-2xl font-bold text-green-700">${result.reasoning.estimatedTotalSavings.toLocaleString()}</div>
              </div>
            </div>
          )}

          {(result.campaigns || []).map((c: Campaign, i: number) => (
            <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="w-6 h-6 bg-[#00A896] text-white text-xs rounded-full flex items-center justify-center font-bold flex-shrink-0">{c.priority || i + 1}</span>
                  <h3 className="text-sm font-bold text-gray-800 leading-tight">{c.title}</h3>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full border font-semibold ml-2 flex-shrink-0 ${
                  c.urgency === 'high' ? 'bg-red-50 border-red-200 text-red-700' :
                  c.urgency === 'medium' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                  'bg-green-50 border-green-200 text-green-700'}`}>
                  {c.urgency}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-3 leading-relaxed">{c.clinicalRationale}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 italic flex-1 min-w-0 truncate pr-2">📚 {c.evidenceBase}</p>
                <span className="text-sm font-bold text-green-600 flex-shrink-0">${c.projectedSavings?.toLocaleString()}</span>
              </div>
              {c.interventionSteps && c.interventionSteps.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Intervention Steps</p>
                  {c.interventionSteps.slice(0, 3).map((step, j) => (
                    <p key={j} className="text-xs text-gray-500 flex gap-1.5 mb-1">
                      <span className="text-[#00A896] font-bold">{j + 1}.</span>{step}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}

          {result.reasoning?.claimsPatternsFound?.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <h4 className="text-sm font-bold text-blue-800 mb-2 flex items-center gap-2"><BarChart3 size={15} />Claims Patterns Found</h4>
              {result.reasoning.claimsPatternsFound.map((p: string, i: number) => (
                <p key={i} className="text-sm text-blue-700 flex items-start gap-2 mb-1">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />{p}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Section ────────────────────────────────────────────────────────

function DashboardSection() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20">
      <Loader2 size={30} className="animate-spin text-[#00A896] mb-3" />
      <p className="text-gray-500 text-sm">Loading population analytics...</p>
    </div>
  );
  if (!data) return null;

  const { overview, riskDistribution, topRiskMembers, campaignStats, claimsByMonth } = data;
  const maxCost = Math.max(...claimsByMonth.map(m => m.cost), 1);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total Members" value={overview.totalMembers.toString()} icon={Users} teal />
        <StatCard label="Total Claims Cost" value={`$${Math.round(overview.totalClaimsCost / 1000)}K`} sub="YTD" icon={DollarSign} />
        <StatCard label="High Risk Members" value={overview.highRiskMemberCount.toString()} sub={`${Math.round(overview.highRiskMemberCount / overview.totalMembers * 100)}% of pop`} icon={AlertCircle} />
        <StatCard label="Preventable ED Visits" value={overview.preventableEdVisits.toString()} sub={`$${Math.round(overview.estimatedPreventableCost / 1000)}K preventable`} icon={Activity} />
        <StatCard label="Campaign Savings" value={`$${Math.round(campaignStats.totalProjectedSavings / 1000)}K`} sub={`${campaignStats.completed} completed`} icon={TrendingUp} teal />
        <StatCard label="Avg Cost/Member" value={`$${overview.averageCostPerMember.toLocaleString()}`} sub="projected/yr" icon={BarChart3} />
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 mb-4">Population Risk Distribution</h3>
        {[
          { label: 'Critical (85-100)', key: 'critical', color: 'bg-red-400' },
          { label: 'High (65-84)', key: 'high', color: 'bg-orange-400' },
          { label: 'Moderate (35-64)', key: 'moderate', color: 'bg-yellow-400' },
          { label: 'Low (0-34)', key: 'low', color: 'bg-green-400' },
        ].map(({ label, key, color }) => {
          const count = riskDistribution[key] || 0;
          const pct = Math.round((count / overview.totalMembers) * 100);
          return (
            <div key={key} className="flex items-center gap-3 mb-2.5">
              <div className="w-28 text-xs text-gray-500 flex-shrink-0">{label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
              </div>
              <div className="w-8 text-xs font-semibold text-gray-700 text-right flex-shrink-0">{count}</div>
            </div>
          );
        })}
      </div>

      {claimsByMonth.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Monthly Claims Spend</h3>
          <div className="flex items-end gap-1.5 h-28">
            {claimsByMonth.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="relative w-full">
                  <div className="w-full bg-[#00A896] rounded-t opacity-70 hover:opacity-100 transition-opacity"
                    style={{ height: `${Math.round((m.cost / maxCost) * 96)}px`, minHeight: '4px' }} />
                </div>
                <span className="text-xs text-gray-400">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 mb-4">Top Risk Members</h3>
        <div className="space-y-3">
          {topRiskMembers.slice(0, 5).map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-[#e6f7f5] transition-colors cursor-pointer">
              <div className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-[#00A896]">{m.age}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-800">{m.id}</span>
                  <RiskBadge score={m.riskScore} />
                </div>
                <p className="text-xs text-gray-500 truncate">{m.conditions.slice(0, 2).join(', ')}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-gray-800">${Math.round(m.predictedAnnualCost / 1000)}K</div>
                <div className="text-xs text-gray-400">pred/yr</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('triage');

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'triage',     label: 'Triage',     icon: Activity },
    { id: 'chat',       label: 'Chat',       icon: MessageSquare },
    { id: 'preventive', label: 'Preventive', icon: TrendingUp },
    { id: 'dashboard',  label: 'Dashboard',  icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5f7fa' }}>
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#00A896] rounded-xl flex items-center justify-center flex-shrink-0">
              <Heart size={17} className="text-white" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-[#00A896]">Arlo</span>
              <span className="text-lg font-bold text-gray-800">Health</span>
              <span className="ml-1 text-xs bg-[#e6f7f5] text-[#00A896] px-2 py-0.5 rounded-full font-semibold">AI Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock size={11} className="text-[#00A896]" />
            <span className="hidden sm:inline">HIPAA-ready · Audit logged · Production-grade</span>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Healthcare AI Platform
                <span className="text-[#00A896]"> · Production Grade</span>
              </h1>
              <p className="text-sm text-gray-500 mt-1.5 max-w-lg">
                Smart triage with extended reasoning, context-aware health guidance, and claims-driven preventive care — built with safety guardrails, audit logging, and rate limiting throughout.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {[
                { icon: Shield, label: 'Safety First', sub: 'Injection & PII detection', color: 'text-[#00A896] bg-[#e6f7f5]' },
                { icon: Brain, label: 'Extended Reasoning', sub: 'Claude thinking enabled', color: 'text-purple-600 bg-purple-50' },
                { icon: FileText, label: 'Audit Trail', sub: 'Every interaction logged', color: 'text-blue-600 bg-blue-50' },
              ].map(({ icon: Icon, label, sub, color }) => (
                <div key={label} className="text-center p-3 bg-gray-50 rounded-xl border border-gray-100 hidden sm:block">
                  <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center mx-auto mb-1.5`}>
                    <Icon size={15} />
                  </div>
                  <p className="text-xs font-semibold text-gray-700 leading-tight">{label}</p>
                  <p className="text-xs text-gray-400 leading-tight mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-5">
        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-medium transition-all text-sm ${
                activeTab === id ? 'bg-[#00A896] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}>
              <Icon size={15} /><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content — max 700px centered */}
        <div className="max-w-2xl mx-auto">
          {activeTab === 'triage'     && <TriageSection />}
          {activeTab === 'chat'       && <ChatSection />}
          {activeTab === 'preventive' && <PreventiveSection />}
          {activeTab === 'dashboard'  && <DashboardSection />}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 bg-white border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-7">
          <h3 className="text-xs font-bold text-gray-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
            <Star size={12} className="text-[#00A896]" />Production-Grade Architecture
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { title: 'Safety Layer', items: ['Prompt injection detection', 'PII detection & redaction', 'Harmful output filtering', 'Self-harm crisis routing'] },
              { title: 'Intelligence', items: ['Claude extended thinking', 'Claims pattern analysis', 'Risk scoring engine', 'Preventive opportunity finder'] },
              { title: 'Data Layer', items: ['50+ member profiles', 'Real CPT/ICD-10 codes', 'Triage outcome tracking', 'Supabase + pgvector ready'] },
              { title: 'Operations', items: ['Rate limiting (IP + member)', 'Immutable audit logs', 'Field-level encryption', 'HIPAA-ready architecture'] },
            ].map(({ title, items }) => (
              <div key={title}>
                <p className="text-xs font-bold text-[#00A896] uppercase tracking-wide mb-2">{title}</p>
                {items.map(item => (
                  <p key={item} className="text-xs text-gray-400 flex items-start gap-1.5 mb-1">
                    <CheckCircle size={10} className="text-[#00A896] mt-0.5 flex-shrink-0" />{item}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
