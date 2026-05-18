const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PNG } = require("pngjs");
const { createCanvas, loadImage } = require("canvas");

function generateDashboardSvg(rows, options = {}) {
  const width = 1600;
  const height = 980;
  const rootBgFill = options.transparentBackground ? "transparent" : "#f5f7fb";

  const summary = buildSummary(rows);
  const topBranches = pickTopAndBottom(summary.branches, (item) => item.growth, 3, 2, (item) => item.growth);
  const topCategories = pickTopAndBottom(summary.categoriesToday, (item) => item.growth, 3, 2, (item) => item.growth);
  const topCategoriesTotal = topCategories.reduce((acc, item) => acc + item.sales, 0);

  const kpiCards = [
    metricCard(20, 80, "Total Sales", `${formatM(summary.totalTodaySales)} M MMK`, `${formatM(summary.ytdAvgSales)} M MMK`, summary.salesDelta, "sales"),
    metricCard(415, 80, "Invoice / Day", formatInt(summary.totalTodayBills), formatInt(summary.ytdAvgBills), summary.billDelta, "invoice"),
    metricCard(810, 80, "Kyat / Invoice", `${formatInt(summary.kyatPerInvoice)} MMK`, `${formatInt(summary.ytdAvgTicket)} MMK`, summary.avgDelta, "kyat"),
    metricCard(1205, 80, "No. of Customer", formatInt(summary.customers), formatInt(summary.ytdAvgCustomers), summary.customerDelta, "customer")
  ].join("\n");

  const trendSeries = buildTrend(summary);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="trendToday" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1f4ea8"/>
      <stop offset="100%" stop-color="#0f3d92"/>
    </linearGradient>
    <linearGradient id="trendYtd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b8c8e2"/>
      <stop offset="100%" stop-color="#a5b7d6"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="${rootBgFill}"/>
  <text x="28" y="42" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#111827">Management Monitoring Dashboard</text>
  <text x="520" y="42" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#6b7280">(9AM - 10AM)</text>
  <text x="1320" y="40" font-size="22" font-family="Arial, sans-serif" fill="#111827">◷</text>
  <text x="1570" y="40" text-anchor="end" font-size="22" font-family="Arial, sans-serif" fill="#111827">Last updated ${summary.updatedAt}</text>

  ${kpiCards}
  ${todaySaleCard(summary)}

  <rect x="415" y="225" rx="16" ry="16" width="1165" height="330" fill="#fff" stroke="#dbe2ef"/>
  <rect x="415" y="225" rx="16" ry="16" width="1165" height="58" fill="#072860"/>
  <text x="438" y="263" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#fff">SALES TREND (Today vs YTD Avg Value)</text>
  ${renderTrendLegend(1268, 510)}
  ${renderTrendBars(trendSeries, 495, 295, 1060, 158, summary.timeGrowthBySlot)}
  ${renderTrendFooter(summary, trendSeries, 460, 520)}

  <rect x="20" y="565" rx="16" ry="16" width="770" height="385" fill="#fff" stroke="#dbe2ef"/>
  <rect x="20" y="565" rx="16" ry="16" width="770" height="56" fill="#072860"/>
  <text x="243" y="602" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#fff">Sales Performance by Region &amp; Branch</text>
  ${renderRegionBranchSection(summary, topBranches, options)}

  <rect x="810" y="565" rx="16" ry="16" width="770" height="385" fill="#fff" stroke="#dbe2ef"/>
  <rect x="810" y="565" rx="16" ry="16" width="770" height="56" fill="#072860"/>
  <text x="825" y="602" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="#fff">Top &amp; Bottom Performance Category (Growth %)</text>
  ${renderDonut(topCategories, summary.totalTodaySales, 955, 775, 114)}
  ${renderCategoryLegend(topCategories, topCategoriesTotal, 1158, 705)}
</svg>`;
}

function buildSummary(rows) {
  const byBranch = new Map();
  const todayByBranch = new Map();
  const byCategory = new Map();
  const todayByCategory = new Map();
  const byBranchCategory = new Map();
  let totalSales = 0;
  let totalBills = 0;
  let totalTodayBills = 0;
  let totalTodaySales = 0;
  let today_8to915 = 0;
  let today_915to930 = 0;
  let today_930to945 = 0;
  let today_945to10 = 0;
  let ytd_8to915 = 0;
  let ytd_915to930 = 0;
  let ytd_930to945 = 0;
  let ytd_945to10 = 0;
  const ytdDayCount = getYtdDayCount();

  rows.forEach((row) => {
    const sale = toNumber(row.ytd_previous_saleamnt);
    const todaySale = toNumber(row.target_day_saleamnt);
    const bill = toNumber(row.ytd_previous_billno);
    const todayBill = toNumber(row.target_day_billno);
    const branch = String(row.branch_name || "Unknown");
    const cat = String(row.product_category_name || "Unknown");
    totalSales += sale;
    totalTodaySales += todaySale;
    totalBills += bill;
    totalTodayBills += todayBill;
    today_8to915 += toNumber(row.target_day_saleamnt_8to915);
    today_915to930 += toNumber(row.target_day_saleamnt_915to930);
    today_930to945 += toNumber(row.target_day_saleamnt_930to945);
    today_945to10 += toNumber(row.target_day_saleamnt_945to10);
    ytd_8to915 += toNumber(row.ytd_previous_saleamnt_8to915);
    ytd_915to930 += toNumber(row.ytd_previous_saleamnt_915to930);
    ytd_930to945 += toNumber(row.ytd_previous_saleamnt_930to945);
    ytd_945to10 += toNumber(row.ytd_previous_saleamnt_945to10);
    byBranch.set(branch, (byBranch.get(branch) || 0) + sale);
    todayByBranch.set(branch, (todayByBranch.get(branch) || 0) + todaySale);
    byCategory.set(cat, (byCategory.get(cat) || 0) + sale);
    if (todaySale > 0) {
      todayByCategory.set(cat, (todayByCategory.get(cat) || 0) + todaySale);
    }

    if (!byBranchCategory.has(branch)) byBranchCategory.set(branch, new Map());
    const catMap = byBranchCategory.get(branch);
    catMap.set(cat, (catMap.get(cat) || 0) + sale);
  });

  const branches = [...byBranch.entries()]
    .filter(([name]) => !isExcludedBranch(name))
    .map(([name, sales]) => {
      const today = todayByBranch.get(name) || 0;
      const ytdDailyAvg = sales / ytdDayCount;
      const topCategory = getTopCategory(byBranchCategory.get(name));
      return {
        name,
        sales,
        today,
        growth: pct(today, ytdDailyAvg),
        topCategory
      };
    })
    .sort((a, b) => b.sales - a.sales);
  const categories = [...byCategory.entries()].map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales);
  const categoriesToday = [...todayByCategory.entries()]
    .filter(([name]) => !isExcludedTopCategory(name))
    .map(([name, sales]) => {
      const ytdTotal = byCategory.get(name) || 0;
      const ytdDailyAvg = ytdTotal / ytdDayCount;
      const growth = pct(sales, ytdDailyAvg);
      return { name, sales, growth };
    })
    .sort((a, b) => b.sales - a.sales);
  const customers = totalTodayBills;
  const ytdAvgBills = totalBills / ytdDayCount;
  const kyatPerInvoice = totalTodayBills ? totalTodaySales / totalTodayBills : 0;
  const ytdAvgSales = totalSales / ytdDayCount;
  const ytdAvgTicket = ytdAvgBills ? ytdAvgSales / ytdAvgBills : 0;

  return {
    totalSales,
    totalBills,
    totalTodaySales,
    totalTodayBills,
    customers,
    kyatPerInvoice,
    ytdAvgSales,
    ytdAvgBills,
    ytdAvgTicket,
    ytdAvgCustomers: ytdAvgBills,
    salesDelta: pct(totalTodaySales, ytdAvgSales),
    billDelta: pct(totalTodayBills, ytdAvgBills),
    avgDelta: pct(kyatPerInvoice, ytdAvgTicket),
    customerDelta: pct(customers, ytdAvgBills),
    timeBuckets: {
      today: {
        s8to915: today_8to915,
        s915to930: today_915to930,
        s930to945: today_930to945,
        s945to10: today_945to10
      },
      ytd: {
        s8to915: ytd_8to915,
        s915to930: ytd_915to930,
        s930to945: ytd_930to945,
        s945to10: ytd_945to10
      }
    },
    timeGrowthBySlot: {
      "9:15": pctFromTotals(today_8to915, ytd_8to915 / ytdDayCount),
      "9:30": pctFromTotals(today_915to930, ytd_915to930 / ytdDayCount),
      "9:45": pctFromTotals(today_930to945, ytd_930to945 / ytdDayCount),
      "10:00": pctFromTotals(today_945to10, ytd_945to10 / ytdDayCount)
    },
    branches,
    categories,
    categoriesToday,
    updatedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase()
  };
}

function kpiIconMarkup(kind) {
  const a =
    'stroke="#ffffff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  switch (kind) {
    case "sales":
      return `<rect x="13" y="20" width="44" height="32" rx="3" ${a}/>
  <path d="M17 20v-4a3.5 3.5 0 0 1 3.5-3.5h29a3.5 3.5 0 0 1 3.5 3.5v4" ${a}/>
  <circle cx="35" cy="37" r="7.5" ${a}/>`;
    case "invoice":
      return `<path d="M20 16h22l8 8v34H20V16z" ${a}/>
  <path d="M28 32h20 M28 40h20 M28 48h14" ${a}/>`;
    case "kyat":
      return `<rect x="11" y="22" width="48" height="30" rx="3.5" ${a}/>
  <rect x="16" y="27" width="38" height="20" rx="2" ${a}/>
  <ellipse cx="35" cy="37" rx="9" ry="10" ${a}/>`;
    case "customer":
      return `<circle cx="35" cy="25" r="10" ${a}/>
  <path d="M15 53Q35 32 55 53" ${a}/>`;
    default:
      return "";
  }
}

function metricCard(x, y, title, value, ytdValue, deltaValue, iconKind) {
  const isNegative = Number(deltaValue) < 0;
  const deltaColor = isNegative ? "#dc2626" : "#15803d";
  const arrow = isNegative ? "↘" : "↗";
  const icon = kpiIconMarkup(iconKind);
  return `<rect x="${x}" y="${y}" rx="16" ry="16" width="375" height="130" fill="#fff" stroke="#dbe2ef"/>
  <rect x="${x + 16}" y="${y + 18}" rx="16" ry="16" width="72" height="72" fill="#0a2f73"/>
  <g transform="translate(${x + 17},${y + 19})" aria-hidden="true">${icon}</g>
  <text x="${x + 106}" y="${y + 34}" font-size="16" font-family="Arial, sans-serif" fill="#111827">${escapeXml(title)}</text>
  <text x="${x + 106}" y="${y + 70}" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${escapeXml(value)}</text>
  <text x="${x + 106}" y="${y + 90}" font-size="12" font-family="Arial, sans-serif" fill="#64748b">YTD: ${escapeXml(ytdValue)}</text>
  <text x="${x + 106}" y="${y + 108}" font-size="14" font-family="Arial, sans-serif" fill="${deltaColor}">${arrow} ${formatPct(deltaValue)}%</text>`;
}

function todaySaleCard(summary) {
  const today = summary.totalTodaySales;
  const ytd = summary.ytdAvgSales;
  const growth = pct(today, ytd);
  const growthText = `${growth > 0 ? "+" : ""}${growth}%`;
  const stroke = Math.max(1, Math.min(99, Math.abs(growth)));
  const isPositive = growth >= 0;
  const trendColor = isPositive ? "#22c55e" : "#f87171";
  const trendLabel = isPositive ? "↗ YTD avg value:" : "↘ YTD avg value:";
  return `<rect x="20" y="225" rx="16" ry="16" width="375" height="330" fill="#072860" stroke="#062150"/>
  <circle cx="108" cy="315" r="55" fill="none" stroke="#e5e7eb" stroke-width="20"/>
  <circle cx="108" cy="315" r="55" fill="none" stroke="${trendColor}" stroke-width="20" stroke-dasharray="${(stroke / 100) * 345} 345" transform="rotate(-90 108 315)"/>
  <text x="108" y="324" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="${trendColor}">${growthText}</text>
  <text x="182" y="310" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="#fff">TODAY SALE</text>
  <text x="182" y="338" font-size="12" font-family="Arial, sans-serif" fill="#dbeafe">Grand Total vs. YTD</text>
  <line x1="56" y1="385" x2="356" y2="385" stroke="#8aa2ce"/>
  <text x="56" y="428" font-size="14" font-family="Arial, sans-serif" fill="#fff">Today:</text>
  <text x="370" y="428" text-anchor="end" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${formatM(today)}M MMK</text>
  <text x="56" y="468" font-size="14" font-family="Arial, sans-serif" fill="${trendColor}">${trendLabel}</text>
  <text x="370" y="468" text-anchor="end" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${formatM(ytd)}M MMK</text>`;
}

function renderDualBarChart(series, x, y, width, height) {
  const max = Math.max(...series.flatMap((s) => [s.today, s.ytd]), 1);
  const slot = width / series.length;
  const out = [];

  for (let i = 0; i < 5; i += 1) {
    const gy = y + (height * i) / 4;
    out.push(`<line x1="${x}" y1="${gy}" x2="${x + width}" y2="${gy}" stroke="#e5e7eb"/>`);
  }

  series.forEach((item, idx) => {
    const barW = (slot - 24) / 2;
    const baseX = x + idx * slot + 12;
    const h1 = (item.today / max) * (height - 22);
    const h2 = (item.ytd / max) * (height - 22);
    const y1 = y + height - h1;
    const y2 = y + height - h2;
    out.push(`<rect x="${baseX}" y="${y1}" width="${barW}" height="${h1}" fill="#032a6b"/>`);
    out.push(`<rect x="${baseX + barW + 6}" y="${y2}" width="${barW}" height="${h2}" fill="#0d4ea6"/>`);
    out.push(`<text x="${baseX + barW / 2}" y="${y1 - 4}" text-anchor="middle" font-size="9" font-family="Arial, sans-serif" fill="#0f172a">${formatCompact(item.today)}</text>`);
    out.push(`<text x="${baseX + barW + 6 + barW / 2}" y="${y2 - 4}" text-anchor="middle" font-size="9" font-family="Arial, sans-serif" fill="#334155">${formatCompact(item.ytd)}</text>`);
    out.push(`<text x="${baseX + slot / 2 - 5}" y="${y + height + 28}" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#111827">${escapeXml(item.label)}</text>`);
  });

  return out.join("\n");
}

function buildTrend(summary) {
  const tb = summary.timeBuckets || {};
  const t = tb.today || {};
  const y = tb.ytd || {};
  const hasTimeData = [t.s8to915, t.s915to930, t.s930to945, t.s945to10, y.s8to915, y.s915to930, y.s930to945, y.s945to10]
    .some((v) => Number(v) > 0);

  if (hasTimeData) {
    const ytdDayCount = getYtdDayCount();
    const y1 = (Number(y.s8to915) || 0) / ytdDayCount;
    const y2 = (Number(y.s915to930) || 0) / ytdDayCount;
    const y3 = (Number(y.s930to945) || 0) / ytdDayCount;
    const y4 = (Number(y.s945to10) || 0) / ytdDayCount;
    const t1 = Number(t.s8to915) || 0;
    const t2 = Number(t.s915to930) || 0;
    const t3 = Number(t.s930to945) || 0;
    const t4 = Number(t.s945to10) || 0;
    return [
      { time: "9:15", today: t1, ytd: y1 },
      { time: "9:30", today: t2, ytd: y2 },
      { time: "9:45", today: t3, ytd: y3 },
      { time: "10:00", today: t4, ytd: y4 }
    ];
  }

  const total = summary.totalTodaySales;
  const ytd = summary.ytdAvgSales;
  const times = ["9:15", "9:30", "9:45", "10:00"];
  return times.map((time, idx) => {
    const factor = 0.32 + idx * 0.18;
    return { time, today: total * factor, ytd: ytd * factor };
  });
}

function pickTopAndBottom(
  items,
  valueSelector,
  topCount = 3,
  bottomCount = 2,
  bottomDisplaySelector = valueSelector
) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const withValue = items
    .map((item) => ({ item, value: Number(valueSelector(item)) || 0 }))
    .sort((a, b) => b.value - a.value);

  const top = withValue.slice(0, Math.min(topCount, withValue.length)).map((x) => x.item);
  const bottomStart = Math.max(top.length, withValue.length - bottomCount);
  const bottom = withValue
    .slice(bottomStart)
    .map((x) => x.item)
    .sort((a, b) => (Number(bottomDisplaySelector(b)) || 0) - (Number(bottomDisplaySelector(a)) || 0));

  return [...top, ...bottom];
}

function renderTrendBars(series, x, y, width, height, growthBySlot = {}) {
  const max = Math.max(...series.flatMap((s) => [s.today, s.ytd]), 1);
  const yTop = Math.ceil(max / 50000000) * 50000000;
  const slot = width / series.length;
  const out = [];
  const gValues = series.map((s) => Number(growthBySlot[s.time])).filter((v) => Number.isFinite(v));
  const gMin = Math.min(-20, ...(gValues.length ? gValues : [0]));
  const gMax = Math.max(100, ...(gValues.length ? gValues : [0]));

  for (let i = 0; i < 5; i += 1) {
    const gy = y + (height * i) / 4;
    const yLabel = formatM(yTop - (yTop * i) / 4);
    out.push(`<line x1="${x}" y1="${gy}" x2="${x + width}" y2="${gy}" stroke="#e5e7eb"/>`);
    out.push(`<text x="${x - 10}" y="${gy + 4}" text-anchor="end" font-size="10.5" font-family="Arial, sans-serif" fill="#374151">${yLabel}M</text>`);
  }

  const growthPoints = [];
  series.forEach((s, i) => {
    const cx = x + i * slot + slot / 2;
    const barW = Math.max(7, Math.min(30, (slot - 20) / 2));
    const pairGap = 2;
    const pairW = barW * 2 + pairGap;
    const bx = cx - pairW / 2;
    const h1 = (s.today / yTop) * (height - 15);
    const h2 = (s.ytd / yTop) * (height - 15);
    const baseY = y + height;
    const midY = baseY - (h1 + h2) / 4;
    out.push(`<rect x="${bx}" y="${y + height - h1}" width="${barW}" height="${h1}" rx="4" ry="4" fill="url(#trendToday)"/>`);
    out.push(`<rect x="${bx + barW + pairGap}" y="${y + height - h2}" width="${barW}" height="${h2}" rx="4" ry="4" fill="url(#trendYtd)"/>`);
    out.push(`<text x="${bx + barW / 2}" y="${y + height - h1 - 6}" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="#374151">${formatM(s.today)}M</text>`);
    out.push(`<text x="${bx + barW + pairGap + barW / 2}" y="${y + height - h2 - 6}" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="#6b7280">${formatM(s.ytd)}M</text>`);
    out.push(`<text x="${cx}" y="${y + height + 32}" text-anchor="middle" font-size="13" font-family="Arial, sans-serif" fill="#111827">${s.time}</text>`);
    const g = Number(growthBySlot[s.time]);
    if (Number.isFinite(g)) {
      growthPoints.push({ x: cx, y: midY, g });
    }
  });

  if (growthPoints.length) {
    const d = growthPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    out.push(`<path d="${d}" fill="none" stroke="#5f6f8f" stroke-width="1.8" stroke-dasharray="2 3" stroke-linecap="round"/>`);
    growthPoints.forEach((p) => {
      const gText = `${p.g > 0 ? "+" : ""}${p.g.toFixed(1)}%`;
      const gColor = p.g >= 0 ? "#15803d" : "#dc2626";
      out.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="#4d5f82" stroke="#ffffff" stroke-width="1"/>`);
      out.push(`<text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" text-anchor="middle" font-size="10.5" font-family="Arial, sans-serif" font-weight="700" fill="${gColor}" stroke="#ffffff" stroke-width="2.2" paint-order="stroke fill">${gText}</text>`);
    });
  }

  out.push(`<line x1="${x + width + 6}" y1="${y}" x2="${x + width + 6}" y2="${y + height}" stroke="#9ca3af"/>`);
  out.push(`<text x="${x + width + 12}" y="${y + 4}" font-size="10.5" font-family="Arial, sans-serif" fill="#475569">${Math.round(gMax)}%</text>`);
  out.push(`<text x="${x + width + 12}" y="${y + height / 2 + 4}" font-size="10.5" font-family="Arial, sans-serif" fill="#475569">${Math.round((gMax + gMin) / 2)}%</text>`);
  out.push(`<text x="${x + width + 12}" y="${y + height + 4}" font-size="10.5" font-family="Arial, sans-serif" fill="#475569">${Math.round(gMin)}%</text>`);

  return out.join("\n");
}

function renderTrendLegend(x, y) {
  return `
    <rect x="${x}" y="${y}" width="12" height="12" rx="2" ry="2" fill="url(#trendToday)"/>
    <text x="${x + 18}" y="${y + 10.5}" font-size="11" font-family="Arial, sans-serif" fill="#1f2937">Today</text>
    <rect x="${x + 80}" y="${y}" width="12" height="12" rx="2" ry="2" fill="url(#trendYtd)"/>
    <text x="${x + 98}" y="${y + 10.5}" font-size="11" font-family="Arial, sans-serif" fill="#1f2937">YTD Avg</text>
    <line x1="${x + 178}" y1="${y + 6}" x2="${x + 202}" y2="${y + 6}" stroke="#5f6f8f" stroke-width="1.6" stroke-dasharray="2 3" stroke-linecap="round"/>
    <circle cx="${x + 190}" cy="${y + 6}" r="2.8" fill="#4d5f82" stroke="#ffffff" stroke-width="1"/>
    <text x="${x + 210}" y="${y + 10.5}" font-size="11" font-family="Arial, sans-serif" fill="#1f2937">Growth %</text>
  `;
}

function renderTrendFooter(summary, series, x, y) {
  const tb = summary.timeBuckets || {};
  const t = tb.today || {};
  const ytdSlots = tb.ytd || {};
  const ytdDayCount = getYtdDayCount();
  const todayWindowTotal =
    (Number(t.s8to915) || 0) +
    (Number(t.s915to930) || 0) +
    (Number(t.s930to945) || 0) +
    (Number(t.s945to10) || 0);
  const ytdWindowAvg =
    ((Number(ytdSlots.s8to915) || 0) +
      (Number(ytdSlots.s915to930) || 0) +
      (Number(ytdSlots.s930to945) || 0) +
      (Number(ytdSlots.s945to10) || 0)) / Math.max(1, ytdDayCount);

  const todayBase = todayWindowTotal || (Number(summary.totalTodaySales) || 0);
  const ytdBase = ytdWindowAvg || (Number(summary.ytdAvgSales) || 0);
  const variance = todayBase - ytdBase;
  const growth = pct(todayBase, ytdBase);
  const varianceColor = variance >= 0 ? "#15803d" : "#dc2626";
  const growthColor = growth >= 0 ? "#15803d" : "#dc2626";
  const growthText = `${growth >= 0 ? "+" : "-"}${Math.abs(growth).toFixed(1)}%`;
  const varianceText = `${variance >= 0 ? "+" : "-"}${formatM(Math.abs(variance))}M`;
  const topY = y - 8;
  const col2 = x + 205;
  const col3 = x + 400;
  const col4 = x + 545;
  return `
    <text x="${x}" y="${topY}" font-size="12.5" font-family="Arial, sans-serif" fill="#111827">Total Today Sales</text>
    <text x="${x}" y="${topY + 22}" font-size="13.5" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${formatM(todayBase)}M</text>
    <text x="${col2}" y="${topY}" font-size="12.5" font-family="Arial, sans-serif" fill="#111827">YTD Avg Value (Same Time)</text>
    <text x="${col2}" y="${topY + 22}" font-size="13.5" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${formatM(ytdBase)}M</text>
    <text x="${col3}" y="${topY}" font-size="12.5" font-family="Arial, sans-serif" fill="#111827">Variance</text>
    <text x="${col3}" y="${topY + 22}" font-size="13.5" font-family="Arial, sans-serif" font-weight="700" fill="${varianceColor}">${varianceText}</text>
    <text x="${col4}" y="${topY}" font-size="12.5" font-family="Arial, sans-serif" fill="#111827">Growth %</text>
    <text x="${col4}" y="${topY + 22}" font-size="13.5" font-family="Arial, sans-serif" font-weight="700" fill="${growthColor}">${growthText}</text>
  `;
}

function renderBranchTable(rows, totalSales) {
  const y = 700;
  const out = [
    '<rect x="360" y="640" width="420" height="30" fill="#072860"/>',
    '<text x="380" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Location</text>',
    '<text x="520" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Today</text>',
    '<text x="615" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Growth</text>',
    '<text x="690" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Top Category</text>'
  ];

  rows.forEach((r, i) => {
    const yy = y + i * 46;
    const growth = pct(r.sales, totalSales / rows.length);
    out.push(`<text x="380" y="${yy}" font-size="12" font-family="Arial, sans-serif" fill="#111827">${escapeXml(shortBranch(r.name))}</text>`);
    out.push(`<text x="520" y="${yy}" font-size="12" font-family="Arial, sans-serif" fill="#111827">${formatM(r.sales)} M MMK</text>`);
    out.push(`<text x="615" y="${yy}" font-size="12" font-family="Arial, sans-serif" fill="${growth >= 0 ? "#15803d" : "#dc2626"}">${growth > 0 ? "+" : ""}${growth}%</text>`);
    out.push('<text x="705" y="' + yy + '" font-size="12" font-family="Arial, sans-serif" fill="#111827">Mixed</text>');
  });

  return out.join("\n");
}

function renderRegionBranchSection(summary, rows, options = {}) {
  const mapPanelFill = options && options.mapRenderMode === "none" ? "transparent" : "#eef4fb";
  const mapPanelStroke = options && options.mapRenderMode === "none" ? "none" : "#dbe2ef";
  const list = rows.map((r, idx) => {
    const y = 706 + idx * 41;
    const growthColor = r.growth >= 0 ? "#15803d" : "#dc2626";
    const growthText = `${r.growth > 0 ? "+" : ""}${r.growth}%`;
    const branchShort = limitText(shortBranch(r.name), 21);
    const catShort = limitText(shortCategory(r.topCategory || "Mixed"), 17);
    return `
      <text x="350" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="#1f2937">${escapeXml(branchShort)}</text>
      <text x="500" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="#1f2937">${formatM(r.today)}M</text>
      <text x="592" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="${growthColor}">${growthText}</text>
      <text x="680" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="#1f2937">${escapeXml(catShort)}</text>
    `;
  }).join("");

  const growthTotal = pct(summary.totalTodaySales, summary.ytdAvgSales);
  const growthTotalColor = growthTotal >= 0 ? "#15803d" : "#dc2626";
  const growthTotalText = `${growthTotal > 0 ? "+" : ""}${growthTotal}%`;

  return `
    <rect x="30" y="638" width="258" height="302" rx="8" ry="8" fill="${mapPanelFill}" stroke="${mapPanelStroke}"/>
    ${getMyanmarMapMarkup(options)}
    ${options && options.mapRenderMode === "none" ? "" : renderRetailOutletPins(rows)}
    ${list}
    <rect x="340" y="640" width="440" height="30" fill="#072860"/>
    <text x="350" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Location</text>
    <text x="500" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Today</text>
    <text x="592" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Growth</text>
    <text x="680" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Top Category</text>

    <rect x="340" y="884" width="440" height="48" fill="#0b1d57"/>
    <text x="350" y="913" font-size="12" font-family="Arial, sans-serif" fill="#fff">Grand Total</text>
    <text x="500" y="913" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${formatM(summary.totalTodaySales)} M</text>
    <text x="592" y="913" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="${growthTotalColor}">${growthTotalText}</text>
    <text x="680" y="913" font-size="12" font-family="Arial, sans-serif" fill="#fff">All categories</text>
  `;
}

function renderDonut(items, totalSales, cx, cy, r) {
  const total = items.reduce((a, b) => a + b.sales, 0) || 1;
  const colors = getDonutColors(items.length);
  let offset = 0;
  const circle = 2 * Math.PI * r;

  const arcs = items.map((item, idx) => {
    const frac = item.sales / total;
    const len = frac * circle;
    const mid = offset + len / 2;
    const angle = -Math.PI / 2 + (mid / circle) * 2 * Math.PI;
    const rawX = cx + Math.cos(angle) * (r + 13);
    const ly = cy + Math.sin(angle) * (r + 18);
    const lx = Math.max(822, Math.min(1118, rawX));
    const textAnchor = rawX >= 1110 ? "end" : rawX <= 830 ? "start" : (Math.cos(angle) > 0.15 ? "start" : Math.cos(angle) < -0.15 ? "end" : "middle");
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[idx]}" stroke-width="42" stroke-dasharray="${len} ${circle - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    const label = `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${textAnchor}" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="#0f172a" stroke="#ffffff" stroke-width="2.4" paint-order="stroke fill">${formatM(item.sales)}M</text>`;
    offset += len;
    return `${arc}${label}`;
  }).join("\n");

  return `${arcs}
  <circle cx="${cx}" cy="${cy}" r="74" fill="#fff"/>
  <text x="${cx}" y="${cy - 16}" text-anchor="middle" font-size="16" font-family="Arial, sans-serif" fill="#4b5563">Total Sales</text>
  <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${formatM(totalSales)} M</text>
  <text x="${cx}" y="${cy + 44}" text-anchor="middle" font-size="15" font-family="Arial, sans-serif" fill="#4b5563">MMK</text>`;
}

function renderCategoryLegend(items, totalSales, x, y) {
  const colors = getDonutColors(items.length);
  const header = `
    <text x="${x + 12}" y="${y - 18}" font-size="12" font-family="Arial, sans-serif" fill="#374151">Category</text>
    <text x="1490" y="${y - 18}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#374151">Sales</text>
    <text x="1550" y="${y - 18}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#374151">Growth</text>
  `;
  const rows = items.map((item, idx) => {
    const growth = item.growth || 0;
    const growthColor = growth >= 0 ? "#15803d" : "#dc2626";
    const growthText = `${growth > 0 ? "+" : ""}${growth}%`;
    const rowY = y + idx * 42;
    return `<circle cx="${x}" cy="${y + idx * 42}" r="8" fill="${colors[idx % colors.length]}"/>
      <text x="${x + 22}" y="${rowY + 8}" font-size="12" font-family="Arial, sans-serif" fill="#111827">${escapeXml(limitText(shortCategory(item.name), 22))}</text>
      <text x="1490" y="${rowY + 8}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#111827">${formatM(item.sales)}M</text>
      <text x="1550" y="${rowY + 8}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="${growthColor}">${growthText}</text>`;
  }).join("\n");
  return `${header}\n${rows}`;
}

function getDonutColors(count) {
  const base = ["#0b3b92", "#144bb0", "#2d63c0", "#6d93d1", "#adbfde"];
  if (count <= base.length) return base;
  return Array.from({ length: count }, (_, i) => base[i % base.length]);
}

function shortBranch(v) {
  const parts = String(v).split("/-/");
  return (parts[1] || parts[0] || "Unknown").trim();
}

function shortCategory(v) {
  return String(v).replace(/^\d{2}-/, "").trim();
}

function isExcludedBranch(name) {
  const n = String(name || "").toLowerCase();
  return n.includes("dc-myawaddy") || n.includes("clearance sale") || n.includes("dc-minglardon");
}

function isExcludedTopCategory(name) {
  const n = shortCategory(name).toLowerCase();
  return n === "office use" || n === "promotion/sector" || n === "promotion/discount";
}

function branchCode(v) {
  const branch = shortBranch(v).toLowerCase();
  const map = {
    lanthit: "S.AMFI",
    "theik pan": "M.BMG",
    satsan: "S.CAM",
    "east dagon": "K.YSM",
    mawlamyine: "Z.HIM"
  };
  for (const key of Object.keys(map)) {
    if (branch.includes(key)) return map[key];
  }
  const code = String(v).split("/-/")[0] || "";
  return `B.${code.replace("MM-", "").slice(0, 3) || "R"}`;
}

function getTopCategory(catMap) {
  if (!catMap || catMap.size === 0) return "Mixed";
  let best = null;
  for (const [name, sales] of catMap.entries()) {
    if (isExcludedTopCategory(name)) continue;
    if (!best || sales > best.sales) best = { name, sales };
  }
  return best ? best.name : "Mixed";
}

/**
 * အရောင်းစင်တာ ၁–၁၄ နံပါတ်နှင့် ကိုဩဒိနိတ်၊ branch name နှင့် ကိုက်ညီစေမယ့် keyword များ။
 * မြေပုံမှာ table ထဲက branch များနဲ့ ကိုက်သော pin များကိုသာ ပြသည်။
 */
const RETAIL_OUTLETS = [
  { id: 1, label: "ပဲခူး / Bago", lat: 17.322, lon: 96.466, keys: ["ပဲခူး", "bago"] },
  { id: 2, label: "သိပ္ပံမန္တလေး / Theikpan", lat: 21.965, lon: 96.088, keys: ["သိပ္ပံ", "theikpan", "theik pan"] },
  { id: 3, label: "တမ္ပဝတီ / Tampawady", lat: 21.938, lon: 96.102, keys: ["တမ္ပဝတီ", "tampawady", "tampawati"] },
  { id: 4, label: "မော်လမြိုင် / Mawlamyine", lat: 16.49, lon: 96.858, keys: ["မော်လမြိုင်", "mawlamyine"] },
  { id: 5, label: "အေးသာယာတောင်ကြီး / Aye Tharyar", lat: 20.785, lon: 97.035, keys: ["အေးသာယာ", "aye tharyar", "aye thaya"] },
  { id: 6, label: "နေပြည်တော် / Nay Pyi Taw", lat: 19.747, lon: 96.115, keys: ["နေပြည်တော်", "nay pyi", "naypyidaw", "naypyitaw"] },
  {
    id: 7,
    label: "အင်းစိန်လမ်းသစ် / Lanthit",
    lat: 16.888,
    lon: 96.098,
    keys: ["lanthit", "လန်းသစ်", "အင်းစိန်", "insein", "in sein"]
  },
  { id: 8, label: "စက်ဆန်း / Satsan", lat: 16.851, lon: 96.072, keys: ["စက်ဆန်း", "satsan", "sat san"] },
  {
    id: 9,
    label: "အရှေ့ဒဂုံ / East Dagon",
    lat: 16.91,
    lon: 96.188,
    keys: ["အရှေ့ဒဂုံ", "east dagon", "ရှေ့ဒဂုံ"]
  },
  { id: 10, label: "လှိုင်သာယာ / Hlaing Tharyar", lat: 16.972, lon: 96.058, keys: ["လှိုင်သာယာ", "hlaing tharyar"] },
  { id: 11, label: "PRO1 Terminal M", lat: 16.947, lon: 96.085, keys: ["pro1", "pro 1", "terminal m", "terminal"] },
  { id: 12, label: "တောင်ဒဂုံ / South Dagon", lat: 16.899, lon: 96.232, keys: ["တောင်ဒဂုံ", "south dagon"] },
  { id: 13, label: "ဒညင်းကုန်း / Danyingone", lat: 16.919, lon: 96.101, keys: ["ဒညင်းကုန်း", "danyingone", "danyin gone", "danyin"] },
  { id: 14, label: "မင်္ဂလာဒုံ / Mingalardon", lat: 16.982, lon: 96.104, keys: ["မင်္ဂလာဒုံ", "mingaladon", "mingalardon", "mingalardon"] }
];

/** Simplified Myanmar border outline [lon, lat] — ~100 points, clockwise from NW. */
const MYANMAR_BORDER = [
  [92.55, 28.00], [92.80, 28.20], [93.20, 28.40], [93.70, 28.62], [94.20, 28.55], [94.70, 28.30],
  [95.20, 28.15], [95.70, 28.30], [96.20, 28.50], [96.60, 28.25], [97.00, 28.10], [97.35, 28.50],
  [97.70, 28.15], [97.85, 27.55], [97.55, 27.15], [97.75, 26.70], [98.05, 26.25], [98.25, 25.90],
  [98.50, 25.55], [98.15, 25.25], [97.80, 25.00], [97.70, 24.60], [98.15, 24.15], [98.55, 23.90],
  [98.75, 23.60], [98.35, 23.20], [98.10, 22.90], [98.50, 22.55], [99.00, 22.10], [99.40, 21.70],
  [99.80, 21.50], [100.15, 21.40], [100.30, 21.00], [100.55, 20.75], [100.40, 20.35], [100.10, 20.25],
  [100.40, 19.90], [100.55, 19.60], [100.35, 19.30], [99.90, 19.05], [99.45, 18.80], [99.10, 18.45],
  [99.00, 17.95], [98.85, 17.50], [98.60, 16.95], [98.80, 16.45], [98.95, 16.05], [98.85, 15.50],
  [98.55, 15.00], [98.55, 14.50], [98.85, 14.10], [98.65, 13.55], [98.45, 13.00], [98.20, 12.60],
  [98.40, 12.10], [98.65, 11.55], [98.75, 11.00], [98.80, 10.45], [98.55, 10.00], [98.70, 9.70],
  [98.45, 9.65], [98.10, 10.20], [97.75, 10.95], [97.70, 11.50], [97.50, 12.10], [97.70, 12.80],
  [97.45, 13.55], [96.95, 14.50], [96.50, 15.10], [96.10, 15.60], [95.85, 16.05], [96.05, 16.50],
  [96.45, 16.90], [96.15, 17.30], [95.50, 17.80], [94.95, 18.30], [94.55, 18.60], [94.30, 18.20],
  [94.50, 17.65], [94.15, 17.05], [93.80, 17.40], [93.50, 18.00], [93.25, 18.65], [93.10, 19.15],
  [92.95, 19.60], [92.80, 20.00], [92.55, 20.40], [92.25, 20.75], [92.15, 21.10], [92.25, 21.35],
  [92.10, 21.75], [92.50, 22.05], [92.65, 22.50], [92.65, 23.05], [92.85, 23.50], [93.10, 24.00],
  [93.40, 24.45], [93.55, 24.90], [93.25, 25.35], [93.70, 25.70], [94.10, 26.20], [93.90, 26.60],
  [93.45, 26.95], [93.10, 27.40], [92.75, 27.65], [92.55, 28.00]
];

const MAP_VIEW = { x: 30, y: 636, w: 260, h: 306 };

function getMyanmarProjection() {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  MYANMAR_BORDER.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  });
  const lonRange = maxLon - minLon;
  const latRange = maxLat - minLat;
  const { x, y, w, h } = MAP_VIEW;
  const scale = Math.min((w * 0.88) / lonRange, (h * 0.94) / latRange);
  const ox = x + (w - lonRange * scale) / 2;
  const oy = y + (h - latRange * scale) / 2;
  return {
    px: (lon) => ox + (lon - minLon) * scale,
    py: (lat) => oy + (maxLat - lat) * scale
  };
}

function findRetailOutletForBranch(branchName) {
  const hay = `${branchName} ${shortBranch(branchName)}`.toLowerCase();
  const sorted = [...RETAIL_OUTLETS].sort((a, b) => {
    const maxA = Math.max(...a.keys.map((k) => k.length));
    const maxB = Math.max(...b.keys.map((k) => k.length));
    return maxB - maxA;
  });
  for (const outlet of sorted) {
    for (const k of outlet.keys) {
      if (k && hay.includes(String(k).toLowerCase())) return outlet;
    }
  }
  return null;
}

const MM_BBOX = { minLon: 92.1, maxLon: 101.2, minLat: 9.5, maxLat: 28.55 };
const REAL_MAP_BOX = { dx: -22, dy: -14, dw: 44, dh: 28 };

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Linear plate: lon/lat → pixel area (fallback when no PNG dims). */
function projectLatLonToMapRect(lon, lat, left, top, w, h) {
  const { minLon, maxLon, minLat, maxLat } = MM_BBOX;
  const x = left + ((lon - minLon) / (maxLon - minLon)) * w;
  const y = top + ((maxLat - lat) / (maxLat - minLat)) * h;
  return { x, y };
}

function walkGeometry(geometry, onOuterRing) {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    onOuterRing(geometry.coordinates[0] || []);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((poly) => onOuterRing((poly && poly[0]) || []));
  }
}

/**
 * Union bounds + every outer ring from all features (fixes wrong pins when only features[0] was used).
 */
function collectRingsAndBounds(geo) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const rings = [];

  const absorb = (ring) => {
    if (!ring || ring.length < 3) return;
    rings.push(ring);
    ring.forEach(([lon, lat]) => {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  };

  if (geo.type === "FeatureCollection" && Array.isArray(geo.features)) {
    geo.features.forEach((f) => walkGeometry(f && f.geometry, absorb));
  } else if (geo.type === "Feature") {
    walkGeometry(geo.geometry, absorb);
  } else {
    walkGeometry(geo, absorb);
  }

  if (!rings.length || !Number.isFinite(minLon)) return null;
  return { minLon, maxLon, minLat, maxLat, rings };
}

function buildProjectorFromBounds(minLon, maxLon, minLat, maxLat, x, y, w, h) {
  const lonRange = maxLon - minLon || 1;
  const latRange = maxLat - minLat || 1;
  const scale = Math.min((w * 0.78) / lonRange, (h * 0.9) / latRange);
  const ox = x + (w - lonRange * scale) / 2;
  const oy = y + (h - latRange * scale) / 2;
  const px = (lon) => ox + (lon - minLon) * scale;
  const py = (lat) => oy + (maxLat - lat) * scale;
  return { px, py };
}

function createLonLatProjectorFromGeoFile(filePath, x, y, w, h) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const geo = JSON.parse(raw);
    const collected = collectRingsAndBounds(geo);
    if (!collected) return null;
    const { minLon, maxLon, minLat, maxLat, rings } = collected;
    const proj = buildProjectorFromBounds(minLon, maxLon, minLat, maxLat, x, y, w, h);
    return { ...proj, rings };
  } catch (_err) {
    return null;
  }
}

/**
 * Pins must match `<image preserveAspectRatio="xMidYMid meet">`: map lat/lon to intrinsic pixels, then same scale/offset as the bitmap.
 */
function projectLatLonOntoLetterboxedPng(lon, lat) {
  const pngPath = path.join(__dirname, "..", "public", "myanmar-real-map.png");
  const boxW = 520;
  const boxH = 311;
  const left = -100;
  const top = 640;
  let iw = boxW;
  let ih = boxH;
  if (fs.existsSync(pngPath)) {
    try {
      const png = PNG.sync.read(fs.readFileSync(pngPath));
      iw = png.width;
      ih = png.height;
    } catch (_e) {
      /* use box size */
    }
  }
  const { minLon, maxLon, minLat, maxLat } = MM_BBOX;
  const u = ((lon - minLon) / (maxLon - minLon)) * iw;
  const v = ((maxLat - lat) / (maxLat - minLat)) * ih;
  const s = Math.min(boxW / iw, boxH / ih);
  const dw = iw * s;
  const dh = ih * s;
  const offX = (boxW - dw) / 2;
  const offY = (boxH - dh) / 2;
  return { x: left + offX + u * s, y: top + offY + v * s };
}

function getMapPinProjector() {
  const realGeo = path.join(__dirname, "..", "data-myanmar.geo.json");
  const { x, y, w, h } = MAP_VIEW;

  // Prefer projecting pins with real GeoJSON bounds when available.
  const geo = createLonLatProjectorFromGeoFile(realGeo, x + 6, y + 8, w - 12, h - 16);
  if (geo && geo.px && geo.py) {
    return (lat, lon) => ({ x: geo.px(lon), y: geo.py(lat) });
  }

  // Fallback: align to displayed real-map image box.
  const left = x + REAL_MAP_BOX.dx;
  const top = y + REAL_MAP_BOX.dy;
  const width = w + REAL_MAP_BOX.dw;
  const height = h + REAL_MAP_BOX.dh;
  return (lat, lon) => projectLatLonToMapRect(lon, lat, left, top, width, height);
}

function mapRetailPinMarker(mx, my, salesValue) {
  const valueText = `${formatM(salesValue)}M`;
  const boxW = Math.max(44, 10 + valueText.length * 6.2);
  return `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)})">
    <circle cx="0" cy="0" r="4.2" fill="#11245d"/>
    <rect x="8" y="-8" rx="4" ry="4" width="${boxW.toFixed(1)}" height="16" fill="#11245d"/>
    <text x="${(8 + boxW / 2).toFixed(1)}" y="3.5" text-anchor="middle" font-size="9" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${valueText}</text>
  </g>`;
}

function getPlacedRetailPins(rows) {
  if (!rows || rows.length === 0) return [];
  const project = getMapPinProjector();
  const placed = [];
  const seenOutletIds = new Set();

  rows.forEach((row) => {
    const outlet = findRetailOutletForBranch(String(row.name || ""));
    if (!outlet || seenOutletIds.has(outlet.id)) return;
    seenOutletIds.add(outlet.id);
    let { x, y } = project(outlet.lat, outlet.lon);

    const candidates = [
      [0, 0], [0, -14], [0, 14], [14, 0], [-14, 0], [14, -14], [-14, -14], [14, 14], [-14, 14],
      [24, 0], [-24, 0], [0, -24], [0, 24]
    ];
    const markerH = 18;
    const markerW = 66;
    let best = { x, y };
    for (const [dx, dy] of candidates) {
      const tx = x + dx;
      const ty = y + dy;
      const box = { l: tx + 8, r: tx + 8 + markerW, t: ty - 8, b: ty - 8 + markerH };
      const intersects = placed.some((p) => {
        const ob = p.box;
        return !(box.r < ob.l || box.l > ob.r || box.b < ob.t || box.t > ob.b);
      });
      if (!intersects) {
        best = { x: tx, y: ty };
        break;
      }
    }
    x = clamp(best.x, -90, 315);
    y = clamp(best.y, 634, 930);
    placed.push({
      outlet,
      row,
      x,
      y,
      box: { l: x + 8, r: x + 74, t: y - 8, b: y + 10 }
    });
  });

  return placed;
}

function renderRetailOutletPins(rows) {
  const placed = getPlacedRetailPins(rows);

  if (placed.length === 0) return "";

  const out = placed.map(({ outlet, row, x, y }) => {
    const todaySales = toNumber(row && row.today);
    return `<g><title>${escapeXml(outlet.label)}</title>${mapRetailPinMarker(x, y, todaySales)}</g>`;
  });
  return `<g id="retail-outlet-pins" aria-label="Retail outlets for listed branches">${out.join("\n")}</g>`;
}

function getMyanmarMapMarkup(options = {}) {
  if (options && options.mapRenderMode === "none") {
    return "";
  }
  const { x, y, w, h } = MAP_VIEW;
  const publicDir = path.join(__dirname, "..", "public");
  const realPng = path.join(publicDir, "myanmar-real-map.png");
  const realSvg = path.join(publicDir, "myanmar-real-map.svg");
  const realGeo = path.join(__dirname, "..", "data-myanmar.geo.json");
  const disableEmbeddedMapImage = Boolean(options.disableEmbeddedMapImage);

  // 1) Real PNG map (preferred)
  if (!disableEmbeddedMapImage && fs.existsSync(realPng)) {
    const b64 = fs.readFileSync(realPng).toString("base64");
    return `
      <defs>
        <clipPath id="mmMapClip"><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="8" ry="8"/></clipPath>
        <filter id="mmImageEnhance">
          <feComponentTransfer>
            <feFuncR type="gamma" amplitude="1.05" exponent="0.93" offset="0"/>
            <feFuncG type="gamma" amplitude="1.05" exponent="0.93" offset="0"/>
            <feFuncB type="gamma" amplitude="1.05" exponent="0.93" offset="0"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <image href="data:image/png;base64,${b64}" x="${x + REAL_MAP_BOX.dx}" y="${y + REAL_MAP_BOX.dy}" width="${w + REAL_MAP_BOX.dw}" height="${h + REAL_MAP_BOX.dh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#mmMapClip)" filter="url(#mmImageEnhance)"/>`;
  }

  // 2) Real SVG map
  if (!disableEmbeddedMapImage && fs.existsSync(realSvg)) {
    const b64 = fs.readFileSync(realSvg).toString("base64");
    return `
      <defs>
        <clipPath id="mmMapClip"><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="8" ry="8"/></clipPath>
      </defs>
      <image href="data:image/svg+xml;base64,${b64}" x="${x + REAL_MAP_BOX.dx}" y="${y + REAL_MAP_BOX.dy}" width="${w + REAL_MAP_BOX.dw}" height="${h + REAL_MAP_BOX.dh}" preserveAspectRatio="xMidYMid slice" clip-path="url(#mmMapClip)"/>`;
  }

  // 3) GeoJSON-derived outline
  if (fs.existsSync(realGeo)) {
    const geoMarkup = getMyanmarMapFromGeoJSON(realGeo, x, y, w, h);
    if (geoMarkup) return geoMarkup;
  }

  // 4) Fallback embedded outline
  const { px, py } = getMyanmarProjection();
  // Build country outline path from embedded coordinates
  const pathD = MYANMAR_BORDER.map(([lon, lat], i) =>
    `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`
  ).join(" ") + " Z";

  // Reference cities for orientation
  const cities = [
    { label: "Yangon", lon: 96.17, lat: 16.87 },
    { label: "Mandalay", lon: 96.08, lat: 21.97 },
    { label: "NPT", lon: 96.07, lat: 19.76 }
  ];
  const cityMarks = cities.map(c => {
    const cx = px(c.lon).toFixed(1);
    const cy = py(c.lat).toFixed(1);
    return `<circle cx="${cx}" cy="${cy}" r="2" fill="#4a6280" opacity="0.55"/>
      <text x="${(Number(cx) + 5).toFixed(1)}" y="${(Number(cy) + 3).toFixed(1)}" font-size="7" font-family="Arial, sans-serif" fill="#4a6280" opacity="0.65">${c.label}</text>`;
  }).join("\n");

  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ry="10" fill="#cdd9ea"/>
    <path d="${pathD}" fill="#eee8c8" stroke="#8b7d5e" stroke-width="1.8" stroke-linejoin="round"/>
    ${cityMarks}`;
}

function getMyanmarOutlineOverlay() {
  const { x, y, w, h } = MAP_VIEW;
  const realGeo = path.join(__dirname, "..", "data-myanmar.geo.json");
  const geo = createLonLatProjectorFromGeoFile(realGeo, x + 6, y + 8, w - 12, h - 16);

  if (geo && geo.rings && geo.rings.length) {
    const paths = geo.rings.map((ring) => {
      let d = "";
      ring.forEach(([lon, lat], idx) => {
        d += `${idx === 0 ? "M" : "L"}${geo.px(lon).toFixed(1)} ${geo.py(lat).toFixed(1)} `;
      });
      d += "Z";
      return `<path d="${d}" fill="none" stroke="#0f2d66" stroke-width="1.8" stroke-linejoin="round"/>`;
    }).join("");
    return `<g id="mm-outline-overlay">${paths}</g>`;
  }

  const { px, py } = getMyanmarProjection();
  const pathD = MYANMAR_BORDER.map(([lon, lat], i) =>
    `${i === 0 ? "M" : "L"}${px(lon).toFixed(1)} ${py(lat).toFixed(1)}`
  ).join(" ") + " Z";
  return `<path d="${pathD}" fill="none" stroke="#0f2d66" stroke-width="1.8" stroke-linejoin="round"/>`;
}

function getMyanmarMapFromGeoJSON(filePath, x, y, w, h) {
  const data = createLonLatProjectorFromGeoFile(filePath, x, y, w, h);
  if (!data || !data.rings || !data.rings.length) return "";

  const { px, py, rings } = data;
  const paths = rings
    .map((ring) => {
      if (!ring.length) return "";
      let d = "";
      ring.forEach(([lon, lat], idx) => {
        const cmd = idx === 0 ? "M" : "L";
        d += `${cmd}${px(lon).toFixed(2)} ${py(lat).toFixed(2)} `;
      });
      d += "Z";
      return `<path d="${d}" fill="#d9c9a0" stroke="#bd9f5a" stroke-width="2"/>`;
    })
    .join("");

  return `<rect x="${x - 2}" y="${y - 4}" width="${w + 4}" height="${h + 8}" rx="8" ry="8" fill="#eef4fb" stroke="#dbe2ef"/>${paths}`;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function pct(a, b) {
  if (!b) return 0;
  return Number((((a - b) / Math.abs(b)) * 100).toFixed(1));
}

function pctFromTotals(today, ytdTotal) {
  const t = Number(today) || 0;
  const y = Number(ytdTotal) || 0;
  if (!y) return 0;
  return Number((((t - y) / y) * 100).toFixed(1));
}

function formatM(value) {
  const inMillions = Number(value) / 1000000;
  const rounded = Math.round(inMillions);
  return String(rounded);
}

function formatInt(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

function getYtdDayCount() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSinceYearStart = Math.floor((now - yearStart) / msPerDay - 2);
  // YTD average is up to yesterday, so Jan 1..yesterday count.
  return Math.max(1, daysSinceYearStart);
}

function limitText(value, maxLen) {
  const str = String(value || "");
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.0";
  return Math.abs(n).toFixed(1);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function saveDashboardSvg(rows, outputDir) {
  const svg = generateDashboardSvg(rows, { disableEmbeddedMapImage: false });
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `report-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.svg`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, svg, "utf8");
  return { filename, filepath };
}

async function saveDashboardPng(rows, outputDir) {
  // For PNG output, draw the real Myanmar map directly on canvas first,
  // then render the SVG overlays (pins/table/text) above it.
  const svg = generateDashboardSvg(rows, {
    mapRenderMode: "none",
    transparentBackground: true
  });
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `report-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`;
  const filepath = path.join(outputDir, filename);

  const width = 1600;
  const height = 980;
  const summary = buildSummary(rows);
  const topBranches = pickTopAndBottom(summary.branches, (item) => item.growth, 3, 2, (item) => item.growth);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5f7fb";
  ctx.fillRect(0, 0, width, height);
  const image = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  ctx.drawImage(image, 0, 0, width, height);
  await drawRealMyanmarMapOnCanvas(ctx);
  drawRetailPinsOnCanvas(ctx, topBranches);
  fs.writeFileSync(filepath, canvas.toBuffer("image/png"));
  return { filename, filepath };
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

async function drawRealMyanmarMapOnCanvas(ctx) {
  const pngPath = path.join(__dirname, "..", "public", "myanmar-real-map.png");
  if (!fs.existsSync(pngPath)) return;

  const { x, y, w, h } = MAP_VIEW;
  const clipX = x + 4;
  const clipY = y + 4;
  const clipW = w - 8;
  const clipH = h - 8;

  const img = await loadImage(pngPath);
  const scale = Math.max(clipW / img.width, clipH / img.height); // xMidYMid slice
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = clipX + (clipW - dw) / 2;
  const dy = clipY + (clipH - dh) / 2;

  ctx.save();
  roundedRectPath(ctx, clipX, clipY, clipW, clipH, 8);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawRetailPinsOnCanvas(ctx, rows) {
  const placed = getPlacedRetailPins(rows);
  ctx.save();
  placed.forEach(({ row, x, y }) => {
    const salesValue = toNumber(row && row.today);
    const valueText = `${formatM(salesValue)}M`;
    const boxW = Math.max(44, 10 + valueText.length * 6.2);

    ctx.fillStyle = "#11245d";
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();

    const rx = x + 8;
    const ry = y - 8;
    const rh = 16;
    const rr = 4;
    roundedRectPath(ctx, rx, ry, boxW, rh, rr);
    ctx.fillStyle = "#11245d";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 9px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(valueText, rx + boxW / 2, ry + rh / 2 + 0.5);
  });
  ctx.restore();
}

module.exports = { saveDashboardSvg, saveDashboardPng };
