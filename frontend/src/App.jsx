import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const API_BASE =
  "https://project-cipherwatch-production.up.railway.app/api";

const BLUE = "#00C8FF";
const DARK = "#FFFFFF";
const TEXT = "#FFFFFF";
const MUTED = "#8E8E93";
const BORDER = "#333333";
const LIGHT_BLUE = "#101820";
const GREEN = "#00FF00";
const LIGHT_GREEN = "#001A00";
const RED = "#FF3B30";

export default function App() {
  // ============================================================
  // STATE
  // ============================================================

  const [status, setStatus] = useState(null);

  const [accuracyHistory, setAccuracyHistory] = useState({
    rounds: [],
    accuracy: [],
  });

  const [institutions, setInstitutions] = useState({});
  const [heroCluster, setHeroCluster] = useState(null);
  const [auditLog, setAuditLog] = useState([]);

  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [selectedWallet, setSelectedWallet] = useState(null);

  const [activePage, setActivePage] = useState("Dashboard");

  const isMountedRef = useRef(true);

  // ============================================================
  // FETCH DASHBOARD DATA
  // ============================================================

  const fetchDashboardData = useCallback(async () => {
    try {
      const t = Date.now();

      const [
        statusRes,
        accRes,
        instRes,
        heroRes,
        auditRes,
      ] = await Promise.all([
        fetch(`${API_BASE}/status?t=${t}`, {
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),

        fetch(`${API_BASE}/accuracy-history?t=${t}`, {
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),

        fetch(`${API_BASE}/institutions?t=${t}`, {
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),

        fetch(`${API_BASE}/hero-cluster?t=${t}`, {
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),

        fetch(`${API_BASE}/audit-log?t=${t}`, {
          cache: "no-store",
        }).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (!isMountedRef.current) return;

      // STATUS
      if (statusRes) {
        setStatus(statusRes);

        const round = Number(statusRes.round ?? 0);
        const total = Number(statusRes.total_rounds ?? 20);

        if (round > 0 && round < total) {
          setIsRunning(true);
        } else if (round >= total) {
          setIsRunning(false);
        } else if (statusRes.live) {
          setIsRunning(true);
        }
      }

      // ACCURACY
      if (accRes && Array.isArray(accRes.rounds)) {
        setAccuracyHistory(accRes);
      }

      // INSTITUTIONS
      if (instRes && typeof instRes === "object") {
        setInstitutions(instRes);
      }

      // HERO CLUSTER
      if (heroRes && typeof heroRes === "object") {
        setHeroCluster(heroRes);
      }

      // AUDIT LOG
      if (auditRes && Array.isArray(auditRes)) {
        setAuditLog(auditRes);
      }
    } catch (error) {
      console.warn("Dashboard polling warning:", error);
    }
  }, []);

  // ============================================================
  // POLLING
  // ============================================================

  useEffect(() => {
    isMountedRef.current = true;

    if (!hasRun) {
      return () => {
        isMountedRef.current = false;
      };
    }

    fetchDashboardData();

    const interval = setInterval(() => {
      fetchDashboardData();
    }, 800);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchDashboardData, hasRun]);

  // ============================================================
  // START SIMULATION
  // ============================================================

  const handleStartSimulation = async (e) => {
    if (e) e.preventDefault();

    try {
      setHasRun(true);
      setIsRunning(true);

      setHeroCluster(null);

      setAccuracyHistory({
        rounds: [],
        accuracy: [],
      });

      setAuditLog([]);
      setInstitutions({});
      setSelectedWallet(null);

      setStatus({
        round: 0,
        total_rounds: 20,
        global_accuracy: null,
        accuracy_delta: null,
        institutions_online: null,
        institutions_total: 4,
        clusters_flagged: null,
        chain_integrity: {
          verified_blocks: 0,
          total_blocks: 20,
        },
        live: true,
      });

      const response = await fetch(
        `${API_BASE}/demo/start?t=${Date.now()}`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: JSON.stringify({
            n_rounds: 20,
            round_delay_seconds: 2.0,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Simulation start failed: ${response.status}`
        );
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 300)
      );

      await fetchDashboardData();
    } catch (error) {
      console.error("Start error:", error);
      setIsRunning(false);
    }
  };

  // ============================================================
  // DERIVED VALUES
  // ============================================================

  const currentRound = Number(status?.round ?? 0);

  const totalRounds = Number(
    status?.total_rounds || 20
  );

  const progress =
    totalRounds > 0
      ? Math.min(
          (currentRound / totalRounds) * 100,
          100
        )
      : 0;

  const globalAccuracy =
    status?.global_accuracy != null
      ? Number(status.global_accuracy) * 100
      : null;

  const accuracyDelta =
    status?.accuracy_delta != null
      ? Number(status.accuracy_delta) * 100
      : null;

  const verifiedBlocks =
    status?.chain_integrity?.verified_blocks != null
      ? Number(
          status.chain_integrity.verified_blocks
        )
      : 0;

  const institutionsOnline =
    status?.institutions_online != null
      ? status.institutions_online
      : null;

  const clustersFlagged =
    status?.clusters_flagged != null
      ? status.clusters_flagged
      : null;

  const globalScore =
    heroCluster?.global_score != null
      ? Number(heroCluster.global_score)
      : 0;

  const isGlobalHighRisk =
    hasRun && globalScore >= 0.5;

  // ============================================================
  // CHART DATA
  // ============================================================

  const chartData = useMemo(() => {
    return (accuracyHistory?.rounds || []).map(
      (round, index) => ({
        round: `R${round}`,
        accuracy:
          accuracyHistory?.accuracy?.[index] != null
            ? Number(
                Number(
                  accuracyHistory.accuracy[index]
                ) * 100
              ).toFixed(1)
            : null,
      })
    );
  }, [accuracyHistory]);

  // ============================================================
  // NETWORK GRAPH NODES
  // ============================================================

  const clusterGraphNodes = useMemo(() => {
    if (!hasRun) return [];

    const count =
      heroCluster?.wallet_count != null
        ? Number(heroCluster.wallet_count)
        : 0;

    if (count <= 0) return [];

    const nodes = [];

    const centerX = 230;
    const centerY = 110;
    const radius = 78;

    for (let i = 0; i < count; i++) {
      const angle =
        (i / count) * 2 * Math.PI;

      const isFlagged =
        currentRound > 4 &&
        (i <
          Math.floor(
            (currentRound / totalRounds) *
              count
          ) ||
          isGlobalHighRisk);

      nodes.push({
        id: `0x7a2...f${(
          i + 1
        ).toString(16)}`,

        label: `W-${i + 1}`,

        x:
          centerX +
          radius * Math.cos(angle) +
          (i % 2 === 0 ? 8 : -8),

        y:
          centerY +
          radius * Math.sin(angle) +
          (i % 3 === 0 ? -6 : 6),

        amount:
          ((i + 1) * 3.42).toFixed(2) +
          " ETH",

        hops: 2 + (i % 4),

        isFlagged,
      });
    }

    return nodes;
  }, [
    hasRun,
    heroCluster?.wallet_count,
    currentRound,
    totalRounds,
    isGlobalHighRisk,
  ]);

  // ============================================================
  // NETWORK EDGES
  // ============================================================

  const clusterEdges = useMemo(() => {
    const edges = [];

    const count = clusterGraphNodes.length;

    if (count === 0) return [];

    for (let i = 0; i < count; i++) {
      edges.push({
        from: clusterGraphNodes[i],
        to: clusterGraphNodes[
          (i + 1) % count
        ],
      });

      if (i % 3 === 0 && currentRound >= 5) {
        edges.push({
          from: clusterGraphNodes[i],
          to: clusterGraphNodes[
            (i + 5) % count
          ],
        });
      }

      if (i % 4 === 0 && currentRound >= 12) {
        edges.push({
          from: clusterGraphNodes[i],
          to: clusterGraphNodes[
            (i + 7) % count
          ],
        });
      }
    }

    return edges;
  }, [clusterGraphNodes, currentRound]);

  // ============================================================
  // INSTITUTIONS
  // ============================================================

  const institutionEntries = Object.entries(
    institutions || {}
  );

  // ============================================================
  // SMALL COMPONENTS
  // ============================================================

  const PageHeader = ({
    title,
    subtitle,
    eyebrow,
  }) => (
    <div className="cw-page-header">
      <div>
        <div className="cw-breadcrumb">
          <span>Workspace</span>
          <span>›</span>
          <span>{activePage}</span>
        </div>

        <div className="cw-eyebrow">
          {eyebrow || "INTELLIGENCE CONSOLE"}
        </div>

        <h1 className="cw-title">
          {title}
        </h1>

        <p className="cw-subtitle">
          {subtitle}
        </p>
      </div>

      <div className="cw-system">
        <div className="cw-system-info">
          <div className="cw-system-status">
            <span className="cw-dot" />
            <span>System operational</span>
          </div>

          <div className="cw-updated">
            Updated just now
          </div>
        </div>

        <button
          className="cw-round-button"
          onClick={handleStartSimulation}
          disabled={isRunning}
        >
          <span>↻</span>

          {isRunning
            ? `Round ${currentRound} in progress`
            : hasRun &&
              currentRound >= totalRounds
            ? "Run completed"
            : "Start simulation"}
        </button>
      </div>
    </div>
  );

  // ============================================================
  // DASHBOARD PAGE
  // ============================================================

  const DashboardPage = () => (
    <>
      <PageHeader
        title="Federated threat intelligence"
        subtitle="Monitor collaborative fraud detection across participating institutions."
        eyebrow="INTELLIGENCE CONSOLE"
      />

      {/* PROGRESS */}

      <div className="cw-progress-card">
        <span className="cw-progress-label">
          FEDERATED LEARNING CYCLE
        </span>

        <span className="cw-progress-round">
          Round {currentRound} of {totalRounds}
        </span>

        <div className="cw-progress-track">
          <div
            className="cw-progress-fill"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="cw-progress-status">
          <span className="cw-blue-dot" />

          {isRunning
            ? "Processing secure updates"
            : hasRun &&
              currentRound >= totalRounds
            ? "Federated cycle complete"
            : "Ready to begin"}
        </div>
      </div>

      {/* METRICS */}

      <div className="cw-metrics">
        <div className="cw-metric">
          <div className="cw-metric-top">
            <div className="cw-metric-label">
              GLOBAL ACCURACY
            </div>

            <div className="cw-metric-icon">
              ▥
            </div>
          </div>

          <div className="cw-metric-value">
            {hasRun &&
            globalAccuracy != null
              ? `${globalAccuracy.toFixed(1)}%`
              : "—"}
          </div>

          <div className="cw-metric-desc">
            {hasRun &&
            accuracyDelta != null
              ? `${accuracyDelta >= 0 ? "+" : ""}${accuracyDelta.toFixed(
                  2
                )}% vs prior round`
              : "Awaiting simulation"}
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-top">
            <div className="cw-metric-label">
              ACTIVE NODES
            </div>

            <div className="cw-metric-icon green">
              ♧
            </div>
          </div>

          <div className="cw-metric-value">
            {hasRun &&
            institutionsOnline != null
              ? `${institutionsOnline} / ${
                  status?.institutions_total ??
                  4
                }`
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Secure participants
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-top">
            <div className="cw-metric-label">
              SCAM CLUSTERS
            </div>

            <div className="cw-metric-icon">
              ♧
            </div>
          </div>

          <div className="cw-metric-value">
            {hasRun &&
            clustersFlagged != null
              ? clustersFlagged
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Resolved entities
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-top">
            <div className="cw-metric-label">
              CHAIN INTEGRITY
            </div>

            <div className="cw-metric-icon green">
              ✓
            </div>
          </div>

          <div className="cw-metric-value">
            {hasRun
              ? `${verifiedBlocks} / ${totalRounds}`
              : "—"}
          </div>

          <div className="cw-metric-desc">
            SHA-256 blocks verified
          </div>
        </div>
      </div>

      {/* CHART + INSTITUTIONS */}

      <div className="cw-grid">
        <section className="cw-card">
          <div className="cw-card-header">
            <div>
              <div className="cw-eyebrow">
                HELD-OUT EVALUATION · 3,000
                SAMPLES
              </div>

              <div className="cw-card-title">
                Global model accuracy
              </div>
            </div>

            <div className="cw-live">
              • Live
            </div>
          </div>

          <div className="cw-chart">
            {chartData.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 12,
                    right: 15,
                    left: 5,
                    bottom: 5,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="accuracyFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#00C8FF"
                        stopOpacity={0.18}
                      />

                      <stop
                        offset="100%"
                        stopColor="#00C8FF"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="#E7ECF1"
                    strokeDasharray="2 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="round"
                    stroke="#8797AA"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    domain={[50, 100]}
                    stroke="#8797AA"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      `${value}%`
                    }
                  />

                  <Tooltip
                    contentStyle={{
                      background: "#000000",
                      border:
                        "1px solid #DFE5EC",
                      borderRadius: "8px",
                      boxShadow:
                        "0 5px 18px rgba(30,60,90,.1)",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [
                      `${value}%`,
                      "Accuracy",
                    ]}
                  />

                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke={BLUE}
                    fill="url(#accuracyFill)"
                    strokeWidth={2.5}
                    dot={{
                      fill: BLUE,
                      stroke: "#ffffff",
                      strokeWidth: 2,
                      r: 3,
                    }}
                    activeDot={{
                      r: 5,
                    }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="cw-empty-chart">
                {hasRun
                  ? "Waiting for simulation data..."
                  : "Start the simulation to view model accuracy"}
              </div>
            )}
          </div>
        </section>

        <section className="cw-card">
          <div className="cw-card-header">
            <div>
              <div className="cw-eyebrow">
                SECURE WEIGHT AGGREGATION
                PARTICIPANTS
              </div>

              <div className="cw-card-title">
                Institution federation status
              </div>
            </div>
          </div>

          <div className="cw-institutions">
            {!hasRun ? (
              <div className="cw-empty-message">
                Start the simulation to view
                participating institutions.
              </div>
            ) : institutionEntries.length ===
              0 ? (
              <div className="cw-empty-message">
                Waiting for institutions...
              </div>
            ) : (
              institutionEntries.map(
                ([key, data]) => (
                  <div
                    className="cw-institution"
                    key={key}
                  >
                    <div className="cw-inst-icon">
                      ▤
                    </div>

                    <div>
                      <div className="cw-inst-name">
                        {key
                          .replaceAll(
                            "_",
                            " "
                          )
                          .toUpperCase()}
                      </div>

                      <div className="cw-inst-sub">
                        {data?.label ||
                          "Federated participant"}
                      </div>
                    </div>

                    <div className="cw-sync">
                      <span className="cw-sync-dot" />

                      {data?.status ||
                        "SYNCED"}
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </section>
      </div>

      {/* RISK + NETWORK */}

      <div className="cw-lower-grid">
        <section className="cw-card">
          <div className="cw-eyebrow">
            THREAT INTELLIGENCE
          </div>

          <div className="cw-card-title">
            Cluster risk assessment
          </div>

          <div className="cw-card-description">
            Local node view vs unified global
            aggregation
          </div>

          <div className="cw-risk-box">
            <div className="cw-risk-row">
              <div>
                <div className="cw-risk-title">
                  Raw scam ring
                </div>

                <div className="cw-risk-sub">
                  {hasRun &&
                  heroCluster?.wallet_count !=
                    null
                    ? `${heroCluster.wallet_count} syndicate wallets`
                    : "Awaiting simulation"}
                </div>
              </div>

              <div className="cw-risk-score">
                →
              </div>
            </div>

            <div className="cw-risk-row">
              <div>
                <div className="cw-risk-title">
                  Node A local evaluation
                </div>

                <div className="cw-risk-sub">
                  Institution-local assessment
                </div>
              </div>

              <div className="cw-risk-score green">
                {!hasRun
                  ? "AWAITING"
                  : heroCluster?.local_score !=
                    null
                  ? Number(
                      heroCluster.local_score
                    ).toFixed(2)
                  : "CALCULATING"}
              </div>
            </div>

            <div className="cw-risk-row">
              <div>
                <div className="cw-risk-title">
                  Global federated assessment
                </div>

                <div className="cw-risk-sub">
                  Unified cross-institution signal
                </div>
              </div>

              <div
                className={`cw-risk-score ${
                  isGlobalHighRisk
                    ? "red"
                    : "yellow"
                }`}
              >
                {!hasRun
                  ? "AWAITING"
                  : heroCluster?.global_score !=
                    null
                  ? Number(
                      heroCluster.global_score
                    ).toFixed(2)
                  : "CALCULATING"}
              </div>
            </div>
          </div>
        </section>

        <NetworkCard />
      </div>

      {/* AUDIT */}

      <AuditCard />

      <div className="cw-footer">
        CipherWatch · Federated threat
        intelligence console · Secure
        collaborative fraud detection
      </div>
    </>
  );

  // ============================================================
  // NETWORK CARD
  // ============================================================

  const NetworkCard = ({
    large = false,
  }) => (
    <section className="cw-card">
      <div className="cw-card-header">
        <div>
          <div className="cw-eyebrow">
            NETWORK GRAPH
          </div>

          <div className="cw-card-title">
            Scam cluster topology
          </div>
        </div>

        <div className="cw-network-count">
          {hasRun
            ? `${clusterEdges.length} edges`
            : "No active cluster"}
        </div>
      </div>

      <div
        className="cw-network"
        style={
          large
            ? { height: "520px" }
            : undefined
        }
      >
        {!hasRun ||
        clusterGraphNodes.length === 0 ? (
          <div className="cw-network-empty">
            Network topology awaiting simulation
          </div>
        ) : (
          <svg
            viewBox="0 0 460 220"
            preserveAspectRatio="xMidYMid meet"
          >
            {clusterEdges.map(
              (edge, index) => {
                const active =
                  edge.from.isFlagged &&
                  edge.to.isFlagged;

                return (
                  <line
                    key={index}
                    x1={edge.from.x}
                    y1={edge.from.y}
                    x2={edge.to.x}
                    y2={edge.to.y}
                    stroke={
                      active
                        ? RED
                        : "#91A8BF"
                    }
                    strokeWidth={
                      active ? 2 : 1
                    }
                    opacity={
                      active ? 0.75 : 0.4
                    }
                  />
                );
              }
            )}

            {clusterGraphNodes.map(
              (node) => {
                const selected =
                  selectedWallet?.id ===
                  node.id;

                const nodeColor =
                  node.isFlagged
                    ? RED
                    : GREEN;

                return (
                  <g
                    key={node.id}
                    onClick={() =>
                      setSelectedWallet(
                        node
                      )
                    }
                    style={{
                      cursor: "pointer",
                    }}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={
                        selected ? 9 : 6
                      }
                      fill="#ffffff"
                      stroke={
                        selected
                          ? "#C59B20"
                          : nodeColor
                      }
                      strokeWidth={
                        selected ? 3 : 2
                      }
                    />

                    <text
                      x={node.x}
                      y={
                        node.y + 17
                      }
                      textAnchor="middle"
                      fill={
                        selected
                          ? "#A27D12"
                          : "#71839A"
                      }
                      fontSize="8"
                      fontFamily="Inter, sans-serif"
                    >
                      {node.label}
                    </text>
                  </g>
                );
              }
            )}
          </svg>
        )}

        {selectedWallet && hasRun && (
          <div className="cw-wallet-popup">
            <div className="cw-wallet-id">
              {selectedWallet.id}
            </div>

            <div>
              Volume:{" "}
              {selectedWallet.amount}
            </div>

            <div
              style={{
                color: MUTED,
                marginTop: 4,
              }}
            >
              Hops:{" "}
              {selectedWallet.hops}
            </div>

            <button
              className="cw-close-wallet"
              onClick={() =>
                setSelectedWallet(null)
              }
            >
              Close
            </button>
          </div>
        )}
      </div>
    </section>
  );

  // ============================================================
  // AUDIT CARD
  // ============================================================

  const AuditCard = () => (
    <section className="cw-card">
      <div className="cw-card-header">
        <div>
          <div className="cw-eyebrow">
            AUDIT LEDGER
          </div>

          <div className="cw-card-title">
            Hash-chain integrity
          </div>
        </div>

        <div className="cw-live">
          SHA-256 verified
        </div>
      </div>

      <table className="cw-audit-table">
        <thead>
          <tr>
            <th>BLOCK</th>
            <th>ROUND</th>
            <th>HASH</th>
            <th
              style={{
                textAlign: "right",
              }}
            >
              STATUS
            </th>
          </tr>
        </thead>

        <tbody>
          {auditLog.length > 0 ? (
            auditLog.map(
              (row, index) => (
                <tr key={index}>
                  <td>
                    {row.block}
                  </td>

                  <td>
                    Round {row.round}
                  </td>

                  <td className="cw-hash">
                    {row.hash}
                  </td>

                  <td className="cw-verified">
                    ✓ {row.status}
                  </td>
                </tr>
              )
            )
          ) : (
            <tr>
              <td
                colSpan={4}
                style={{
                  textAlign: "center",
                  color: MUTED,
                  padding: "25px",
                }}
              >
                {hasRun
                  ? "Waiting for audit blocks..."
                  : "No blocks committed yet — start the simulation."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  // ============================================================
  // THREAT INTELLIGENCE PAGE
  // ============================================================

  const ThreatIntelligencePage = () => (
    <>
      <PageHeader
        title="Threat intelligence"
        subtitle="Analyze suspicious clusters and unified fraud signals across the federation."
        eyebrow="THREAT INTELLIGENCE"
      />

      <div className="cw-metrics">
        <div className="cw-metric">
          <div className="cw-metric-label">
            SCAM CLUSTERS
          </div>

          <div className="cw-metric-value">
            {hasRun &&
            clustersFlagged != null
              ? clustersFlagged
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Flagged entities
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            GLOBAL RISK
          </div>

          <div
            className={`cw-metric-value ${
              isGlobalHighRisk
                ? "risk-red"
                : ""
            }`}
          >
            {hasRun &&
            heroCluster?.global_score !=
              null
              ? Number(
                  heroCluster.global_score
                ).toFixed(2)
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Federated assessment
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            LOCAL RISK
          </div>

          <div className="cw-metric-value">
            {hasRun &&
            heroCluster?.local_score !=
              null
              ? Number(
                  heroCluster.local_score
                ).toFixed(2)
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Node A assessment
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            WALLETS
          </div>

          <div className="cw-metric-value">
            {hasRun &&
            heroCluster?.wallet_count !=
              null
              ? heroCluster.wallet_count
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Syndicate wallets
          </div>
        </div>
      </div>

      <div className="cw-lower-grid">
        <section className="cw-card">
          <div className="cw-eyebrow">
            RISK ASSESSMENT
          </div>

          <div className="cw-card-title">
            Cluster risk assessment
          </div>

          <div className="cw-card-description">
            Compare institution-local signals
            with the global federated result.
          </div>

          <div className="cw-risk-box">
            <div className="cw-risk-row">
              <div>
                <div className="cw-risk-title">
                  Raw scam ring
                </div>

                <div className="cw-risk-sub">
                  Wallet cluster before
                  aggregation
                </div>
              </div>

              <div className="cw-risk-score">
                {hasRun &&
                heroCluster?.wallet_count !=
                  null
                  ? `${heroCluster.wallet_count}`
                  : "—"}
              </div>
            </div>

            <div className="cw-risk-row">
              <div>
                <div className="cw-risk-title">
                  Local evaluation
                </div>

                <div className="cw-risk-sub">
                  Institution-local signal
                </div>
              </div>

              <div className="cw-risk-score green">
                {hasRun &&
                heroCluster?.local_score !=
                  null
                  ? Number(
                      heroCluster.local_score
                    ).toFixed(2)
                  : "AWAITING"}
              </div>
            </div>

            <div className="cw-risk-row">
              <div>
                <div className="cw-risk-title">
                  Global evaluation
                </div>

                <div className="cw-risk-sub">
                  Unified federation signal
                </div>
              </div>

              <div
                className={`cw-risk-score ${
                  isGlobalHighRisk
                    ? "red"
                    : "yellow"
                }`}
              >
                {hasRun &&
                heroCluster?.global_score !=
                  null
                  ? Number(
                      heroCluster.global_score
                    ).toFixed(2)
                  : "AWAITING"}
              </div>
            </div>
          </div>
        </section>

        <section className="cw-card">
          <div className="cw-eyebrow">
            MODEL PERFORMANCE
          </div>

          <div className="cw-card-title">
            Global accuracy
          </div>

          <div className="cw-chart">
            {chartData.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={chartData}
                >
                  <CartesianGrid
                    stroke="#E7ECF1"
                    strokeDasharray="2 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="round"
                    stroke="#8797AA"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    domain={[50, 100]}
                    stroke="#8797AA"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      `${value}%`
                    }
                  />

                  <Tooltip />

                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke={BLUE}
                    fill="url(#accuracyFill)"
                    strokeWidth={2.5}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="cw-empty-chart">
                Start the simulation to view
                model performance.
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );

  // ============================================================
  // NETWORK PAGE
  // ============================================================

  const NetworkPage = () => (
    <>
      <PageHeader
        title="Network graph"
        subtitle="Explore relationships between wallets within the detected scam cluster."
        eyebrow="NETWORK ANALYSIS"
      />

      <NetworkCard large />

      {selectedWallet && (
        <section
          className="cw-card"
          style={{ marginTop: 20 }}
        >
          <div className="cw-eyebrow">
            SELECTED WALLET
          </div>

          <div className="cw-card-title">
            {selectedWallet.id}
          </div>

          <div className="cw-wallet-details">
            <div>
              <strong>Volume</strong>
              <span>
                {selectedWallet.amount}
              </span>
            </div>

            <div>
              <strong>Transaction hops</strong>
              <span>
                {selectedWallet.hops}
              </span>
            </div>

            <div>
              <strong>Risk status</strong>
              <span
                className={
                  selectedWallet.isFlagged
                    ? "risk-red"
                    : "risk-green"
                }
              >
                {selectedWallet.isFlagged
                  ? "FLAGGED"
                  : "NORMAL"}
              </span>
            </div>
          </div>
        </section>
      )}
    </>
  );

  // ============================================================
  // FEDERATED LEARNING PAGE
  // ============================================================

  const FederatedLearningPage = () => (
    <>
      <PageHeader
        title="Federated learning"
        subtitle="Monitor secure collaborative model training across participating institutions."
        eyebrow="FEDERATED LEARNING"
      />

      <div className="cw-progress-card">
        <span className="cw-progress-label">
          LEARNING CYCLE
        </span>

        <span className="cw-progress-round">
          Round {currentRound} of {totalRounds}
        </span>

        <div className="cw-progress-track">
          <div
            className="cw-progress-fill"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>

        <div className="cw-progress-status">
          <span className="cw-blue-dot" />

          {isRunning
            ? "Processing secure updates"
            : hasRun &&
              currentRound >= totalRounds
            ? "Federated cycle complete"
            : "Ready to begin"}
        </div>
      </div>

      <div className="cw-metrics">
        <div className="cw-metric">
          <div className="cw-metric-label">
            CURRENT ROUND
          </div>

          <div className="cw-metric-value">
            {currentRound}
          </div>

          <div className="cw-metric-desc">
            of {totalRounds} rounds
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            GLOBAL ACCURACY
          </div>

          <div className="cw-metric-value">
            {globalAccuracy != null
              ? `${globalAccuracy.toFixed(
                  1
                )}%`
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Current global model
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            ACTIVE NODES
          </div>

          <div className="cw-metric-value">
            {institutionsOnline != null
              ? `${institutionsOnline}/${status?.institutions_total ?? 4}`
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Secure participants
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            VERIFIED BLOCKS
          </div>

          <div className="cw-metric-value">
            {hasRun
              ? verifiedBlocks
              : "—"}
          </div>

          <div className="cw-metric-desc">
            Secure ledger blocks
          </div>
        </div>
      </div>

      <div className="cw-grid">
        <section className="cw-card">
          <div className="cw-card-header">
            <div>
              <div className="cw-eyebrow">
                HELD-OUT EVALUATION
              </div>

              <div className="cw-card-title">
                Global model accuracy
              </div>
            </div>

            <div className="cw-live">
              • Live
            </div>
          </div>

          <div className="cw-chart">
            {chartData.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <AreaChart
                  data={chartData}
                >
                  <defs>
                    <linearGradient
                      id="flAccuracyFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#00C8FF"
                        stopOpacity={0.18}
                      />

                      <stop
                        offset="100%"
                        stopColor="#00C8FF"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="#E7ECF1"
                    strokeDasharray="2 4"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="round"
                    stroke="#8797AA"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />

                  <YAxis
                    domain={[50, 100]}
                    stroke="#8797AA"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      `${value}%`
                    }
                  />

                  <Tooltip />

                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    stroke={BLUE}
                    fill="url(#flAccuracyFill)"
                    strokeWidth={2.5}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="cw-empty-chart">
                Start the simulation to view
                learning progress.
              </div>
            )}
          </div>
        </section>

        <section className="cw-card">
          <div className="cw-card-header">
            <div>
              <div className="cw-eyebrow">
                PARTICIPANTS
              </div>

              <div className="cw-card-title">
                Federation nodes
              </div>
            </div>
          </div>

          <div className="cw-institutions">
            {institutionEntries.length ===
            0 ? (
              <div className="cw-empty-message">
                Start the simulation to load
                participating nodes.
              </div>
            ) : (
              institutionEntries.map(
                ([key, data]) => (
                  <div
                    className="cw-institution"
                    key={key}
                  >
                    <div className="cw-inst-icon">
                      ▤
                    </div>

                    <div>
                      <div className="cw-inst-name">
                        {key
                          .replaceAll(
                            "_",
                            " "
                          )
                          .toUpperCase()}
                      </div>

                      <div className="cw-inst-sub">
                        {data?.label ||
                          "Federated participant"}
                      </div>
                    </div>

                    <div className="cw-sync">
                      <span className="cw-sync-dot" />
                      {data?.status ||
                        "SYNCED"}
                    </div>
                  </div>
                )
              )
            )}
          </div>
        </section>
      </div>
    </>
  );

  // ============================================================
  // AUDIT PAGE
  // ============================================================

  const AuditPage = () => (
    <>
      <PageHeader
        title="Audit ledger"
        subtitle="Verify the integrity of every federated learning round through the hash chain."
        eyebrow="AUDIT LEDGER"
      />

      <div className="cw-metrics">
        <div className="cw-metric">
          <div className="cw-metric-label">
            VERIFIED BLOCKS
          </div>

          <div className="cw-metric-value">
            {hasRun
              ? verifiedBlocks
              : "—"}
          </div>

          <div className="cw-metric-desc">
            SHA-256 verified
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            TOTAL ROUNDS
          </div>

          <div className="cw-metric-value">
            {totalRounds}
          </div>

          <div className="cw-metric-desc">
            Federated cycle
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            CURRENT ROUND
          </div>

          <div className="cw-metric-value">
            {currentRound}
          </div>

          <div className="cw-metric-desc">
            Current position
          </div>
        </div>

        <div className="cw-metric">
          <div className="cw-metric-label">
            INTEGRITY
          </div>

          <div className="cw-metric-value risk-green">
            ✓
          </div>

          <div className="cw-metric-desc">
            Chain operational
          </div>
        </div>
      </div>

      <AuditCard />
    </>
  );

  // ============================================================
  // PAGE SWITCHER
  // ============================================================

  const renderActivePage = () => {
    switch (activePage) {
      case "Dashboard":
        return <DashboardPage />;

      case "Threat intelligence":
        return <ThreatIntelligencePage />;

      case "Network graph":
        return <NetworkPage />;

      case "Federated learning":
        return <FederatedLearningPage />;

      case "Audit ledger":
        return <AuditPage />;

      default:
        return <DashboardPage />;
    }
  };

  // ============================================================
  // MAIN UI
  // ============================================================

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          min-height: 100%;
          width: 100%;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          background: #000000;
          color: ${TEXT};
        }

        body {
          overflow-x: hidden;
        }

        button {
          font-family: inherit;
        }

        .cw-app {
          min-height: 100vh;
          display: flex;
          background: #000000;
        }

        /* SIDEBAR */

        .cw-sidebar {
          width: 250px;
          min-width: 250px;
          background: #050505;
          border-right: 1px solid ${BORDER};
          min-height: 100vh;
          padding: 28px 16px;
          position: sticky;
          top: 0;
          height: 100vh;
        }

        .cw-brand {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 0 2px 38px 2px;
        }

        .cw-brand-icon {
          width: 42px;
          height: 42px;
          border-radius: 0px;
          background: ${BLUE};
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 21px;
          font-weight: 700;
        }

        .cw-brand-name {
          font-size: 17px;
          font-weight: 700;
          color: ${DARK};
          letter-spacing: -0.3px;
        }

        .cw-brand-sub {
          font-size: 12px;
          color: ${MUTED};
          margin-top: 3px;
        }

        .cw-section-label {
          font-size: 11px;
          font-weight: 700;
          color: #72839a;
          letter-spacing: 0.5px;
          margin: 0 4px 10px;
        }

        .cw-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .cw-nav-button {
          border: 0;
          background: transparent;
          color: #64758c;
          width: 100%;
          padding: 12px;
          border-radius: 0px;
          display: flex;
          align-items: center;
          gap: 13px;
          font-size: 14px;
          cursor: pointer;
          text-align: left;
          transition: 0.15s ease;
        }

        .cw-nav-button:hover {
          background: #111111;
          color: ${BLUE};
        }

        .cw-nav-button.active {
          background: #101820;
          color: #315f8c;
          font-weight: 600;
        }

        .cw-nav-icon {
          width: 22px;
          text-align: center;
          font-size: 18px;
          opacity: 0.9;
        }

        /* MAIN */

        .cw-main {
          flex: 1;
          min-width: 0;
          padding: 38px 44px 50px;
          overflow: hidden;
        }

        .cw-page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 34px;
          gap: 30px;
        }

        .cw-breadcrumb {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #8191a6;
          font-size: 12px;
          margin-bottom: 18px;
        }

        .cw-title {
          margin: 0;
          font-size: 34px;
          line-height: 1.15;
          letter-spacing: -1px;
          color: ${DARK};
          font-weight: 700;
        }

        .cw-subtitle {
          margin: 12px 0 0;
          color: #71839a;
          font-size: 15px;
          max-width: 700px;
        }

        .cw-system {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          flex-shrink: 0;
        }

        .cw-system-info {
          text-align: right;
          padding-top: 5px;
        }

        .cw-system-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          color: ${TEXT};
          white-space: nowrap;
        }

        .cw-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #4ba47f;
        }

        .cw-updated {
          color: #8291a4;
          font-size: 11px;
          margin-top: 4px;
        }

        .cw-round-button {
          border: 0;
          background: ${BLUE};
          color: white;
          border-radius: 0px;
          padding: 13px 19px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          gap: 9px;
          align-items: center;
          min-width: 185px;
          justify-content: center;
        }

        .cw-round-button:hover {
          filter: brightness(0.96);
        }

        .cw-round-button:disabled {
          opacity: 0.85;
          cursor: not-allowed;
        }

        /* PROGRESS */

        .cw-progress-card {
          background: #050505;
          border: 1px solid ${BORDER};
          border-radius: 0px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 18px;
          margin-bottom: 24px;
        }

        .cw-progress-label {
          font-size: 12px;
          font-weight: 700;
          color: #6e8197;
          letter-spacing: 0.3px;
          white-space: nowrap;
        }

        .cw-progress-round {
          font-size: 13px;
          color: #8c9aab;
          white-space: nowrap;
        }

        .cw-progress-track {
          flex: 1;
          height: 7px;
          border-radius: 99px;
          background: #222222;
          overflow: hidden;
        }

        .cw-progress-fill {
          height: 100%;
          background: ${BLUE};
          border-radius: 99px;
          transition: width 0.4s ease;
        }

        .cw-progress-status {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #70839a;
          font-size: 12px;
          white-space: nowrap;
        }

        .cw-blue-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${BLUE};
        }

        /* METRICS */

        .cw-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }

        .cw-metric {
          background: #050505;
          border: 1px solid ${BORDER};
          border-radius: 0px;
          padding: 19px;
          min-height: 157px;
        }

        .cw-metric-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .cw-metric-label {
          font-size: 11px;
          font-weight: 600;
          color: #5d7189;
          letter-spacing: 0.3px;
        }

        .cw-metric-icon {
          width: 32px;
          height: 32px;
          border-radius: 0px;
          background: ${LIGHT_BLUE};
          color: ${BLUE};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
        }

        .cw-metric-icon.green {
          background: ${LIGHT_GREEN};
          color: ${GREEN};
        }

        .cw-metric-value {
          font-size: 28px;
          line-height: 1;
          color: ${DARK};
          font-weight: 700;
          margin-top: 24px;
          letter-spacing: -0.7px;
        }

        .cw-metric-desc {
          margin-top: 17px;
          font-size: 11px;
          color: #8191a6;
        }

        /* CONTENT */

        .cw-grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.55fr)
            minmax(350px, 1fr);
          gap: 20px;
          margin-bottom: 20px;
        }

        .cw-card {
          background: #050505;
          border: 1px solid ${BORDER};
          border-radius: 0px;
          padding: 20px;
        }

        .cw-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 18px;
          gap: 15px;
        }

        .cw-eyebrow {
          color: #8091a6;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
          margin-bottom: 8px;
        }

        .cw-card-title {
          color: ${DARK};
          font-size: 16px;
          font-weight: 700;
        }

        .cw-card-description {
          color: ${MUTED};
          font-size: 11px;
          margin-top: 7px;
        }

        .cw-live {
          background: ${LIGHT_BLUE};
          color: ${BLUE};
          padding: 7px 10px;
          border-radius: 0px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }

        .cw-chart {
          height: 305px;
          width: 100%;
        }

        .cw-empty-chart,
        .cw-empty-message {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9aa7b6;
          font-size: 13px;
          text-align: center;
        }

        .cw-empty-message {
          min-height: 180px;
        }

        /* INSTITUTIONS */

        .cw-institutions {
          display: flex;
          flex-direction: column;
        }

        .cw-institution {
          display: grid;
          grid-template-columns: 34px 1fr auto;
          gap: 11px;
          align-items: center;
          padding: 13px 0;
          border-bottom: 1px solid #edf0f3;
        }

        .cw-institution:last-child {
          border-bottom: 0;
        }

        .cw-inst-icon {
          width: 34px;
          height: 34px;
          border-radius: 0px;
          background: ${LIGHT_BLUE};
          color: ${BLUE};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
        }

        .cw-inst-name {
          color: ${TEXT};
          font-size: 13px;
          font-weight: 600;
        }

        .cw-inst-sub {
          color: #8b9aac;
          font-size: 10px;
          margin-top: 4px;
        }

        .cw-sync {
          background: ${LIGHT_GREEN};
          color: ${GREEN};
          padding: 7px 10px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
        }

        .cw-sync-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: ${GREEN};
          border-radius: 50%;
          margin-right: 5px;
        }

        /* LOWER GRID */

        .cw-lower-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }

        .cw-risk-box {
          border: 1px solid ${BORDER};
          border-radius: 0px;
          padding: 14px;
          margin-top: 18px;
        }

        .cw-risk-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 0;
          border-bottom: 1px solid #edf0f3;
          gap: 15px;
        }

        .cw-risk-row:last-child {
          border-bottom: 0;
        }

        .cw-risk-title {
          font-size: 12px;
          font-weight: 600;
          color: ${TEXT};
        }

        .cw-risk-sub {
          color: #8b99a9;
          font-size: 10px;
          margin-top: 5px;
        }

        .cw-risk-score {
          font-size: 13px;
          font-weight: 700;
          color: ${TEXT};
          white-space: nowrap;
        }

        .cw-risk-score.green,
        .risk-green {
          color: ${GREEN};
        }

        .cw-risk-score.yellow {
          color: #B28A16;
        }

        .cw-risk-score.red,
        .risk-red {
          color: ${RED};
        }

        /* NETWORK */

        .cw-network {
          height: 290px;
          border: 1px solid #edf0f3;
          border-radius: 0px;
          margin-top: 8px;
          background: #000000;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .cw-network svg {
          width: 100%;
          height: 100%;
        }

        .cw-network-empty {
          height: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9aa7b6;
          font-size: 12px;
          text-align: center;
        }

        .cw-network-count {
          color: ${MUTED};
          font-size: 11px;
        }

        .cw-wallet-popup {
          position: absolute;
          right: 12px;
          top: 12px;
          background: #050505;
          border: 1px solid ${BLUE};
          border-radius: 8px;
          padding: 12px;
          box-shadow:
            0 5px 20px rgba(30, 60, 90, 0.12);
          font-size: 11px;
          z-index: 5;
        }

        .cw-wallet-id {
          color: ${BLUE};
          font-weight: 700;
          margin-bottom: 6px;
        }

        .cw-close-wallet {
          margin-top: 9px;
          border: 0;
          background: ${LIGHT_BLUE};
          color: ${BLUE};
          padding: 5px 9px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 10px;
        }

        .cw-wallet-details {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 15px;
          margin-top: 25px;
        }

        .cw-wallet-details > div {
          background: #050505;
          border: 1px solid #edf0f3;
          border-radius: 0px;
          padding: 15px;
        }

        .cw-wallet-details strong {
          display: block;
          font-size: 10px;
          color: ${MUTED};
          margin-bottom: 7px;
        }

        .cw-wallet-details span {
          font-size: 14px;
          font-weight: 700;
          color: ${DARK};
        }

        /* AUDIT */

        .cw-audit-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .cw-audit-table th {
          color: #71839A;
          font-size: 10px;
          font-weight: 600;
          text-align: left;
          padding: 11px 8px;
          border-bottom: 1px solid ${BORDER};
        }

        .cw-audit-table td {
          padding: 12px 8px;
          border-bottom: 1px solid #edf0f3;
          color: ${TEXT};
        }

        .cw-audit-table tr:last-child td {
          border-bottom: 0;
        }

        .cw-hash {
          color: #8291a4 !important;
          font-family: monospace;
          max-width: 350px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .cw-verified {
          color: ${GREEN} !important;
          font-weight: 700;
          text-align: right;
        }

        /* FOOTER */

        .cw-footer {
          color: #8b99a9;
          font-size: 11px;
          text-align: center;
          padding: 20px 0 5px;
        }

        /* RESPONSIVE */

        @media (max-width: 1200px) {
          .cw-sidebar {
            width: 220px;
            min-width: 220px;
          }

          .cw-main {
            padding: 30px 25px;
          }

          .cw-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 900px) {
          .cw-sidebar {
            display: none;
          }

          .cw-main {
            padding: 24px 16px;
          }

          .cw-grid,
          .cw-lower-grid {
            grid-template-columns: 1fr;
          }

          .cw-page-header {
            flex-direction: column;
            gap: 20px;
          }

          .cw-system {
            width: 100%;
            justify-content: space-between;
          }

          .cw-progress-card {
            flex-wrap: wrap;
          }

          .cw-progress-track {
            min-width: 200px;
          }

          .cw-wallet-details {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 600px) {
          .cw-metrics {
            grid-template-columns: 1fr;
          }

          .cw-title {
            font-size: 27px;
          }

          .cw-system {
            flex-direction: column;
          }

          .cw-system-info {
            text-align: left;
          }

          .cw-round-button {
            width: 100%;
          }

          .cw-audit-table {
            font-size: 10px;
          }

          .cw-audit-table th,
          .cw-audit-table td {
            padding: 8px 4px;
          }
        }
      `}</style>

      <div className="cw-app">
        {/* =====================================================
            SIDEBAR
        ====================================================== */}

        <aside className="cw-sidebar">
          <div className="cw-brand">
            <div className="cw-brand-icon">
              ♢
            </div>

            <div>
              <div className="cw-brand-name">
                CipherWatch
              </div>

              <div className="cw-brand-sub">
                Federated intelligence
              </div>
            </div>
          </div>

          <div className="cw-section-label">
            WORKSPACE
          </div>

          <nav className="cw-nav">
            <button
              className={`cw-nav-button ${
                activePage === "Dashboard"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage("Dashboard")
              }
            >
              <span className="cw-nav-icon">
                ▦
              </span>

              Dashboard
            </button>

            <button
              className={`cw-nav-button ${
                activePage ===
                "Threat intelligence"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage(
                  "Threat intelligence"
                )
              }
            >
              <span className="cw-nav-icon">
                ♢
              </span>

              Threat intelligence
            </button>

            <button
              className={`cw-nav-button ${
                activePage === "Network graph"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage(
                  "Network graph"
                )
              }
            >
              <span className="cw-nav-icon">
                ♧
              </span>

              Network graph
            </button>

            <button
              className={`cw-nav-button ${
                activePage ===
                "Federated learning"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage(
                  "Federated learning"
                )
              }
            >
              <span className="cw-nav-icon">
                ⑂
              </span>

              Federated learning
            </button>

            <button
              className={`cw-nav-button ${
                activePage === "Audit ledger"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage(
                  "Audit ledger"
                )
              }
            >
              <span className="cw-nav-icon">
                ▱
              </span>

              Audit ledger
            </button>
          </nav>
        </aside>

        {/* =====================================================
            MAIN CONTENT
        ====================================================== */}

        <main className="cw-main">
          {renderActivePage()}
        </main>
      </div>
    </>
  );
}