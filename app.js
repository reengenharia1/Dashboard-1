(() => {
  "use strict";

  const COLORS = {
    green: "#4CAF50",
    blue: "#2196F3",
    orange: "#FF9800",
    teal: "#00BCD4",
    red: "#E53935",
    indigo: "#7E57C2",
    gold: "#F0B429",
    muted: "#6B7A8F",
    track: "rgba(255,255,255,0.08)",
  };

  const STATUS_COLORS = {
    "Em Andamento": COLORS.blue,
    Concluído: COLORS.green,
    "Não Iniciado": COLORS.orange,
    Arquivado: COLORS.red,
  };

  const STATUS_ORDER = ["Em Andamento", "Concluído", "Não Iniciado", "Arquivado"];

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animDuration = reduceMotion ? 0 : 900;

  /** @type {Array<Record<string, string>>} */
  let allData = [];
  /** @type {Record<string, Chart>} */
  const charts = {};
  /** @type {Record<string, number>} */
  const kpiTargets = {};
  /** @type {Record<string, number>} */
  const kpiCurrent = {};
  let countUpRaf = 0;

  const els = {
    loading: document.getElementById("loading"),
    dashboard: document.getElementById("dashboard"),
    empty: document.getElementById("empty-state"),
    filterStatus: document.getElementById("filter-status"),
    filterConc: document.getElementById("filter-concessionaria"),
    filterModo: document.getElementById("filter-modo"),
    filterEtapa: document.getElementById("filter-etapa"),
    filterStatusEtapa: document.getElementById("filter-status-etapa"),
    filterPrioridade: document.getElementById("filter-prioridade"),
    btnClear: document.getElementById("btn-clear"),
    btnClearEmpty: document.getElementById("btn-clear-empty"),
    footer: document.getElementById("footer-info"),
    extraSlot: document.getElementById("extra-slot"),
    extraSlotBody: document.getElementById("extra-slot-body"),
    extraSlotMeta: document.getElementById("extra-slot-meta"),
  };

  /* ---------- CSV ---------- */

  /** Parse one CSV line with ; delimiter and RFC4180-style quotes. */
  function splitCsvLine(line, delimiter = ";") {
    const fields = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }

      if (ch === delimiter) {
        fields.push(current);
        current = "";
        continue;
      }

      current += ch;
    }

    fields.push(current);
    return fields;
  }

  /** Split CSV text into records, keeping quoted newlines inside a field. */
  function splitCsvRecords(text) {
    const records = [];
    let current = "";
    let inQuotes = false;
    const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"') {
        current += ch;
        if (inQuotes && src[i + 1] === '"') {
          current += src[++i];
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "\n" && !inQuotes) {
        if (current.trim().length) records.push(current);
        current = "";
        continue;
      }

      current += ch;
    }

    if (current.trim().length) records.push(current);
    return records;
  }

  function parseCsv(text) {
    const lines = splitCsvRecords(text);
    if (lines.length < 2) return [];

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = splitCsvLine(lines[i], ";");
      if (parts.length < 9) continue;

      const last = parts.length;
      const prioridadeRaw = (parts[last - 3] || "").trim();
      const statusEtapaRaw = (parts[last - 4] || "").trim();

      rows.push({
        sei: (parts[0] || "").trim(),
        concessionaria: (parts[1] || "").trim() || "Sem concessionária",
        processo: (parts[2] || "").trim(),
        descricao: parts.slice(3, last - 5).join(";").trim(),
        etapaAtual: (parts[last - 5] || "").trim() || "Sem etapa",
        statusEtapa: normalizeStatusEtapa(statusEtapaRaw),
        prioridade: prioridadeRaw || "Sem prioridade",
        modo: (parts[last - 2] || "").trim() || "Não informado",
        status: (parts[last - 1] || "").trim(),
      });
    }

    return rows.filter((r) => STATUS_ORDER.includes(r.status));
  }

  function normalizeStatusEtapa(value) {
    if (!value) return "Sem status";
    return value
      .replace(/\s+/g, " ")
      .trim()
      .replace(/n[aã]o recebido/gi, "NÃO recebido")
      .replace(/n[aã]o consultado/gi, "NÃO consultado");
  }

  /* ---------- Aggregations ---------- */

  function getFilters() {
    return {
      status: els.filterStatus.value,
      concessionaria: els.filterConc.value,
      modo: els.filterModo.value,
      etapaAtual: els.filterEtapa.value,
      statusEtapa: els.filterStatusEtapa.value,
      prioridade: els.filterPrioridade.value,
    };
  }

  function filterData(data) {
    const f = getFilters();
    return data.filter((r) => {
      if (f.status && r.status !== f.status) return false;
      if (f.concessionaria && r.concessionaria !== f.concessionaria) return false;
      if (f.modo && r.modo !== f.modo) return false;
      if (f.etapaAtual && r.etapaAtual !== f.etapaAtual) return false;
      if (f.statusEtapa && r.statusEtapa !== f.statusEtapa) return false;
      if (f.prioridade && r.prioridade !== f.prioridade) return false;
      return true;
    });
  }

  function countBy(data, key) {
    const map = new Map();
    for (const row of data) {
      const k = row[key];
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  function topEntries(map, n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).slice(0, n);
  }

  function computeKpis(data) {
    const total = data.length;
    const byStatus = countBy(data, "status");
    const concluido = byStatus.get("Concluído") || 0;
    const concessionarias = new Set(data.map((r) => r.concessionaria)).size;
    const pct = total ? (concluido / total) * 100 : 0;

    return {
      total,
      andamento: byStatus.get("Em Andamento") || 0,
      concluido,
      naoIniciado: byStatus.get("Não Iniciado") || 0,
      arquivado: byStatus.get("Arquivado") || 0,
      concessionarias,
      pctConcluidos: pct,
    };
  }

  function truncateLabel(name, max = 22) {
    if (!name) return "";
    return name.length <= max ? name : name.slice(0, max - 1) + "…";
  }

  function priorityBand(p) {
    if (p === "Sem prioridade") return "sem";
    const n = Number(p);
    if (!Number.isFinite(n)) return "sem";
    if (n <= 3) return "alta";
    if (n <= 6) return "media";
    return "baixa";
  }

  function priorityColor(p) {
    const band = priorityBand(p);
    if (band === "alta") return COLORS.red;
    if (band === "media") return COLORS.orange;
    if (band === "baixa") return COLORS.teal;
    return COLORS.muted;
  }

  function sortPriorities(entries) {
    return entries.sort((a, b) => {
      if (a[0] === "Sem prioridade") return 1;
      if (b[0] === "Sem prioridade") return -1;
      const na = Number(a[0]);
      const nb = Number(b[0]);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a[0].localeCompare(b[0], "pt-BR");
    });
  }

  /* ---------- Count-up ---------- */

  function animateKpis(kpis) {
    Object.assign(kpiTargets, {
      total: kpis.total,
      andamento: kpis.andamento,
      concluido: kpis.concluido,
      naoIniciado: kpis.naoIniciado,
      arquivado: kpis.arquivado,
      concessionarias: kpis.concessionarias,
      pctConcluidos: kpis.pctConcluidos,
    });

    document.querySelectorAll(".kpi").forEach((card) => {
      const key = card.dataset.kpi;
      if (!(key in kpiCurrent)) kpiCurrent[key] = 0;
    });

    if (reduceMotion) {
      applyKpiValues(kpiTargets);
      return;
    }

    cancelAnimationFrame(countUpRaf);
    const start = performance.now();
    const from = { ...kpiCurrent };
    const duration = 650;

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = {};
      for (const key of Object.keys(kpiTargets)) {
        next[key] = from[key] + (kpiTargets[key] - from[key]) * eased;
      }
      applyKpiValues(next);
      if (t < 1) countUpRaf = requestAnimationFrame(tick);
      else Object.assign(kpiCurrent, kpiTargets);
    };

    countUpRaf = requestAnimationFrame(tick);
  }

  function applyKpiValues(values) {
    document.querySelectorAll(".kpi").forEach((card) => {
      const key = card.dataset.kpi;
      const el = card.querySelector(".kpi__value");
      if (!el) return;
      const raw = values[key] ?? 0;
      kpiCurrent[key] = raw;
      if (key === "pctConcluidos") {
        el.textContent = `${raw.toFixed(1)}%`;
      } else {
        el.textContent = String(Math.round(raw));
      }
    });
  }

  /* ---------- Charts ---------- */

  function chartDefaults() {
    Chart.defaults.color = "#9aa7b8";
    Chart.defaults.borderColor = "rgba(255,255,255,0.08)";
    Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, sans-serif";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = "rgba(22, 30, 42, 0.95)";
    Chart.defaults.plugins.tooltip.titleColor = "#fff";
    Chart.defaults.plugins.tooltip.bodyColor = "#d5dde8";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(255,255,255,0.12)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }

  function ensureChart(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    if (charts[id]) {
      charts[id].data.labels = config.data.labels;
      charts[id].data.datasets = config.data.datasets;
      if (config.options) {
        charts[id].options = config.options;
      }
      charts[id].update();
      return charts[id];
    }
    charts[id] = new Chart(canvas, config);
    return charts[id];
  }

  function updateCharts(data) {
    const total = data.length;
    const byStatus = countBy(data, "status");
    const byConc = countBy(data, "concessionaria");
    const byPrioridade = countBy(data, "prioridade");
    const byEtapa = countBy(data, "etapaAtual");
    const byStatusEtapa = countBy(data, "statusEtapa");

    const statusLabels = STATUS_ORDER;
    const statusValues = statusLabels.map((s) => byStatus.get(s) || 0);
    const statusColors = statusLabels.map((s) => STATUS_COLORS[s]);

    ensureChart("chart-status", {
      type: "doughnut",
      data: {
        labels: statusLabels,
        datasets: [
          {
            data: statusValues,
            backgroundColor: statusColors,
            borderColor: "#263041",
            borderWidth: 3,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        animation: { duration: animDuration },
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 14, font: { size: 11, weight: "600" } },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.parsed || 0;
                const pct = total ? ((v / total) * 100).toFixed(1) : "0.0";
                return ` ${ctx.label}: ${v} (${pct}%)`;
              },
            },
          },
        },
        onClick(_evt, elements) {
          if (!elements.length) return;
          const label = statusLabels[elements[0].index];
          els.filterStatus.value = label;
          refresh();
        },
      },
    });

    const top8 = topEntries(byConc, 8).reverse();
    const top8Labels = top8.map(([n]) => n);
    const top8Values = top8.map(([, v]) => v);

    ensureChart("chart-top-conc", {
      type: "bar",
      data: {
        labels: top8Labels,
        datasets: [
          {
            data: top8Values,
            backgroundColor: COLORS.teal,
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 16,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: animDuration },
        layout: {
          padding: { left: 4 },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            ticks: {
              font: { size: 11, weight: "600" },
              autoSkip: false,
              crossAlign: "far",
            },
            grid: { display: false },
            afterFit(scale) {
              scale.width = Math.min(220, Math.max(scale.width, 160));
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                return top8Labels[items[0].dataIndex] || "";
              },
            },
          },
        },
        onClick(_evt, elements) {
          if (!elements.length) return;
          els.filterConc.value = top8Labels[elements[0].index];
          refresh();
        },
      },
    });

    const prioEntries = sortPriorities([...byPrioridade.entries()]);
    const prioLabels = prioEntries.map(([k]) => (k === "Sem prioridade" ? "Sem prioridade" : `P${k}`));
    const prioFull = prioEntries.map(([k]) => k);
    const prioValues = prioEntries.map(([, v]) => v);
    const prioColors = prioEntries.map(([k]) => priorityColor(k));

    ensureChart("chart-prioridade", {
      type: "bar",
      data: {
        labels: prioLabels,
        datasets: [
          {
            data: prioValues,
            backgroundColor: prioColors,
            borderRadius: 6,
            borderSkipped: false,
            barThickness: Math.max(10, Math.min(18, 220 / Math.max(prioLabels.length, 1))),
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: animDuration },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            ticks: { font: { size: 10 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                const raw = prioFull[items[0].dataIndex];
                return raw === "Sem prioridade" ? raw : `Prioridade ${raw}`;
              },
              afterBody(items) {
                const raw = prioFull[items[0].dataIndex];
                const band = priorityBand(raw);
                const label =
                  band === "alta" ? "Faixa: Alta" : band === "media" ? "Faixa: Média" : band === "baixa" ? "Faixa: Baixa" : "";
                return label ? [label] : [];
              },
            },
          },
        },
        onClick(_evt, elements) {
          if (!elements.length) return;
          els.filterPrioridade.value = prioFull[elements[0].index];
          refresh();
        },
      },
    });

    const etapaTop = topEntries(byEtapa, 8);
    const etapaFull = etapaTop.map(([n]) => n);
    const etapaLabels = etapaTop.map(([n]) => truncateLabel(n, 18));
    const etapaValues = etapaTop.map(([, v]) => v);
    const etapaPalette = [COLORS.blue, COLORS.teal, COLORS.orange, COLORS.indigo, COLORS.green, COLORS.gold, COLORS.red, "#5C6BC0"];

    ensureChart("chart-etapas", {
      type: "bar",
      data: {
        labels: etapaLabels,
        datasets: [
          {
            data: etapaValues,
            backgroundColor: etapaPalette.slice(0, etapaValues.length),
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 36,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: animDuration },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 30,
              font: { size: 9 },
              callback(_val, i) {
                return etapaLabels[i];
              },
            },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                return etapaFull[items[0].dataIndex] || "";
              },
            },
          },
        },
        onClick(_evt, elements) {
          if (!elements.length) return;
          els.filterEtapa.value = etapaFull[elements[0].index];
          refresh();
        },
      },
    });

    const statusEtapaTop = topEntries(byStatusEtapa, 10).reverse();
    const seFull = statusEtapaTop.map(([n]) => n);
    const seLabels = statusEtapaTop.map(([n]) => truncateLabel(n, 24));
    const seValues = statusEtapaTop.map(([, v]) => v);
    const sePct = seValues.map((v) => (total ? (v / total) * 100 : 0));

    ensureChart("chart-status-etapa", {
      type: "bar",
      data: {
        labels: seLabels,
        datasets: [
          {
            data: sePct,
            counts: seValues,
            backgroundColor: sePct.map((_, i) => {
              const palette = [COLORS.blue, COLORS.teal, COLORS.orange, COLORS.indigo, COLORS.green, COLORS.gold, COLORS.red, "#26A69A", "#5C6BC0", COLORS.muted];
              return palette[i % palette.length];
            }),
            borderRadius: 6,
            borderSkipped: false,
            barThickness: 14,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: animDuration },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback(v) {
                return `${v}%`;
              },
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            ticks: { font: { size: 10 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title(items) {
                return seFull[items[0].dataIndex] || "";
              },
              label(ctx) {
                const i = ctx.dataIndex;
                const chart = ctx.chart;
                const counts = chart.data.datasets[0].counts || [];
                const pctVal = Number(ctx.parsed.x) || 0;
                return ` ${counts[i] ?? "—"} processos (${pctVal.toFixed(1)}%)`;
              },
            },
          },
        },
        onClick(_evt, elements) {
          if (!elements.length) return;
          els.filterStatusEtapa.value = seFull[elements[0].index];
          refresh();
        },
      },
      plugins: [
        {
          id: "pctLabels",
          afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            const values = chart.data.datasets[0].data;
            ctx.save();
            ctx.fillStyle = "#d5dde8";
            ctx.font = "600 10px 'Plus Jakarta Sans', system-ui, sans-serif";
            meta.data.forEach((bar, i) => {
              const pctVal = Number(values[i]) || 0;
              if (pctVal < 0.5) return;
              ctx.textBaseline = "middle";
              ctx.fillText(`${pctVal.toFixed(1)}%`, bar.x + 6, bar.y);
            });
            ctx.restore();
          },
        },
      ],
    });
  }

  /* ---------- UI ---------- */

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = allLabel;
    select.appendChild(optAll);

    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });

    if ([...select.options].some((o) => o.value === current)) {
      select.value = current;
    }
  }

  function populateFilters(data) {
    const statuses = STATUS_ORDER.filter((s) => data.some((r) => r.status === s));
    const concs = [...new Set(data.map((r) => r.concessionaria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const modos = [...new Set(data.map((r) => r.modo))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const etapas = [...new Set(data.map((r) => r.etapaAtual))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const statusEtapas = [...new Set(data.map((r) => r.statusEtapa))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const prioridades = sortPriorities([...new Set(data.map((r) => r.prioridade))].map((p) => [p, 0])).map(([p]) => p);

    fillSelect(els.filterStatus, statuses, "Todos");
    fillSelect(els.filterConc, concs, "Todas");
    fillSelect(els.filterModo, modos, "Todos");
    fillSelect(els.filterEtapa, etapas, "Todas");
    fillSelect(els.filterStatusEtapa, statusEtapas, "Todos");
    fillSelect(els.filterPrioridade, prioridades, "Todas");
  }

  function clearFilters() {
    els.filterStatus.value = "";
    els.filterConc.value = "";
    els.filterModo.value = "";
    els.filterEtapa.value = "";
    els.filterStatusEtapa.value = "";
    els.filterPrioridade.value = "";
    refresh();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function prioritySortValue(p) {
    if (!p || p === "Sem prioridade") return Number.POSITIVE_INFINITY;
    const n = Number(p);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }

  /** Agrupa SEI Regulatório → descrições distintas; ordena por Prioridade ascendente. */
  function buildRegulatorioRelacao(data) {
    const map = new Map();

    for (const row of data) {
      const sei = (row.sei || "").trim() || "Sem SEI Regulatório";
      const desc = (row.descricao || "").trim() || "Sem descrição";
      const prio = row.prioridade || "Sem prioridade";

      if (!map.has(sei)) {
        map.set(sei, { descs: new Set(), prioridade: prio, prioValue: prioritySortValue(prio) });
      }

      const entry = map.get(sei);
      entry.descs.add(desc);

      // Keep the best (lowest) priority number for the group
      const nextValue = prioritySortValue(prio);
      if (nextValue < entry.prioValue) {
        entry.prioridade = prio;
        entry.prioValue = nextValue;
      }
    }

    return [...map.entries()]
      .map(([sei, entry]) => ({
        sei,
        prioridade: entry.prioridade,
        prioValue: entry.prioValue,
        descs: [...entry.descs].sort((a, b) => a.localeCompare(b, "pt-BR")),
      }))
      .sort((a, b) => {
        if (a.prioValue !== b.prioValue) return a.prioValue - b.prioValue;
        return a.sei.localeCompare(b.sei, "pt-BR");
      });
  }

  function updateRegulatorioRelacao(data) {
    if (!els.extraSlotBody) return;

    const groups = buildRegulatorioRelacao(data);

    if (els.extraSlotMeta) {
      els.extraSlotMeta.textContent = `${groups.length} regulatório(s) · por prioridade`;
    }

    if (!groups.length) {
      els.extraSlotBody.innerHTML = `<p class="extra-slot__empty">Nenhum regulatório para os filtros atuais.</p>`;
      return;
    }

    els.extraSlotBody.innerHTML = groups
      .map((g) => {
        const prioLabel =
          g.prioridade === "Sem prioridade" || !Number.isFinite(g.prioValue)
            ? "Sem prioridade"
            : `P${g.prioridade}`;
        return `
      <article class="reg-item" role="listitem">
        <div class="reg-item__head">
          <div class="reg-item__sei">
            <i data-lucide="file-text" aria-hidden="true"></i>
            <span>${escapeHtml(g.sei)}</span>
          </div>
          <span class="reg-item__prio">${escapeHtml(prioLabel)}</span>
        </div>
        <ul class="reg-item__descs">
          ${g.descs.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
        </ul>
      </article>`;
      })
      .join("");
  }

  function refresh() {
    const filtered = filterData(allData);
    const kpis = computeKpis(filtered);

    if (!filtered.length) {
      els.dashboard.hidden = true;
      els.empty.hidden = false;
      els.footer.textContent = `0 de ${allData.length} processos · filtros ativos`;
      animateKpis(kpis);
      updateRegulatorioRelacao([]);
      return;
    }

    els.empty.hidden = true;
    els.dashboard.hidden = false;
    animateKpis(kpis);
    updateCharts(filtered);
    updateRegulatorioRelacao(filtered);

    const f = getFilters();
    const active = [f.status, f.concessionaria, f.modo, f.etapaAtual, f.statusEtapa, f.prioridade].filter(Boolean).length;
    els.footer.textContent = active
      ? `${filtered.length} de ${allData.length} processos · ${active} filtro(s) ativo(s)`
      : `${filtered.length} processos carregados`;

    if (window.lucide) window.lucide.createIcons();
  }

  function showError(message) {
    els.loading.innerHTML = `
      <p style="color:#E53935;font-weight:600;">Falha ao carregar os dados</p>
      <p style="color:#9aa7b8;max-width:36rem;margin:0.5rem auto 0;">${message}</p>
      <p style="color:#9aa7b8;margin-top:1rem;font-size:0.85rem;">
        Abra via servidor local, por exemplo:
        <code style="color:#fff;">npx serve .</code>
        ou
        <code style="color:#fff;">python -m http.server</code>
      </p>`;
  }

  /* ---------- Boot ---------- */

  async function init() {
    try {
      // Prefer unlocked copy (Excel often locks "etapas atuais - separado.csv")
      const csvCandidates = ["dados-etapas.csv", "etapas atuais - separado.csv"];
      let loadedFrom = "";
      let lastErr = null;

      for (const name of csvCandidates) {
        try {
          const res = await fetch(name);
          if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${name}`);
          const body = await res.text();
          // Guard against wrong payload (e.g. server serving app.js after a locked-file read)
          if (!/SEI\s*Regulat/i.test(body.split(/\r?\n/, 1)[0] || "")) {
            throw new Error(`Conteúdo inválido em ${name} (não parece CSV)`);
          }
          const parsed = parseCsv(body);
          if (!parsed.length) throw new Error(`CSV vazio ou formato inválido em ${name}`);
          allData = parsed;
          loadedFrom = name;
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      if (!allData.length) {
        throw lastErr || new Error("CSV vazio ou formato inválido.");
      }
      console.info(`CSV carregado de: ${loadedFrom} (${allData.length} linhas)`);

      chartDefaults();
      populateFilters(allData);

      els.filterStatus.addEventListener("change", refresh);
      els.filterConc.addEventListener("change", refresh);
      els.filterModo.addEventListener("change", refresh);
      els.filterEtapa.addEventListener("change", refresh);
      els.filterStatusEtapa.addEventListener("change", refresh);
      els.filterPrioridade.addEventListener("change", refresh);
      els.btnClear.addEventListener("click", clearFilters);
      els.btnClearEmpty.addEventListener("click", clearFilters);

      els.loading.hidden = true;
      refresh();
    } catch (err) {
      console.error(err);
      const tip =
        err instanceof TypeError
          ? "Não foi possível ler o arquivo CSV (provavelmente a página foi aberta como arquivo local). Use um servidor HTTP simples."
          : String(err.message || err);
      showError(tip);
    }

    if (window.lucide) window.lucide.createIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
