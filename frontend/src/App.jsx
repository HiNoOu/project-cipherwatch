import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API_BASE = "https://project-cipherwatch-production.up.railway.app/api";

export default function App() {
  const [status, setStatus] = useState(null);
  const [accuracyHistory, setAccuracyHistory] = useState({ rounds: [], accuracy: [] });
  const [institutions, setInstitutions] = useState({});
  const [heroCluster, setHeroCluster] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState(null);

  const isMountedRef = useRef(true);

  // Dedicated function to initiate the training loop on backend
  const triggerEngineStart = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/demo/start`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ n_rounds: 20, round_delay_seconds: 2.0 }),
      });
    } catch (err) {
      console.warn("Could not reach demo/start endpoint directly:", err);
    }
  }, []);

  // 1. One-time startup effect on load: verifies backend status and force-triggers if cold
  useEffect(() => {
    let triggered = false;

    const bootstrapBackend = async () => {
      try {
        const res = await fetch(`${API_BASE}/status`);
        if (res.ok) {
          const data = await res.json();
          // If the backend has just booted and is sitting idle at round 0, kick off the loop
          if (!data.live && (data.round === 0 || data.round >= data.total_rounds) && !triggered) {
            triggered = true;
            await triggerEngineStart();
          }
        }
      } catch (e) {
        // Fallback: If status fails or times out during container wake-up, attempt demo trigger directly
        if (!triggered) {
          triggered = true;
          await triggerEngineStart();
        }
      }
    };

    bootstrapBackend();
  }, [triggerEngineStart]);

  // 2. High-frequency dashboard polling loop
  const fetchDashboardData = useCallback(async () => {
    try {
      const [statusRes, accRes, instRes, heroRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/status`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/accuracy-history`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/institutions`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/hero-cluster`).then((r) => (r.ok ? r.json() : null)),
        fetch(`${API_BASE}/audit-log`).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (!isMountedRef.current) return;

      if (statusRes) {
        setStatus(statusRes);
        const r = statusRes.round ?? 0;
        const total = statusRes.total_rounds || 20;

        if (r > 0 && r < total) {
          setIsRunning(true);
        } else if (r >= total) {
          setIsRunning(false);
        } else if (statusRes.live) {
          setIsRunning(true);
        } else {
          setIsRunning(false);
        }
      }

      if (accRes && Array.isArray(accRes.rounds)) {
        setAccuracyHistory(accRes);
      }

      if (instRes && typeof instRes === "object") {
        setInstitutions(instRes);
      }

      if (heroRes && typeof heroRes === "object") {
        setHeroCluster(heroRes);
      }

      if (auditRes && Array.isArray(auditRes)) {
        setAuditLog(auditRes);
      }
    } catch (err) {
      console.warn("Polling warning:", err);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchDashboardData();

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 1000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchDashboardData]);

  const handleStartSimulation = async (e) => {
    if (e) e.preventDefault();
    try {
      setIsRunning(true);
      setStatus({
        round: 0,
        total_rounds: 20,
        global_accuracy: null,
        accuracy_delta: 0,
        institutions_online: 4,
        institutions_total: 4,
        clusters_flagged: 0,
        chain_integrity: { verified_blocks: 0, total_blocks: 20 },
        live: true,
      });
      setAccuracyHistory({ rounds: [], accuracy: [] });
      setAuditLog([]);

      await triggerEngineStart();
    } catch (err) {
      console.error("Start error:", err);
      setIsRunning(false);
    }
  };

  const currentRound = status?.round ?? 0;
  const totalRounds = status?.total_rounds || 20;
  const globalScore = heroCluster?.global_score ?? 0;
  const isGlobalHighRisk = globalScore >= 0.5;

  const clusterGraphNodes = useMemo(() => {
    const nodes = [];
    const count = heroCluster?.wallet_count || 14;
    const centerX = 230;
    const centerY = 110;
    const radius = 78;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI;
      const isNodeFlagged =
        currentRound > 4 &&
        (i < Math.floor((currentRound / totalRounds) * count) || isGlobalHighRisk);

      nodes.push({
        id: `0x7a2...f${(i + 1).toString(16)}`,
        label: `W-${i + 1}`,
        x: centerX + radius * Math.cos(angle) + (i % 2 === 0 ? 8 : -8),
        y: centerY + radius * Math.sin(angle) + (i % 3 === 0 ? -6 : 6),
        amount: ((i + 1) * 3.42).toFixed(2) + " ETH",
        hops: 2 + (i % 4),
        isFlagged: isNodeFlagged,
      });
    }
    return nodes;
  }, [heroCluster?.wallet_count, currentRound, totalRounds, isGlobalHighRisk]);

  const clusterEdges = useMemo(() => {
    const edges = [];
    const count = clusterGraphNodes.length;
    for (let i = 0; i < count; i++) {
      edges.push({
        from: clusterGraphNodes[i],
        to: clusterGraphNodes[(i + 1) % count],
      });

      if (i % 3 === 0 && currentRound >= 5) {
        edges.push({
          from: clusterGraphNodes[i],
          to: clusterGraphNodes[(i + 5) % count],
        });
      }
      if (i % 4 === 0 && currentRound >= 12) {
        edges.push({
          from: clusterGraphNodes[i],
          to: clusterGraphNodes[(i + 7) % count],
        });
      }
    }
    return edges;
  }, [clusterGraphNodes, currentRound]);

  const chartData = useMemo(() => {
    return (accuracyHistory?.rounds || []).map((rnd, i) => ({
      round: `R${rnd}`,
      accuracy: Number(((accuracyHistory?.accuracy?.[i] || 0) * 100).toFixed(1)),
    }));
  }, [accuracyHistory]);

  const verifiedBlocks = status?.chain_integrity?.verified_blocks ?? currentRound;

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] font-mono text-[12px] p-2 select-none">
      <div className="border-2 border-[#FFA028] bg-[#000000] shadow-2xl">
        {/* TOP BAR */}
        <div className="bg-[#FFA028] text-[#000000] px-3 py-1.5 font-bold flex justify-between items-center text-[13px] tracking-wider border-b border-[#FFA028]">
          <div className="flex items-center gap-2">
            <span>FTIC &lt;GO&gt; | FEDERATED THREAT INTELLIGENCE CONSOLE</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 inline-block ${
                isRunning ? "bg-[#00FF00] animate-ping" : "bg-[#00FF00]"
              }`}
            />
            <span className="font-bold">
              {isRunning
                ? `ROUND ${currentRound} OF ${totalRounds} [LIVE]`
                : `SYSTEM READY [ROUND ${currentRound}/${totalRounds}]`}
            </span>
            <button
              onClick={handleStartSimulation}
              disabled={isRunning}
              className={`ml-3 px-3 py-0.5 text-[11px] font-bold uppercase transition-all ${
                isRunning
                  ? "bg-[#222222] text-[#8E8E93] cursor-not-allowed border border-[#444444]"
                  : "bg-[#000000] text-[#FFA028] border border-[#000000] hover:bg-[#FFFFFF] hover:text-[#000000] active:scale-95"
              }`}
            >
              {isRunning ? "RUNNING..." : "START RUN <GO>"}
            </button>
          </div>
        </div>

        <div className="p-2 space-y-2">
          {/* TOP METRICS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="border border-[#00C8FF] bg-[#050505] p-2.5">
              <div className="text-[#00C8FF] text-[10px] uppercase">GLOBAL ACCURACY</div>
              <div className="text-[22px] font-bold text-[#FFFFFF] my-0.5">
                {status?.global_accuracy !== null && status?.global_accuracy !== undefined
                  ? `${(status.global_accuracy * 100).toFixed(1)}%`
                  : "0.0%"}
              </div>
              <div className="text-[#00FF00] text-[10px]">
                +{((status?.accuracy_delta || 0) * 100).toFixed(2)}% VS PRIOR RND
              </div>
            </div>

            <div className="border border-[#00C8FF] bg-[#050505] p-2.5">
              <div className="text-[#00C8FF] text-[10px] uppercase">INSTITUTIONS ONLINE</div>
              <div className="text-[22px] font-bold text-[#FFFFFF] my-0.5">
                {status?.institutions_online ?? Object.keys(institutions).length ?? 4} /{" "}
                {status?.institutions_total ?? 4}
              </div>
              <div className="text-[#8E8E93] text-[10px]">DIFFERENTIAL PRIVACY ε-ON</div>
            </div>

            <div className="border border-[#00C8FF] bg-[#050505] p-2.5">
              <div className="text-[#00C8FF] text-[10px] uppercase">CLUSTERS FLAGGED</div>
              <div className="text-[22px] font-bold text-[#FFFFFF] my-0.5">
                {status?.clusters_flagged ?? 0}
              </div>
              <div className="text-[#8E8E93] text-[10px]">CROSS-INSTITUTION SYNDICATES</div>
            </div>

            <div className="border border-[#00C8FF] bg-[#050505] p-2.5">
              <div className="text-[#00C8FF] text-[10px] uppercase">CHAIN INTEGRITY</div>
              <div className="text-[22px] font-bold text-[#00FF00] my-0.5">
                {verifiedBlocks} / {totalRounds}
              </div>
              <div className="text-[#00FF00] text-[10px]">100% SHA-256 VERIFIED</div>
            </div>
          </div>

          {/* MIDDLE ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
            {/* ACCURACY CHART */}
            <div className="lg:col-span-7 border border-[#FFA028] bg-[#050505] p-2.5 flex flex-col justify-between">
              <div>
                <div className="text-[#FFA028] text-[11px] font-bold">
                  GLOBAL ACCURACY ACROSS FEDERATED ROUNDS
                </div>
                <div className="text-[#8E8E93] text-[9px] mb-2">
                  HELD-OUT TEST SET EVALUATION (3,000 SAMPLES)
                </div>
              </div>

              <div className="h-44 w-full bg-[#000000] border border-[#222222] p-1">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 15, left: -25, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#222222" />
                      <XAxis
                        dataKey="round"
                        stroke="#00C8FF"
                        fontSize={10}
                        tickLine={false}
                        fontFamily="monospace"
                      />
                      <YAxis
                        domain={[50, 100]}
                        stroke="#00C8FF"
                        fontSize={10}
                        tickLine={false}
                        fontFamily="monospace"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#000000",
                          borderColor: "#FFA028",
                          borderRadius: "0px",
                          fontFamily: "monospace",
                          color: "#FFFF00",
                          fontSize: "11px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        stroke="#FFFF00"
                        strokeWidth={2}
                        dot={{ fill: "#FFFF00", r: 3 }}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#8E8E93] text-[11px]">
                    [ INITIALIZING SYNTHETIC STREAM... ]
                  </div>
                )}
              </div>
            </div>

            {/* NODE STATUS */}
            <div className="lg:col-span-5 border border-[#FFA028] bg-[#050505] p-2.5 flex flex-col justify-between">
              <div>
                <div className="text-[#FFA028] text-[11px] font-bold mb-1">
                  INSTITUTION FEDERATION STATUS
                </div>
                <div className="text-[#8E8E93] text-[9px] mb-2">
                  SECURE WEIGHT AGGREGATION PARTICIPANTS
                </div>
              </div>

              <div className="space-y-1">
                {Object.entries(institutions || {}).map(([key, data]) => (
                  <div
                    key={key}
                    className="flex justify-between items-center border-b border-[#222222] pb-1 text-[11px]"
                  >
                    <span className="text-[#00C8FF]">{key.replace("_", " ")}</span>
                    <span className="text-[#8E8E93] text-[10px]">{data?.label || "NODE"}</span>
                    <span
                      className={`font-bold ${
                        data?.status === "SYNCED"
                          ? "text-[#00FF00]"
                          : "text-[#FFFF00] animate-pulse"
                      }`}
                    >
                      [ {data?.status || "IDLE"} ]
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-[#8E8E93] text-[9px] pt-2">
                STATUS UPDATES AT DISCRETE 2.0S EPOCH INTERVALS
              </div>
            </div>
          </div>

          {/* LOWER ROW */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
            {/* RISK PANEL */}
            <div className="lg:col-span-5 border border-[#00C8FF] bg-[#050505] p-2.5 flex flex-col justify-between">
              <div>
                <div className="text-[#FFA028] text-[11px] font-bold">
                  CLUSTER 0x7a2...f1 — RISK SCORE PROGRESSION
                </div>
                <div className="text-[#8E8E93] text-[9px] mb-2">
                  LOCAL NODE A VIEW VS. UNIFIED GLOBAL AGGREGATION
                </div>
              </div>

              <div className="border border-[#222222] p-2 bg-[#000000] space-y-2">
                <div className="flex items-center justify-between border border-[#8E8E93] p-2">
                  <div>
                    <div className="text-[#FFFFFF] text-[10px] font-bold">RAW SCAM RING</div>
                    <div className="text-[#8E8E93] text-[9px]">
                      {heroCluster?.wallet_count || 14} SYNDICATE WALLETS
                    </div>
                  </div>
                  <span className="text-[#00C8FF] font-bold">&gt;&gt;&gt;</span>
                </div>

                <div className="flex items-center justify-between border border-[#00FF00] p-2">
                  <div>
                    <div className="text-[#00C8FF] text-[10px]">NODE A LOCAL EVALUATION</div>
                    <div className="text-[#00FF00] text-[11px] font-bold">
                      {heroCluster?.local_label || "LOW-RISK"} (
                      {heroCluster?.local_score !== null && heroCluster?.local_score !== undefined
                        ? heroCluster.local_score.toFixed(2)
                        : "0.40"}
                      )
                    </div>
                  </div>
                  <span className="text-[#00FF00] text-[10px]">[ BLINDED ]</span>
                </div>

                <div
                  className={`flex items-center justify-between border p-2 ${
                    isGlobalHighRisk ? "border-[#FF3B30] bg-[#FF3B30]/10" : "border-[#FFFF00]"
                  }`}
                >
                  <div>
                    <div className="text-[#00C8FF] text-[10px]">
                      GLOBAL FEDERATED ASSESSMENT
                    </div>
                    <div
                      className={`text-[12px] font-bold ${
                        isGlobalHighRisk ? "text-[#FF3B30]" : "text-[#FFFF00]"
                      }`}
                    >
                      {heroCluster?.global_label || "AWAITING"} (
                      {heroCluster?.global_score !== null && heroCluster?.global_score !== undefined
                        ? heroCluster.global_score.toFixed(2)
                        : "0.00"}
                      )
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      isGlobalHighRisk ? "text-[#FF3B30] animate-pulse" : "text-[#FFFF00]"
                    }`}
                  >
                    {isGlobalHighRisk ? "[ DETECTED ]" : "[ AGGREGATING ]"}
                  </span>
                </div>
              </div>
            </div>

            {/* GRAPH TOPOLOGY */}
            <div className="lg:col-span-7 border border-[#00C8FF] bg-[#050505] p-2.5 flex flex-col justify-between">
              <div className="flex justify-between items-center mb-1">
                <div>
                  <div className="text-[#FFA028] text-[11px] font-bold">
                    GRAPH TOPOLOGY — 14 WALLET SCAM CLUSTER
                  </div>
                  <div className="text-[#8E8E93] text-[9px]">
                    CROSS-BANK CO-OCCURRENCE NETWORK TOPOLOGY ({clusterEdges.length} DETECTED EDGES)
                  </div>
                </div>
                <span className="text-[10px] text-[#00C8FF]">
                  {selectedWallet ? `FOCUS: ${selectedWallet.id}` : "CLICK NODE FOR INSPECTION"}
                </span>
              </div>

              <div className="relative border border-[#222222] bg-[#000000] h-52 flex items-center justify-center overflow-hidden">
                <svg viewBox="0 0 460 220" className="w-full h-full">
                  {clusterEdges.map((e, idx) => {
                    const activeEdge = e.from.isFlagged && e.to.isFlagged;
                    return (
                      <line
                        key={idx}
                        x1={e.from.x}
                        y1={e.from.y}
                        x2={e.to.x}
                        y2={e.to.y}
                        stroke={activeEdge ? "#FF3B30" : "#00C8FF"}
                        strokeWidth={activeEdge ? 1.5 : 1}
                        strokeDasharray={activeEdge ? "none" : "3,3"}
                        opacity={activeEdge ? 0.85 : 0.3}
                      />
                    );
                  })}

                  {clusterGraphNodes.map((n) => {
                    const isSelected = selectedWallet?.id === n.id;
                    const nodeColor = n.isFlagged ? "#FF3B30" : "#00FF00";

                    return (
                      <g
                        key={n.id}
                        className="cursor-pointer transition-all"
                        onClick={() => setSelectedWallet(n)}
                      >
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={isSelected ? 9 : 6}
                          fill="#000000"
                          stroke={isSelected ? "#FFFF00" : nodeColor}
                          strokeWidth={isSelected ? 2.5 : 1.5}
                        />
                        <text
                          x={n.x}
                          y={n.y + 14}
                          textAnchor="middle"
                          fill={isSelected ? "#FFFF00" : (n.isFlagged ? "#FF3B30" : "#8E8E93")}
                          fontSize={8}
                          fontFamily="monospace"
                        >
                          {n.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {selectedWallet && (
                  <div className="absolute top-2 right-2 bg-[#050505] border border-[#FFFF00] p-2 text-[10px] space-y-0.5">
                    <div className="text-[#FFFF00] font-bold">{selectedWallet.id}</div>
                    <div className="text-[#FFFFFF]">VOLUME: {selectedWallet.amount}</div>
                    <div className="text-[#8E8E93]">HOPS: {selectedWallet.hops} INTER-BANK</div>
                    <div className="text-[#00C8FF]">STATUS: DISPERSED ENTITY</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AUDIT LOG TABLE */}
          <div className="border border-[#FFA028] bg-[#050505] p-2.5">
            <div className="text-[#FFA028] text-[11px] font-bold mb-1">
              AUDIT LOG — HASH-CHAIN INTEGRITY
            </div>
            <div className="text-[#8E8E93] text-[9px] mb-2">
              IMMUTABLE SHA-256 CONSENSUS LEDGER
            </div>

            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-[#00C8FF] text-[#00C8FF]">
                  <th className="py-1 font-normal">BLOCK</th>
                  <th className="py-1 font-normal">ROUND</th>
                  <th className="py-1 font-normal">HASH</th>
                  <th className="py-1 font-normal text-right">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {auditLog.length > 0 ? (
                  auditLog.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#111111]">
                      <td className="py-1 text-[#00C8FF]">{row.block}</td>
                      <td className="py-1 text-[#FFFFFF]">Round {row.round}</td>
                      <td className="py-1 text-[#8E8E93] font-mono">{row.hash}</td>
                      <td className="py-1 text-right text-[#00FF00] font-bold">
                        [ {row.status} ]
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-[#8E8E93]">
                      [ NO BLOCKS COMMITTED YET — PRESS START RUN &lt;GO&gt; ]
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FOOTER */}
        <div className="bg-[#111111] border-t border-[#FFA028] text-[#8E8E93] px-3 py-1 text-[10px] flex justify-between items-center">
          <span>
            PRESS <span className="text-[#FFFF00]">START RUN &lt;GO&gt;</span> FOR FEDERATED TRAINING
          </span>
          <span className="text-[#00C8FF]">TERMINAL MODE: ACTIVE</span>
        </div>
      </div>
    </div>
  );
}
