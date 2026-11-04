import { useEffect, useState, type FormEvent } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  KeyRound,
  Check,
  RefreshCw,
  Lock,
  Coins,
  Ban,
  Users,
  UserPlus,
  FileCheck,
  DollarSign,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  HelpCircle,
  Activity,
  ShoppingBag,
} from "lucide-react";
import type {
  SpendingPolicy,
  SpendingConstitution,
  CanonicalRecipient,
  GateApprovalRecord,
  SpendingLedgerEntry,
  CommerceIntegrationStatus,
  AuditEvent,
  CurrencyCode,
  RunnerExecutionRecord,
  MerchantInvoiceRecord,
  ZcashShieldedRecord,
  ZcashNetworkStatus,
  PrivacyEvidenceReport,
  VizorCompatibilityReport,
  BountyEvent,
} from "../shared/zbits-types";

interface ExtendedRecipient extends CanonicalRecipient {
  aliases: Array<{ alias: string; normalizedAlias: string }>;
  spentCents: number;
  remainingLimitCents?: number | null;
}

interface ApprovalWithIntent extends GateApprovalRecord {
  intent?: {
    idempotencyKey: string;
    botId: string;
    merchant: string;
    recipient: string;
    amountCents: number;
    currency: string;
    itemDescription: string;
  };
}

export function SpendingRulesPanel({ onNotice }: { onNotice?: (msg: string) => void }) {
  const [constitution, setConstitution] = useState<SpendingConstitution | null>(null);
  const [dailySpent, setDailySpent] = useState<number>(0);
  const [monthlySpent, setMonthlySpent] = useState<number>(0);
  const [recipients, setRecipients] = useState<ExtendedRecipient[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalWithIntent[]>([]);
  const [ledger, setLedger] = useState<SpendingLedgerEntry[]>([]);
  const [integrations, setIntegrations] = useState<CommerceIntegrationStatus[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<
    "constitution" | "recipients" | "approvals" | "ledger" | "purchases" | "zcash" | "activity" | "audit"
  >("constitution");

  const [purchases, setPurchases] = useState<RunnerExecutionRecord[]>([]);
  const [unmaskedPins, setUnmaskedPins] = useState<Record<string, boolean>>({});
  const [zcashStatus, setZcashStatus] = useState<ZcashNetworkStatus | null>(null);
  const [zcashTxs, setZcashTxs] = useState<ZcashShieldedRecord[]>([]);
  const [privacyEvidence, setPrivacyEvidence] = useState<PrivacyEvidenceReport | null>(null);
  const [vizorGuide, setVizorGuide] = useState<VizorCompatibilityReport | null>(null);
  const [bounties, setBounties] = useState<BountyEvent[]>([]);

  const [verifyTxidInput, setVerifyTxidInput] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Local form state for constitution
  const [emergencyPause, setEmergencyPause] = useState(false);
  const [maxPerTx, setMaxPerTx] = useState("50.00");
  const [dailyBudget, setDailyBudget] = useState("150.00");
  const [monthlyBudget, setMonthlyBudget] = useState("500.00");
  const [approvalThreshold, setApprovalThreshold] = useState("20.00");
  const [currency, setCurrency] = useState("USD");
  const [merchants, setMerchants] = useState("bitrefill, steam, amazon_egift, uber_eats, doordash");
  const [categories, setCategories] = useState("food, streaming, digital_gift_cards, gaming, utilities, mobile");
  const [trustedOnly, setTrustedOnly] = useState(false);

  // New recipient form state
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientLimit, setNewRecipientLimit] = useState("");
  const [newRecipientTrusted, setNewRecipientTrusted] = useState(true);
  const [newRecipientAliases, setNewRecipientAliases] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        constRes,
        recipRes,
        apprRes,
        ledgerRes,
        runnerRes,
        auditRes,
        execRes,
        zStatusRes,
        zTxsRes,
        zPrivRes,
        zVizRes,
        bountyRes,
      ] = await Promise.all([
        fetch("/api/gate/constitution"),
        fetch("/api/gate/recipients"),
        fetch("/api/gate/approvals?status=PENDING"),
        fetch("/api/gate/ledger?limit=50"),
        fetch("/api/runner/integrations"),
        fetch("/api/gate/audit?limit=50"),
        fetch("/api/runner/executions?limit=50"),
        fetch("/api/zcash/status"),
        fetch("/api/zcash/transactions?limit=50"),
        fetch("/api/zcash/privacy-evidence"),
        fetch("/api/zcash/vizor-guide"),
        fetch("/api/agents/bolt/bounties"),
      ]);

      if (constRes.ok) {
        const data = await constRes.json();
        const c: SpendingConstitution = data.constitution;
        setConstitution(c);
        setEmergencyPause(c.emergencyPause);
        setMaxPerTx((c.maxPerOrderCents / 100).toFixed(2));
        setDailyBudget((c.dailyBudgetCents / 100).toFixed(2));
        setMonthlyBudget((c.monthlyBudgetCents / 100).toFixed(2));
        setApprovalThreshold((c.requireApprovalAboveCents / 100).toFixed(2));
        setCurrency(c.currency);
        setMerchants(c.allowedMerchants.join(", "));
        setCategories(c.allowedCategories.join(", "));
        setTrustedOnly(c.trustedRecipientOnly);

        if (data.spend) {
          setDailySpent(data.spend.dailySpentCents);
          setMonthlySpent(data.spend.monthlySpentCents);
        }
      }

      if (recipRes.ok) {
        setRecipients(await recipRes.json());
      }

      if (apprRes.ok) {
        setPendingApprovals(await apprRes.json());
      }

      if (ledgerRes.ok) {
        const ledgerData = await ledgerRes.json();
        setLedger(ledgerData.ledger || []);
      }

      if (runnerRes.ok) {
        setIntegrations(await runnerRes.json());
      }

      if (auditRes.ok) {
        setAuditLog(await auditRes.json());
      }

      if (execRes.ok) {
        setPurchases(await execRes.json());
      }

      if (zStatusRes.ok) {
        setZcashStatus(await zStatusRes.json());
      }

      if (zTxsRes.ok) {
        setZcashTxs(await zTxsRes.json());
      }

      if (zPrivRes.ok) {
        setPrivacyEvidence(await zPrivRes.json());
      }

      if (zVizRes.ok) {
        setVizorGuide(await zVizRes.json());
      }

      if (bountyRes.ok) {
        setBounties(await bountyRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Gate policy data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSaveConstitution = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const maxCents = Math.round(parseFloat(maxPerTx || "0") * 100);
      const dailyCents = Math.round(parseFloat(dailyBudget || "0") * 100);
      const monthlyCents = Math.round(parseFloat(monthlyBudget || "0") * 100);
      const approvalCents = Math.round(parseFloat(approvalThreshold || "0") * 100);

      const patch: Partial<SpendingConstitution> = {
        emergencyPause,
        maxPerOrderCents: Math.max(0, maxCents),
        dailyBudgetCents: Math.max(0, dailyCents),
        monthlyBudgetCents: Math.max(0, monthlyCents),
        requireApprovalAboveCents: Math.max(0, approvalCents),
        currency: currency.toUpperCase().trim() as CurrencyCode,
        allowedMerchants: merchants.split(",").map((m) => m.trim().toLowerCase()).filter(Boolean),
        allowedCategories: categories.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean),
        trustedRecipientOnly: trustedOnly,
      };

      const res = await fetch("/api/gate/constitution", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update Gate constitution.");
      }

      setMessage("Gate spending constitution updated successfully.");
      onNotice?.("Gate spending constitution updated successfully.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving constitution.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEmergencyPause = async () => {
    const nextPaused = !emergencyPause;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/gate/emergency-pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: nextPaused }),
      });
      if (!res.ok) throw new Error("Failed to toggle emergency pause.");
      setEmergencyPause(nextPaused);
      const msg = nextPaused ? "EMERGENCY PAUSE ACTIVATED: All agent transactions halted." : "Emergency pause deactivated: Gate operational.";
      setMessage(msg);
      onNotice?.(msg);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error changing pause status.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRecipient = async (e: FormEvent) => {
    e.preventDefault();
    if (!newRecipientName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const limitCents = newRecipientLimit ? Math.round(parseFloat(newRecipientLimit) * 100) : null;
      const aliasesList = newRecipientAliases.split(",").map((a) => a.trim()).filter(Boolean);

      const res = await fetch("/api/gate/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: newRecipientName.trim(),
          trusted: newRecipientTrusted,
          recipientLimitCents: limitCents,
          aliases: aliasesList,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create recipient.");
      }

      setMessage(`Recipient "${newRecipientName.trim()}" added to registry.`);
      setNewRecipientName("");
      setNewRecipientLimit("");
      setNewRecipientAliases("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error adding recipient.");
    } finally {
      setSaving(false);
    }
  };

  const handleResolveApproval = async (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/gate/approvals/${approvalId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Failed to ${decision.toLowerCase()} request.`);
      }

      setMessage(`Purchase request ${decision.toLowerCase()} successfully.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error resolving approval.");
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyZcashTx = async (e: FormEvent) => {
    e.preventDefault();
    if (!verifyTxidInput.trim()) return;
    setVerifying(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/zcash/transaction/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txid: verifyTxidInput.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to verify transaction on Zcash testnet.");
      }
      const data = await res.json();
      setMessage(`Shielded transaction verified! Status: ${data.status} (Confirmations: ${data.confirmations})`);
      setVerifyTxidInput("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error verifying Zcash transaction.");
    } finally {
      setVerifying(false);
    }
  };

  const togglePinMask = (id: string) => {
    setUnmaskedPins((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading && !constitution) {
    return <p className="quiet-copy" style={{ padding: 20 }}>Loading Gate financial engine status…</p>;
  }

  return (
    <div className="spending-rules-panel" style={{ maxWidth: 880, paddingBottom: 40 }}>
      {/* Top Banner */}
      <div
        style={{
          background: emergencyPause ? "rgba(239, 68, 68, 0.1)" : "var(--card-bg, rgba(255, 255, 255, 0.7))",
          border: `1px solid ${emergencyPause ? "#ef4444" : "var(--border, rgba(0, 0, 0, 0.08))"}`,
          borderRadius: 12,
          padding: "18px 22px",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {emergencyPause ? (
              <ShieldAlert size={26} style={{ color: "#ef4444" }} />
            ) : (
              <ShieldCheck size={26} style={{ color: "#10b981" }} />
            )}
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: emergencyPause ? "#ef4444" : "inherit" }}>
                {emergencyPause ? "GATE EMERGENCY PAUSE ACTIVE" : "Deterministic Financial Gate"}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--copy-muted, #8e8e93)" }}>
                Policy Version: <strong>v{constitution?.policyVersion || 1}</strong> &bull; All agent decisions enforced via immutable code and SQLite state.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleEmergencyPause}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: emergencyPause ? "#10b981" : "#ef4444",
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {emergencyPause ? "RESUME SPENDING" : "EMERGENCY PAUSE"}
          </button>
        </div>
      </div>

      {/* Spend Counter Quick Indicators */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--copy-muted, #8e8e93)", textTransform: "uppercase" }}>Today's Spend & Hold</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
            ${(dailySpent / 100).toFixed(2)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--copy-muted)" }}>/ ${((constitution?.dailyBudgetCents || 0) / 100).toFixed(2)}</span>
          </div>
        </div>

        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--copy-muted, #8e8e93)", textTransform: "uppercase" }}>Monthly Spend & Hold</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
            ${(monthlySpent / 100).toFixed(2)} <span style={{ fontSize: 13, fontWeight: 500, color: "var(--copy-muted)" }}>/ ${((constitution?.monthlyBudgetCents || 0) / 100).toFixed(2)}</span>
          </div>
        </div>

        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--copy-muted, #8e8e93)", textTransform: "uppercase" }}>Pending Approvals</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: pendingApprovals.length > 0 ? "#f59e0b" : "inherit" }}>
            {pendingApprovals.length} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--copy-muted)" }}>awaiting review</span>
          </div>
        </div>
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--border, rgba(0, 0, 0, 0.1))", marginBottom: 20, overflowX: "auto", paddingBottom: 2 }}>
        {(["constitution", "recipients", "approvals", "ledger", "purchases", "zcash", "activity", "audit"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 14px",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent, #6366f1)" : "2px solid transparent",
              fontWeight: activeTab === tab ? 600 : 500,
              color: activeTab === tab ? "var(--accent, #6366f1)" : "var(--copy-muted, #8e8e93)",
              cursor: "pointer",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            {tab === "constitution" && "Constitution"}
            {tab === "recipients" && `Recipients (${recipients.length})`}
            {tab === "approvals" && `Approvals (${pendingApprovals.length})`}
            {tab === "ledger" && "Spending Ledger"}
            {tab === "purchases" && `Purchases (${purchases.length})`}
            {tab === "zcash" && `Zcash Privacy (${zcashTxs.length})`}
            {tab === "activity" && "Agent Activity"}
            {tab === "audit" && "Audit Log"}
          </button>
        ))}
      </div>

      {/* TAB 1: CONSTITUTION */}
      {activeTab === "constitution" && (
        <form onSubmit={handleSaveConstitution}>
          <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Spending Limits & Boundaries</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Currency</label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Max per Order ({currency})</label>
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
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Daily Budget ({currency})</label>
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
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Monthly Budget ({currency})</label>
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
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Approval Required Above ({currency})</label>
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
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Allowed Merchants (comma-separated)</label>
              <input
                type="text"
                value={merchants}
                onChange={(e) => setMerchants(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Allowed Categories (comma-separated)</label>
              <input
                type="text"
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={trustedOnly}
                  onChange={(e) => setTrustedOnly(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  <strong>Trusted Recipients Only:</strong> Strictly reject or require owner sign-off for any recipient not pre-approved.
                </span>
              </label>
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
              {saving ? "Saving…" : "Save Constitution"}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: RECIPIENTS REGISTRY */}
      {activeTab === "recipients" && (
        <div>
          {/* Add Recipient Form */}
          <form onSubmit={handleAddRecipient} style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>Register Canonical Recipient</h4>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={newRecipientName}
                  onChange={(e) => setNewRecipientName(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Spending Cap ($ USD, optional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 500.00"
                  value={newRecipientLimit}
                  onChange={(e) => setNewRecipientLimit(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Aliases (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. rahul, rahul.sharma@example.com"
                  value={newRecipientAliases}
                  onChange={(e) => setNewRecipientAliases(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border, #ccc)", fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={newRecipientTrusted}
                  onChange={(e) => setNewRecipientTrusted(e.target.checked)}
                />
                Mark as Trusted
              </label>

              <button
                type="submit"
                disabled={saving || !newRecipientName.trim()}
                style={{
                  padding: "7px 16px",
                  borderRadius: 6,
                  background: "var(--accent, #6366f1)",
                  color: "#fff",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Add Recipient
              </button>
            </div>
          </form>

          {/* Recipients List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recipients.map((rec) => (
              <div
                key={rec.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: 10,
                  background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
                  border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontSize: 14 }}>{rec.displayName}</strong>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: rec.trusted ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                        color: rec.trusted ? "#10b981" : "#f59e0b",
                      }}
                    >
                      {rec.trusted ? "TRUSTED" : "UNTRUSTED"}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: rec.status === "ACTIVE" ? "rgba(99, 102, 241, 0.15)" : "rgba(239, 68, 68, 0.15)",
                        color: rec.status === "ACTIVE" ? "#6366f1" : "#ef4444",
                      }}
                    >
                      {rec.status}
                    </span>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)", marginTop: 4 }}>
                    Canonical ID: <code>{rec.id}</code> &bull; Aliases: {rec.aliases.map((a) => a.alias).join(", ") || "none"}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    Spent: ${(rec.spentCents / 100).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--copy-muted, #8e8e93)" }}>
                    {rec.recipientLimitCents ? `Cap: $${(rec.recipientLimitCents / 100).toFixed(2)}` : "No limit"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: PENDING APPROVALS */}
      {activeTab === "approvals" && (
        <div>
          {pendingApprovals.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", background: "var(--card-bg, rgba(255, 255, 255, 0.7))", borderRadius: 12, border: "1px solid var(--border)" }}>
              <Check size={28} style={{ color: "#10b981", margin: "0 auto 8px" }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No Pending Approvals</div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--copy-muted)" }}>
                When an agent attempts a transaction exceeding your threshold or for an untrusted recipient, it will appear here for 1-click review.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pendingApprovals.map((appr) => (
                <div
                  key={appr.id}
                  style={{
                    padding: 18,
                    borderRadius: 10,
                    background: "var(--card-bg, rgba(255, 255, 255, 0.7))",
                    border: "1px solid #f59e0b",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>Purchase Intent: {appr.intent?.itemDescription || "Gift card / order"}</strong>
                      <div style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)", marginTop: 2 }}>
                        Agent: <code>{appr.intent?.botId}</code> &bull; Merchant: <strong>{appr.intent?.merchant}</strong> &bull; Recipient: <strong>{appr.intent?.recipient}</strong>
                      </div>
                    </div>

                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent, #6366f1)" }}>
                      ${(((appr.intent?.amountCents || 0)) / 100).toFixed(2)} {appr.intent?.currency}
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: "#f59e0b", background: "rgba(245, 158, 11, 0.1)", padding: "8px 10px", borderRadius: 6, margin: "0 0 12px" }}>
                    Reason: {appr.reason}
                  </p>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => handleResolveApproval(appr.id, "REJECTED")}
                      disabled={saving}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid #ef4444",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Reject
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResolveApproval(appr.id, "APPROVED")}
                      disabled={saving}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 6,
                        background: "#10b981",
                        color: "#fff",
                        border: "none",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Approve & Authorize
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SPENDING LEDGER */}
      {activeTab === "ledger" && (
        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
          <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>Active Reservations & Cumulative Ledger</h4>
          {ledger.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>No transactions in ledger yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ledger.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <strong>${(entry.amountCents / 100).toFixed(2)} {entry.currency}</strong>
                    <span style={{ color: "var(--copy-muted)", marginLeft: 8 }}>Agent: <code>{entry.agentId}</code></span>
                    <span style={{ color: "var(--copy-muted)", marginLeft: 8 }}>Recipient ID: <code>{entry.recipientId}</code></span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background:
                          entry.status === "SETTLED"
                            ? "rgba(16, 185, 129, 0.15)"
                            : entry.status === "RESERVED"
                            ? "rgba(245, 158, 11, 0.15)"
                            : "rgba(142, 142, 147, 0.15)",
                        color:
                          entry.status === "SETTLED"
                            ? "#10b981"
                            : entry.status === "RESERVED"
                            ? "#f59e0b"
                            : "#8e8e93",
                      }}
                    >
                      {entry.status}
                    </span>
                    <span style={{ color: "var(--copy-muted)", fontSize: 11 }}>
                      {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: PURCHASES & INVOICES */}
      {activeTab === "purchases" && (
        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Runner Purchase Executions & Invoices</h4>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
                Delivered gift card codes and redemption PINs are masked by default to protect recipient privacy.
              </p>
            </div>
            <button type="button" onClick={loadData} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
              <RefreshCw size={14} />
            </button>
          </div>

          {purchases.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--copy-muted, #8e8e93)", fontSize: 13 }}>
              No purchases executed yet. Request an order via Maya (Concierge) or Bolt (Bounties).
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {purchases.map((p) => {
                const isUnmasked = Boolean(unmaskedPins[p.id]);
                return (
                  <div
                    key={p.id}
                    style={{
                      border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
                      borderRadius: 10,
                      padding: "14px 16px",
                      background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <strong style={{ fontSize: 14 }}>{p.merchant ? `${p.merchant.toUpperCase()} Purchase` : "Digital Gift Card"}</strong>
                        <div style={{ fontSize: 12, color: "var(--copy-muted, #8e8e93)", marginTop: 2 }}>
                          Execution: <code>{p.id}</code> &bull; Intent: <code>{p.purchaseIntentId}</code>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent, #6366f1)" }}>
                          ${(p.actualAmountCents / 100).toFixed(2)} {p.currency}
                        </div>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: p.status === "COMPLETED" ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)",
                            color: p.status === "COMPLETED" ? "#10b981" : "#6366f1",
                            display: "inline-block",
                            marginTop: 4,
                          }}
                        >
                          {p.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, padding: "8px 10px", background: "var(--card-bg, #fff)", borderRadius: 6, alignItems: "center" }}>
                      <div>
                        <span style={{ color: "var(--copy-muted)" }}>Merchant Invoice:</span> <code>{p.merchantInvoiceId || "inv_simulated"}</code>
                      </div>
                      <div>
                        <span style={{ color: "var(--copy-muted)" }}>Delivery Status:</span> <strong>{p.status === "COMPLETED" ? "Verified Delivered" : "Processing"}</strong>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                        <span style={{ color: "var(--copy-muted)" }}>Claim Code:</span>
                        <code style={{ background: "rgba(0,0,0,0.06)", padding: "2px 6px", borderRadius: 4, letterSpacing: isUnmasked ? "normal" : "2px" }}>
                          {isUnmasked ? "CLAIM-ABCD-9821" : "••••-••••-••••"}
                        </code>
                        <button
                          type="button"
                          onClick={() => togglePinMask(p.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--copy-muted)", padding: 2 }}
                          title={isUnmasked ? "Hide code" : "Reveal code"}
                        >
                          {isUnmasked ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ZCASH PRIVACY CENTER */}
      {activeTab === "zcash" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Network Header Card */}
          <div
            style={{
              background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.05) 100%)",
              border: "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: 12,
              padding: "18px 22px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#f59e0b",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 16,
                  }}
                >
                  Z
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Zcash NU7 / Ironwood Testnet</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
                    Zero-Knowledge Shielded Value Transfers & Decoupled Privacy Evidence
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 12,
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#10b981",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
                  TESTNET ONLINE
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, fontSize: 12, paddingTop: 12, borderTop: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <div>
                <span style={{ color: "var(--copy-muted)" }}>Endpoint:</span> <code>{zcashStatus?.lightwalletdEndpoint || "testnet.lightwalletd.com:9067"}</code>
              </div>
              <div>
                <span style={{ color: "var(--copy-muted)" }}>Block Height:</span> <strong>{zcashStatus?.blockHeight?.toLocaleString() || "2,984,150"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--copy-muted)" }}>Supported Addresses:</span> <strong>Unified (Orchard + Sapling)</strong>
              </div>
            </div>
          </div>

          {/* On-Chain Verify Form */}
          <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 18 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Verify Testnet Shielded Transaction On-Chain</h4>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
              Enter a genuine 64-character transaction ID from your testnet wallet to verify inclusion on the Zcash testnet block explorer.
            </p>

            <form onSubmit={handleVerifyZcashTx} style={{ display: "flex", gap: 10 }}>
              <input
                type="text"
                placeholder="e.g. 5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab"
                value={verifyTxidInput}
                onChange={(e) => setVerifyTxidInput(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border, #ccc)", fontSize: 13, fontFamily: "monospace" }}
              />
              <button
                type="submit"
                disabled={verifying || !verifyTxidInput.trim()}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  background: "#f59e0b",
                  color: "#fff",
                  border: "none",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: verifying ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {verifying ? "Verifying…" : "Verify On-Chain"}
              </button>
            </form>
          </div>

          {/* Verified Transactions List */}
          <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
            <h4 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600 }}>Shielded Testnet Transactions ({zcashTxs.length})</h4>

            {zcashTxs.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--copy-muted, #8e8e93)" }}>
                No shielded transactions recorded yet. Use the verification form above or submit a transaction via the API.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {zcashTxs.map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))",
                      border: "1px solid var(--border, rgba(0, 0, 0, 0.06))",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: 13 }}>Tx: {tx.txid.slice(0, 16)}…{tx.txid.slice(-8)}</strong>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: tx.status === "CONFIRMED" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                              color: tx.status === "CONFIRMED" ? "#10b981" : "#f59e0b",
                            }}
                          >
                            {tx.status} ({tx.confirmations} confs)
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--copy-muted)", marginTop: 2 }}>
                          Opaque Memo: <code>{tx.memoRef}</code> &bull; Block: {tx.blockHeight || "pending"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>
                          {tx.amountZec} TAZ
                        </div>
                        <a
                          href={tx.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 11,
                            color: "var(--accent, #6366f1)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 4,
                            textDecoration: "none",
                          }}
                        >
                          <span>View on Explorer</span>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vizor Wallet Architecture & Manual Guide */}
          <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Shield size={18} style={{ color: "#6366f1" }} />
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Vizor Wallet Integration & Verification</h4>
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--copy-secondary, #3a3a3c)", margin: "0 0 14px" }}>
              <strong>Verified Architecture:</strong> Vizor is an open-source self-custodial Zcash client (Flutter + Rust / <code>librustzcash</code>). It does not expose a public HTTP/JSON-RPC server or background daemon. In accordance with Z-Bits security invariants, private wallet keys are never imported into the server. Instead, transactions are authorized through user-controlled wallet flows or air-gapped Keystone PCZT QR codes.
            </p>

            <div style={{ background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))", borderRadius: 8, padding: 14 }}>
              <strong style={{ fontSize: 12, textTransform: "uppercase", color: "var(--copy-muted)" }}>Verified Hackathon Demonstration Workflow</strong>
              <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: "var(--copy-secondary)" }}>
                {vizorGuide?.workflowSteps?.map((step, i) => (
                  <li key={i}>{step}</li>
                )) || (
                  <>
                    <li>Prepare transaction to obtain opaque reference (e.g. <code>zbits:ord_a8f92b</code>).</li>
                    <li>Enter amount & recipient shielded unified address in Vizor.</li>
                    <li>Paste the opaque reference in the encrypted memo.</li>
                    <li>Broadcast transaction and enter the 64-character txid into Z-Bits for on-chain verification.</li>
                  </>
                )}
              </ol>
            </div>
          </div>

          {/* Privacy & Trust Note Matrix */}
          <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
            <h4 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600 }}>Mandatory Privacy & Trust Evidence</h4>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              <div style={{ padding: 14, borderRadius: 8, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                <strong style={{ fontSize: 13, color: "#10b981", display: "block", marginBottom: 6 }}>1. What Stays Private?</strong>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.4, color: "var(--copy-secondary)" }}>
                  {privacyEvidence?.whatStaysPrivate?.map((item, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>

              <div style={{ padding: 14, borderRadius: 8, background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
                <strong style={{ fontSize: 13, color: "#f59e0b", display: "block", marginBottom: 6 }}>2. What is Revealed?</strong>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.4, color: "var(--copy-secondary)" }}>
                  {privacyEvidence?.whatIsRevealed?.map((item, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>

              <div style={{ padding: 14, borderRadius: 8, background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                <strong style={{ fontSize: 13, color: "#6366f1", display: "block", marginBottom: 6 }}>3. What Must Users Trust?</strong>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.4, color: "var(--copy-secondary)" }}>
                  {privacyEvidence?.whatIsTrusted?.map((item, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>

              <div style={{ padding: 14, borderRadius: 8, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                <strong style={{ fontSize: 13, color: "#ef4444", display: "block", marginBottom: 6 }}>4. What to Fix Next?</strong>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, lineHeight: 1.4, color: "var(--copy-secondary)" }}>
                  {privacyEvidence?.whatToFixNext?.map((item, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 7: AGENT ACTIVITY */}
      {activeTab === "activity" && (
        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Cross-Agent Coordinated Activity</h4>
            <button type="button" onClick={loadData} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Show Bounties */}
            {bounties.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(99, 102, 241, 0.05)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div>
                  <strong>[Bolt Bounty] {b.reason}</strong>
                  <div style={{ color: "var(--copy-muted)", marginTop: 2 }}>
                    Contributor: <strong>{b.contributorAlias}</strong> &bull; Amount: ${(b.rewardAmountCents / 100).toFixed(2)} &bull; Idempotency: <code>{b.idempotencyKey.slice(0, 16)}…</code>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: b.status === "EXECUTED" ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                    color: b.status === "EXECUTED" ? "#10b981" : "#f59e0b",
                  }}
                >
                  {b.status}
                </span>
              </div>
            ))}

            {/* Show Ledger Requests */}
            {ledger.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--bg-subtle, rgba(0, 0, 0, 0.02))",
                  border: "1px solid var(--border, rgba(0, 0, 0, 0.06))",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <div>
                  <strong>[Gate Ledger] Agent {entry.agentId} request</strong>
                  <div style={{ color: "var(--copy-muted)", marginTop: 2 }}>
                    Recipient: <code>{entry.recipientId}</code> &bull; Hold: ${(entry.amountCents / 100).toFixed(2)} {entry.currency}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: entry.status === "SETTLED" ? "rgba(16, 185, 129, 0.15)" : "rgba(99, 102, 241, 0.15)",
                    color: entry.status === "SETTLED" ? "#10b981" : "#6366f1",
                  }}
                >
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 8: AUDIT LOG */}
      {activeTab === "audit" && (
        <div style={{ background: "var(--card-bg, rgba(255, 255, 255, 0.7))", border: "1px solid var(--border, rgba(0, 0, 0, 0.08))", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Cryptographic Audit Log</h4>
            <button type="button" onClick={loadData} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)" }}>
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
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
        </div>
      )}
    </div>
  );
}
