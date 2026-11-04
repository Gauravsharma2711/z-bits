import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, ShieldAlert, AlertTriangle, KeyRound, Check, RefreshCw, Lock, Coins, Ban } from "lucide-react";
import type { SpendingPolicy, CommerceIntegrationStatus, AuditEvent, CurrencyCode } from "../shared/zbits-types";

export function SpendingRulesPanel({ onNotice }: { onNotice?: (msg: string) => void }) {
  const [policy, setPolicy] = useState<SpendingPolicy | null>(null);
  const [integrations, setIntegrations] = useState<CommerceIntegrationStatus[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Local form state
  const [enabled, setEnabled] = useState(true);
  const [maxPerTx, setMaxPerTx] = useState("50");
  const [dailyBudget, setDailyBudget] = useState("150");
  const [monthlyBudget, setMonthlyBudget] = useState("500");
  const [approvalThreshold, setApprovalThreshold] = useState("20");
  const [currency, setCurrency] = useState("USD");
  const [merchants, setMerchants] = useState("bitrefill, steam, amazon_egift, uber_eats");

  const loadData = async () => {
    try {
      setLoading(true);
      const [policyRes, runnerRes, auditRes] = await Promise.all([
        fetch("/api/gate/policy"),
        fetch("/api/runner/integrations"),
        fetch("/api/gate/audit?limit=25"),
      ]);

      if (policyRes.ok) {
        const p: SpendingPolicy = await policyRes.json();
        setPolicy(p);
        setEnabled(p.enabled);
        setMaxPerTx((p.maxPerTransactionCents / 100).toFixed(2));
        setDailyBudget((p.dailyBudgetCents / 100).toFixed(2));
        setMonthlyBudget((p.monthlyBudgetCents / 100).toFixed(2));
        setApprovalThreshold((p.requireApprovalAboveCents / 100).toFixed(2));
        setCurrency(p.currency);
        setMerchants(p.whitelistedMerchants.join(", "));
      }

      if (runnerRes.ok) {
        setIntegrations(await runnerRes.json());
      }

      if (auditRes.ok) {
        setAuditLog(await auditRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Gate policy.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const maxCents = Math.round(parseFloat(maxPerTx || "0") * 100);
      const dailyCents = Math.round(parseFloat(dailyBudget || "0") * 100);
      const monthlyCents = Math.round(parseFloat(monthlyBudget || "0") * 100);
      const approvalCents = Math.round(parseFloat(approvalThreshold || "0") * 100);

      const patch: Partial<SpendingPolicy> = {
        enabled,
        maxPerTransactionCents: Math.max(0, maxCents),
        dailyBudgetCents: Math.max(0, dailyCents),
        monthlyBudgetCents: Math.max(0, monthlyCents),
        requireApprovalAboveCents: Math.max(0, approvalCents),
        currency: currency.toUpperCase().trim() as CurrencyCode,
        whitelistedMerchants: merchants
          .split(",")
          .map((m) => m.trim().toLowerCase())
          .filter(Boolean),
      };

      const res = await fetch("/api/gate/policy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update Gate policy.");
      }

      setMessage("Gate spending policy updated successfully.");
      onNotice?.("Gate spending policy updated successfully.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving policy.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !policy) {
    return <p className="quiet-copy">Loading Gate policies and execution status…</p>;
  }

  return (
    <div className="spending-rules-panel" style={{ maxWidth: 840, paddingBottom: 40 }}>
      {/* Top Banner */}
      <div
        style={{
          background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
          border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
          borderRadius: 12,
          padding: "18px 22px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <ShieldCheck size={22} style={{ color: enabled ? "var(--success, #10b981)" : "var(--danger, #ef4444)" }} />
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Deterministic Financial Gate</h3>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--copy-muted, #8e8e93)" }}>
          Financial decisions in Z-Bits are <strong>never delegated to language models</strong>. All agent purchase intents are verified against these mathematical limits and signed cryptographically with HMAC-SHA256 before the Runner executes them.
        </p>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}
      {message && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(16, 185, 129, 0.1)", color: "#10b981", marginBottom: 16, fontSize: 13 }}>
          {message}
        </div>
      )}

      {/* Main Policy Form */}
      <form onSubmit={handleSave}>
        <div
          style={{
            background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
            border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <strong style={{ fontSize: 15 }}>Autonomous Commerce Gate</strong>
              <div style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
                Emergency kill switch: disable to immediately reject all agent transactions.
              </div>
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: enabled ? "var(--success, #10b981)" : "var(--danger, #ef4444)" }}>
                {enabled ? "Gate Enabled" : "KILL SWITCH ACTIVE"}
              </span>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 18 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Currency
              </label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="USD"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Max per Transaction ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={maxPerTx}
                onChange={(e) => setMaxPerTx(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Daily Budget ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Monthly Budget ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Approval Required Above ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={approvalThreshold}
                onChange={(e) => setApprovalThreshold(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Approved Merchants (comma-separated whitelist)
            </label>
            <input
              type="text"
              value={merchants}
              onChange={(e) => setMerchants(e.target.value)}
              placeholder="bitrefill, steam, amazon_egift, uber_eats"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
            />
            <small style={{ color: "var(--copy-muted, #8e8e93)", fontSize: 11, marginTop: 4, display: "block" }}>
              Intents for merchants outside this list are rejected automatically before reaching the Runner.
            </small>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "9px 20px",
              borderRadius: 8,
              background: "var(--accent, #6366f1)",
              color: "#fff",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Policy"}
          </button>
        </div>
      </form>

      {/* Runner Execution Integrations */}
      <div
        style={{
          background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
          border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Runner Execution Adapters</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {integrations.map((adapter) => (
            <div
              key={adapter.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                borderRadius: 8,
                background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))",
                border: "1px solid var(--border, rgba(0, 0, 0, 0.06))",
              }}
            >
              <div>
                <strong style={{ fontSize: 13 }}>{adapter.name}</strong>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
                  {adapter.description}
                </p>
                <small style={{ fontSize: 11, color: "var(--copy-muted, #8e8e93)" }}>{adapter.notice}</small>
              </div>
              <div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: adapter.enabled ? "rgba(16, 185, 129, 0.1)" : "rgba(142, 142, 147, 0.15)",
                    color: adapter.enabled ? "#10b981" : "#8e8e93",
                  }}
                >
                  {adapter.status.replace("_", " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cryptographic Audit Trail */}
      <div
        style={{
          background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
          border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Gate Audit Log & Signatures</h4>
          <button
            type="button"
            onClick={loadData}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {auditLog.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
            No financial events recorded yet. Intended purchases evaluated by Gate will appear here with cryptographic verification stamps.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {auditLog.map((ev) => (
              <div
                key={ev.id}
                style={{
                  fontSize: 12,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))",
                  borderLeft: `3px solid ${
                    ev.severity === "security_alert"
                      ? "#ef4444"
                      : ev.severity === "warning"
                      ? "#f59e0b"
                      : "#10b981"
                  }`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{ev.kind.replace("_", " ").toUpperCase()}</strong>
                  <span style={{ color: "var(--copy-muted, #8e8e93)" }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <div style={{ color: "var(--copy-secondary, #3a3a3c)", marginTop: 2 }}>
                  Actor: <code>{ev.actor}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
