import { useEffect, useState } from "react";
import type { AppState, Bot } from "../shared/types";
import { DEFAULT_ZBITS_PERSONAS, getBitDisplayName, getBitRoleTitle } from "../shared/zbits-personas";
import { Character } from "./Character";
import { ShieldCheck, Zap, Sparkles, ArrowRight, ShieldAlert, Cpu, Coins, CheckCircle2 } from "lucide-react";
import type { CapabilityPanel } from "./capability-navigation";
import type { SpendingPolicy, CommerceIntegrationStatus } from "../shared/zbits-types";

interface OverviewData {
  brand?: { name: string; tagline: string; version: string };
  gate?: {
    policy: SpendingPolicy;
    spend?: { dailySpentCents: number; monthlySpentCents: number };
    pendingApprovalsCount: number;
    recentAuditCount: number;
  };
  runner?: {
    integrations: CommerceIntegrationStatus[];
    executionsCount?: number;
  };
  zcash?: {
    status: {
      network: string;
      isOnline: boolean;
      blockHeight: number;
      networkUpgrade: string;
      lightwalletdEndpoint: string;
    };
    recentTransactions: Array<{ id: string; txid: string; amountZec: number; status: string }>;
  };
}

export function ZbitsOverview({
  state,
  onOpen,
  onThread,
  onEditBot,
}: {
  state: AppState;
  onOpen: (panel: CapabilityPanel) => void;
  onThread: (id: string) => void;
  onEditBot: (id: string) => void;
}) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/zbits/overview")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setOverview(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingApprovalsCount = state.approvals.filter((a) => a.status === "pending").length;
  const policy = overview?.gate?.policy;

  return (
    <div className="zbits-overview-container" style={{ padding: "8px 0 24px" }}>
      {/* Hero Banner */}
      <div
        className="zbits-hero-card"
        style={{
          background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: 14,
          padding: "24px 28px",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1 0%, #2563eb 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "-0.04em",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35)",
            }}
          >
            Z
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Z-Bits</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--copy-muted, #8e8e93)" }}>
              Your agents. Your rules. Your money.
            </p>
          </div>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.5, margin: "12px 0 16px", color: "var(--copy, #1c1c1e)" }}>
          Z-Bits is your personal AI agent platform. Your team of specialized Bits can research, execute tasks, and initiate autonomous commerce while the deterministic Gate policy governs every transaction.
        </p>

        {/* Quick status chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            onClick={() => onOpen("spending")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 12px",
              borderRadius: 20,
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "var(--success, #10b981)",
              cursor: "pointer",
            }}
          >
            <ShieldCheck size={14} />
            <span>Gate Policy: {policy ? `${policy.currency} $${(policy.dailyBudgetCents / 100).toFixed(0)}/day limit` : "Active"}</span>
            <ArrowRight size={12} />
          </button>

          <button
            type="button"
            onClick={() => onOpen("provider")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 12px",
              borderRadius: 20,
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              color: "var(--accent, #6366f1)",
              cursor: "pointer",
            }}
          >
            <Cpu size={14} />
            <span>AI Providers: Gemini · Bedrock · OpenAI</span>
            <ArrowRight size={12} />
          </button>

          {pendingApprovalsCount > 0 && (
            <button
              type="button"
              onClick={() => onOpen("live")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 20,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "var(--danger, #ef4444)",
                cursor: "pointer",
              }}
            >
              <ShieldAlert size={14} />
              <span>{pendingApprovalsCount} Approval{pendingApprovalsCount === 1 ? "" : "s"} Pending</span>
            </button>
          )}
        </div>
      </div>

      {/* Bit Personas Grid */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Active Bits</h3>
          <button
            type="button"
            className="text-action"
            onClick={() => onOpen("team")}
            style={{ fontSize: 13, background: "none", border: "none", color: "var(--accent)", cursor: "pointer" }}
          >
            Manage team &rarr;
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {state.bots.map((bot) => {
            const persona = DEFAULT_ZBITS_PERSONAS[bot.id.toLowerCase()];
            const displayName = getBitDisplayName(bot);
            const roleTitle = getBitRoleTitle(bot);

            return (
              <div
                key={bot.id}
                style={{
                  background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
                  border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
                  borderRadius: 12,
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <Character name={displayName} color={bot.color} variant={bot.mascot} size={40} />
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <strong style={{ fontSize: 15 }}>{displayName}</strong>
                        {persona && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: `${bot.color}22`,
                              color: bot.color,
                            }}
                          >
                            {persona.title}
                          </span>
                        )}
                      </div>
                      <small style={{ color: "var(--copy-muted, #8e8e93)", fontSize: 12 }}>
                        {roleTitle || bot.role}
                      </small>
                    </div>
                  </div>

                  <p style={{ fontSize: 13, lineHeight: 1.4, color: "var(--copy-secondary, #3a3a3c)", margin: "0 0 14px" }}>
                    {persona?.tagline || bot.instructions?.slice(0, 90) || "Ready to assist you with tasks and research."}
                  </p>

                  {persona?.responsibilities && (
                    <ul style={{ margin: "0 0 16px", paddingLeft: 18, fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
                      {persona.responsibilities.slice(0, 2).map((resp, i) => (
                        <li key={i} style={{ marginBottom: 4 }}>{resp}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={() => onThread(bot.threadId)}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "var(--accent, #6366f1)",
                      color: "#fff",
                      border: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span>Chat</span>
                    <ArrowRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditBot(bot.threadId)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "var(--btn-secondary-bg, rgba(0, 0, 0, 0.05))",
                      color: "var(--copy, #1c1c1e)",
                      border: "1px solid var(--border, rgba(0, 0, 0, 0.1))",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Settings
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gate & Runner Quick Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        <div
          style={{
            background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
            border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <ShieldCheck size={18} style={{ color: "var(--success, #10b981)" }} />
            <strong style={{ fontSize: 14 }}>Z-Bits Gate</strong>
          </div>
          <p style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)", margin: "0 0 10px" }}>
            Deterministic financial policy engine. Purchases are evaluated mathematically before cryptographic authorization.
          </p>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <span>Single Transaction Cap:</span>
            <strong>${policy ? (policy.maxPerTransactionCents / 100).toFixed(2) : "50.00"}</strong>
          </div>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <span>Today's Spend / Budget:</span>
            <strong>
              ${((overview?.gate?.spend?.dailySpentCents || 0) / 100).toFixed(2)} / ${policy ? (policy.dailyBudgetCents / 100).toFixed(2) : "150.00"}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => onOpen("spending")}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border, rgba(0,0,0,0.1))",
              background: "transparent",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Configure Gate Constitution &rarr;
          </button>
        </div>

        <div
          style={{
            background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
            border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Coins size={18} style={{ color: "var(--accent, #6366f1)" }} />
            <strong style={{ fontSize: 14 }}>Runner Execution & Bitrefill</strong>
          </div>
          <p style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)", margin: "0 0 10px" }}>
            Secure server-side execution service. Keeps merchant keys and wallet seeds completely isolated from LLMs.
          </p>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <span>Bitrefill Adapter:</span>
            <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>Active (Catalog & Sandbox Ready)</span>
          </div>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <span>Executions Recorded:</span>
            <strong>{overview?.runner?.executionsCount || 0} orders</strong>
          </div>
          <button
            type="button"
            onClick={() => onOpen("spending")}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border, rgba(0,0,0,0.1))",
              background: "transparent",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            View Purchases & Invoices &rarr;
          </button>
        </div>

        <div
          style={{
            background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
            border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: "#f59e0b", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>Z</div>
            <strong style={{ fontSize: 14 }}>Zcash Shielded Privacy</strong>
          </div>
          <p style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)", margin: "0 0 10px" }}>
            Zero-knowledge testnet value transfers with opaque memo decoupling. Proves multi-agent privacy without key leakage.
          </p>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <span>Network:</span>
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>NU7 / Ironwood Testnet</span>
          </div>
          <div style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border, rgba(0,0,0,0.06))" }}>
            <span>Status:</span>
            <span style={{ color: "var(--success, #10b981)", fontWeight: 600 }}>Online · Block {overview?.zcash?.status?.blockHeight?.toLocaleString() || "2,984,150"}</span>
          </div>
          <button
            type="button"
            onClick={() => onOpen("spending")}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid var(--border, rgba(0,0,0,0.1))",
              background: "transparent",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Open Zcash Privacy Center &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
