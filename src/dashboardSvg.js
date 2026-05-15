const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PNG } = require("pngjs");

function generateDashboardSvg(rows) {
  const width = 1600;
  const height = 980;

  const summary = buildSummary(rows);
  const topBranches = summary.branches.slice(0, 5);
  const topCategories = summary.categoriesToday.slice(0, 5);
  const topCategoriesTotal = topCategories.reduce((acc, item) => acc + item.sales, 0);

  const kpiCards = [
    metricCard(20, 80, "Total Sales", `${formatM(summary.totalTodaySales)} M MMK`, summary.salesDelta, "sales"),
    metricCard(415, 80, "Invoice / Day", formatInt(summary.totalTodayBills), summary.billDelta, "invoice"),
    metricCard(810, 80, "Kyat / Invoice", `${formatInt(summary.kyatPerInvoice)} MMK`, summary.avgDelta, "kyat"),
    metricCard(1205, 80, "No. of Customer", formatInt(summary.customers), summary.customerDelta, "customer")
  ].join("\n");

  const compareSeries = [
    { label: "Sales", today: summary.totalTodaySales / 1000000, ytd: summary.ytdAvgSales / 1000000 },
    { label: "Invoice/Day", today: summary.totalTodayBills, ytd: summary.ytdAvgBills },
    { label: "Kyat/Invoice", today: summary.kyatPerInvoice / 1000, ytd: summary.ytdAvgTicket / 1000 },
    { label: "Customers", today: summary.customers, ytd: summary.ytdAvgCustomers }
  ];

  const trendSeries = buildTrend(summary.totalTodaySales, summary.ytdAvgSales);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#f5f7fb"/>
  <text x="28" y="42" font-size="28" font-family="Arial, sans-serif" font-weight="700" fill="#111827">Management Monitoring Dashboard</text>
  <text x="620" y="42" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#6b7280">(9AM - 10AM)</text>
  <text x="1320" y="40" font-size="22" font-family="Arial, sans-serif" fill="#111827">◷</text>
  <text x="1570" y="40" text-anchor="end" font-size="22" font-family="Arial, sans-serif" fill="#111827">Last updated ${summary.updatedAt}</text>

  ${kpiCards}
  ${todaySaleCard(summary)}

  <rect x="415" y="215" rx="16" ry="16" width="505" height="330" fill="#fff" stroke="#dbe2ef"/>
  <text x="438" y="245" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#111827">YTD vs Current Day Comparison</text>
  ${renderDualBarChart(compareSeries, 445, 280, 445, 200)}

  <rect x="935" y="215" rx="16" ry="16" width="645" height="330" fill="#fff" stroke="#dbe2ef"/>
  <rect x="935" y="215" rx="16" ry="16" width="645" height="58" fill="#072860"/>
  <text x="958" y="253" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#fff">SALES TREND (Today vs YTD Avg Value)</text>
  ${renderTrendBars(trendSeries, 990, 290, 540, 165)}
  ${renderTrendFooter(summary, 970, 520)}

  <rect x="20" y="565" rx="16" ry="16" width="770" height="385" fill="#fff" stroke="#dbe2ef"/>
  <rect x="20" y="565" rx="16" ry="16" width="770" height="56" fill="#072860"/>
  <text x="243" y="602" font-size="24" font-family="Arial, sans-serif" font-weight="700" fill="#fff">Sales Performance by Region &amp; Branch</text>
  ${renderRegionBranchSection(summary, topBranches)}

  <rect x="810" y="565" rx="16" ry="16" width="770" height="385" fill="#fff" stroke="#dbe2ef"/>
  <rect x="810" y="565" rx="16" ry="16" width="770" height="56" fill="#072860"/>
  <text x="825" y="602" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="#fff">Top &amp; Bottom Performance Category (Growth %)</text>
  ${renderDonut(topCategories, summary.totalTodaySales, 980, 775, 118)}
  ${renderCategoryLegend(topCategories, topCategoriesTotal, 1145, 705)}
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
  const categoriesToday = [...todayByCategory.entries()].map(([name, sales]) => ({ name, sales })).sort((a, b) => b.sales - a.sales);
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

function metricCard(x, y, title, value, deltaValue, iconKind) {
  const isNegative = Number(deltaValue) < 0;
  const deltaColor = isNegative ? "#dc2626" : "#15803d";
  const arrow = isNegative ? "↘" : "↗";
  const icon = kpiIconMarkup(iconKind);
  return `<rect x="${x}" y="${y}" rx="16" ry="16" width="375" height="120" fill="#fff" stroke="#dbe2ef"/>
  <rect x="${x + 18}" y="${y + 20}" rx="16" ry="16" width="70" height="70" fill="#0a2f73"/>
  <g transform="translate(${x + 18},${y + 20})" aria-hidden="true">${icon}</g>
  <text x="${x + 106}" y="${y + 36}" font-size="16" font-family="Arial, sans-serif" fill="#111827">${escapeXml(title)}</text>
  <text x="${x + 106}" y="${y + 74}" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${escapeXml(value)}</text>
  <text x="${x + 106}" y="${y + 98}" font-size="15" font-family="Arial, sans-serif" fill="${deltaColor}">${arrow} ${formatPct(deltaValue)}% vs YTD avg value</text>`;
}

function todaySaleCard(summary) {
  const today = summary.totalTodaySales;
  const ytd = summary.ytdAvgSales;
  const growth = pct(today, ytd);
  const stroke = Math.max(1, Math.min(99, Math.abs(growth)));
  const isPositive = growth >= 0;
  const trendColor = isPositive ? "#22c55e" : "#f87171";
  const trendLabel = isPositive ? "↗ YTD avg value:" : "↘ YTD avg value:";
  return `<rect x="20" y="215" rx="16" ry="16" width="375" height="330" fill="#072860" stroke="#062150"/>
  <circle cx="108" cy="305" r="55" fill="none" stroke="#e5e7eb" stroke-width="20"/>
  <circle cx="108" cy="305" r="55" fill="none" stroke="${trendColor}" stroke-width="20" stroke-dasharray="${(stroke / 100) * 345} 345" transform="rotate(-90 108 305)"/>
  <text x="108" y="314" text-anchor="middle" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="${trendColor}">${growth}%</text>
  <text x="182" y="300" font-size="20" font-family="Arial, sans-serif" font-weight="700" fill="#fff">TODAY SALE</text>
  <text x="182" y="328" font-size="12" font-family="Arial, sans-serif" fill="#dbeafe">Grand Total vs. YTD</text>
  <line x1="56" y1="375" x2="356" y2="375" stroke="#8aa2ce"/>
  <text x="56" y="418" font-size="14" font-family="Arial, sans-serif" fill="#fff">Today:</text>
  <text x="370" y="418" text-anchor="end" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${formatM(today)}M MMK</text>
  <text x="56" y="458" font-size="14" font-family="Arial, sans-serif" fill="${trendColor}">${trendLabel}</text>
  <text x="370" y="458" text-anchor="end" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${formatM(ytd)}M MMK</text>`;
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

function buildTrend(total, ytd) {
  const times = ["9:00", "9:15", "9:30", "9:45", "10:00"];
  return times.map((t, idx) => {
    const factor = 0.25 + idx * 0.18;
    return { time: t, today: total * factor, ytd: ytd * factor };
  });
}

function renderTrendBars(series, x, y, width, height) {
  const max = Math.max(...series.flatMap((s) => [s.today, s.ytd]), 1);
  const yTop = Math.ceil(max / 50000000) * 50000000;
  const slot = width / series.length;
  const out = [];

  for (let i = 0; i < 5; i += 1) {
    const gy = y + (height * i) / 4;
    const yLabel = formatM(yTop - (yTop * i) / 4);
    out.push(`<line x1="${x}" y1="${gy}" x2="${x + width}" y2="${gy}" stroke="#e5e7eb"/>`);
    out.push(`<text x="${x - 8}" y="${gy + 4}" text-anchor="end" font-size="9" font-family="Arial, sans-serif" fill="#374151">${yLabel}M</text>`);
  }

  series.forEach((s, i) => {
    const barW = (slot - 26) / 2;
    const bx = x + i * slot + 13;
    const h1 = (s.today / yTop) * (height - 15);
    const h2 = (s.ytd / yTop) * (height - 15);
    out.push(`<rect x="${bx}" y="${y + height - h1}" width="${barW}" height="${h1}" fill="#072860"/>`);
    out.push(`<rect x="${bx + barW + 6}" y="${y + height - h2}" width="${barW}" height="${h2}" fill="#b0bfd4"/>`);
    out.push(`<text x="${bx + barW / 2}" y="${y + height - h1 - 4}" text-anchor="middle" font-size="8.5" font-family="Arial, sans-serif" fill="#0f172a">${formatM(s.today)}M</text>`);
    out.push(`<text x="${bx + barW + 6 + barW / 2}" y="${y + height - h2 - 4}" text-anchor="middle" font-size="8.5" font-family="Arial, sans-serif" fill="#475569">${formatM(s.ytd)}M</text>`);
    out.push(`<text x="${bx + slot / 2 - 6}" y="${y + height + 30}" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#111827">${s.time}</text>`);
  });

  return out.join("\n");
}

function renderTrendFooter(summary, x, y) {
  const variance = summary.totalTodaySales - summary.ytdAvgSales;
  const growth = pct(summary.totalTodaySales, summary.ytdAvgSales);
  const varianceColor = variance >= 0 ? "#15803d" : "#dc2626";
  const growthColor = growth >= 0 ? "#15803d" : "#dc2626";
  const growthText = `${growth >= 0 ? "+" : "-"}${Math.abs(growth).toFixed(1)}%`;
  const varianceText = `${variance >= 0 ? "+" : "-"}${formatM(Math.abs(variance))}M`;
  const topY = y - 8;
  return `
    <text x="${x}" y="${topY}" font-size="13" font-family="Arial, sans-serif" fill="#111827">Total Today Sales</text>
    <text x="${x}" y="${topY + 20}" font-size="13" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${formatM(summary.totalTodaySales)}M</text>
    <text x="${x + 170}" y="${topY}" font-size="13" font-family="Arial, sans-serif" fill="#111827">YTD Avg Value (Same Time)</text>
    <text x="${x + 170}" y="${topY + 20}" font-size="13" font-family="Arial, sans-serif" font-weight="700" fill="#111827">${formatM(summary.ytdAvgSales)}M</text>
    <text x="${x + 360}" y="${topY}" font-size="13" font-family="Arial, sans-serif" fill="#111827">Variance</text>
    <text x="${x + 360}" y="${topY + 20}" font-size="13" font-family="Arial, sans-serif" font-weight="700" fill="${varianceColor}">${varianceText}</text>
    <text x="${x + 485}" y="${topY}" font-size="13" font-family="Arial, sans-serif" fill="#111827">Growth %</text>
    <text x="${x + 485}" y="${topY + 20}" font-size="13" font-family="Arial, sans-serif" font-weight="700" fill="${growthColor}">${growthText}</text>
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

function renderRegionBranchSection(summary, rows) {
  const list = rows.map((r, idx) => {
    const y = 706 + idx * 41;
    const growthColor = r.growth >= 0 ? "#15803d" : "#dc2626";
    const growthText = `${r.growth > 0 ? "+" : ""}${r.growth}%`;
    const branchShort = shortBranch(r.name);
    const catShort = shortCategory(r.topCategory || "Mixed");
    return `
      <text x="363" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="#1f2937">${escapeXml(branchShort)}</text>
      <text x="510" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="#1f2937">${formatM(r.today)}M</text>
      <text x="604" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="${growthColor}">${growthText}</text>
      <text x="690" y="${y}" font-size="12" font-family="Arial, sans-serif" fill="#1f2937">${escapeXml(catShort)}</text>
    `;
  }).join("");

  const growthTotal = pct(summary.totalTodaySales, summary.ytdAvgSales);
  const growthTotalColor = growthTotal >= 0 ? "#15803d" : "#dc2626";
  const growthTotalText = `${growthTotal > 0 ? "+" : ""}${growthTotal}%`;

  return `
    <rect x="30" y="638" width="258" height="302" rx="8" ry="8" fill="#eef4fb" stroke="#dbe2ef"/>
    ${getMyanmarMapMarkup()}
    ${renderRetailOutletPins(rows)}
    ${list}
    <rect x="340" y="640" width="440" height="30" fill="#072860"/>
    <text x="362" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Location</text>
    <text x="510" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Today</text>
    <text x="604" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Growth</text>
    <text x="690" y="660" font-size="12" font-family="Arial, sans-serif" fill="#fff">Top Category</text>

    <rect x="340" y="884" width="440" height="48" fill="#0b1d57"/>
    <text x="362" y="913" font-size="12" font-family="Arial, sans-serif" fill="#fff">Gerd Total</text>
    <text x="500" y="913" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${formatM(summary.totalTodaySales)} M</text>
    <text x="594" y="913" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="${growthTotalColor}">${growthTotalText}</text>
    <text x="690" y="913" font-size="12" font-family="Arial, sans-serif" fill="#fff">All categories</text>
  `;
}

function renderDonut(items, totalSales, cx, cy, r) {
  const total = items.reduce((a, b) => a + b.sales, 0) || 1;
  const colors = ["#0b3b92", "#144bb0", "#2d63c0", "#6d93d1", "#adbfde"];
  let offset = 0;
  const circle = 2 * Math.PI * r;

  const arcs = items.map((item, idx) => {
    const frac = item.sales / total;
    const len = frac * circle;
    const mid = offset + len / 2;
    const angle = -Math.PI / 2 + (mid / circle) * 2 * Math.PI;
    const lx = cx + Math.cos(angle) * (r + 16);
    const ly = cy + Math.sin(angle) * (r + 24);
    const textAnchor = Math.cos(angle) > 0.15 ? "start" : Math.cos(angle) < -0.15 ? "end" : "middle";
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[idx]}" stroke-width="42" stroke-dasharray="${len} ${circle - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    const label = `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${textAnchor}" font-size="10.5" font-family="Arial, sans-serif" font-weight="700" fill="#0f172a" stroke="#ffffff" stroke-width="2.6" paint-order="stroke fill">${formatM(item.sales)}M</text>`;
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
  const header = `
    <text x="${x + 12}" y="${y - 18}" font-size="12" font-family="Arial, sans-serif" fill="#374151">Category</text>
    <text x="1490" y="${y - 18}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#374151">Sales</text>
    <text x="1550" y="${y - 18}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#374151">%</text>
  `;
  const rows = items.map((item, idx) => {
    const pctVal = totalSales ? (item.sales / totalSales) * 100 : 0;
    const rowY = y + idx * 42;
    return `<circle cx="${x}" cy="${y + idx * 42}" r="8" fill="#1e3a8a"/>
      <text x="${x + 22}" y="${rowY + 8}" font-size="12" font-family="Arial, sans-serif" fill="#111827">${escapeXml(limitText(shortCategory(item.name), 22))}</text>
      <text x="1490" y="${rowY + 8}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#111827">${formatM(item.sales)}M</text>
      <text x="1550" y="${rowY + 8}" text-anchor="end" font-size="12" font-family="Arial, sans-serif" fill="#111827">${pctVal.toFixed(0)}%</text>`;
  }).join("\n");
  return `${header}\n${rows}`;
}

function shortBranch(v) {
  const parts = String(v).split("/-/");
  return (parts[1] || parts[0] || "Unknown").trim();
}

function shortCategory(v) {
  return String(v).replace(/^\d{2}-/, "").trim();
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
  if (fs.existsSync(realGeo)) {
    const data = createLonLatProjectorFromGeoFile(realGeo, 32, 642, 254, 296);
    if (data) return (lat, lon) => ({ x: data.px(lon), y: data.py(lat) });
  }
  const publicDir = path.join(__dirname, "..", "public");
  if (fs.existsSync(path.join(publicDir, "myanmar-real-map.png"))) {
    return (lat, lon) => projectLatLonOntoLetterboxedPng(lon, lat);
  }
  return (lat, lon) => projectLatLonToMapRect(lon, lat, 32, 642, 254, 296);
}

function mapRetailPinMarker(mx, my, rank) {
  const colors = [
    "#072860", "#0b4da2", "#1565c0", "#2e7d32", "#6a1b9a", "#c2410c", "#7c3aed",
    "#0f766e", "#b45309", "#be123c", "#166534", "#1d4ed8", "#9333ea", "#ca8a04", "#0e7490"
  ];
  const fill = colors[(rank - 1) % colors.length];
  const label = String(rank);
  const fontSize = rank >= 10 ? 9 : 10;
  return `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)})">
    <path d="M0,1 C-9,-5 -12,-24 0,-32 C12,-24 9,-5 0,1 z" fill="${fill}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="0" cy="-22" r="8" fill="#fff" stroke="${fill}" stroke-width="1.5"/>
    <text x="0" y="-18.5" text-anchor="middle" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" fill="${fill}">${label}</text>
  </g>`;
}

function renderRetailOutletPins(rows) {
  if (!rows || rows.length === 0) return "";
  const project = getMapPinProjector();
  const placed = [];
  const seenOutletIds = new Set();

  rows.forEach((row) => {
    const outlet = findRetailOutletForBranch(String(row.name || ""));
    if (!outlet || seenOutletIds.has(outlet.id)) return;
    seenOutletIds.add(outlet.id);
    let { x, y } = project(outlet.lat, outlet.lon);
    x += ((placed.length % 3) - 1) * 3;
    y += Math.floor(placed.length / 3) * 4;
    x = clamp(x, -90, 315);
    y = clamp(y, 634, 930);
    placed.push({ outlet, x, y });
  });

  if (placed.length === 0) return "";

  const out = placed.map(({ outlet, x, y }, i) => {
    return `<g><title>${escapeXml(outlet.label)}</title>${mapRetailPinMarker(x, y, outlet.id)}</g>`;
  });
  return `<g id="retail-outlet-pins" aria-label="Retail outlets for listed branches">${out.join("\n")}</g>`;
}

function getMyanmarMapMarkup() {
  const publicDir = path.join(__dirname, "..", "public");
  const realPng = path.join(publicDir, "myanmar-real-map.png");
  const realSvg = path.join(publicDir, "myanmar-real-map.svg");
  const realGeo = path.join(__dirname, "..", "data-myanmar.geo.json");

  // Prefer user-provided real map asset.
  if (fs.existsSync(realGeo)) {
    const geoMap = getMyanmarMapFromGeoJSON(realGeo, 32, 642, 254, 296);
    if (geoMap) return geoMap;
  }

  if (fs.existsSync(realPng)) {
    const b64 = fs.readFileSync(realPng).toString("base64");
    return `<image href="data:image/png;base64,${b64}" x="-100" y="640" width="520" height="311" preserveAspectRatio="xMidYMid meet"/>`;
  }

  // if (fs.existsSync(realSvg)) {
  //   const b64 = fs.readFileSync(realSvg).toString("base64");
  //   return `<image href="data:image/svg+xml;base64,${b64}" x="32" y="642" width="370" height="321" preserveAspectRatio="xMidYMid meet"/>`;
  // }

  // Fallback stylized map when no real asset provided yet.
  return `<g transform="translate(32 642) scale(0.605 0.57)">
    <defs>
      <linearGradient id="seaInline" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#cfe3f8"/>
        <stop offset="100%" stop-color="#a5c5e8"/>
      </linearGradient>
    </defs>
    <rect width="420" height="520" fill="#f4f7fc"/>
    <path d="M0 310 C80 250, 145 295, 220 280 C290 265, 350 305, 420 260 L420 520 L0 520 Z" fill="url(#seaInline)"/>
    <path d="M252 18l-20 14-18 32-22 18-8 30-19 20-11 28-17 18-4 26-19 27 6 24-9 25 7 28-11 23 10 24-5 22 13 26 18 8 9 14 16 13 19-4 16 11 16-9 7-23 17-22 9-28 8-30 13-20 7-29 9-18 8-25 13-21 11-28-4-28 8-32-17-22-9-31-19-18-14-23-10-25z" fill="#ffffff" stroke="#1b2f6b" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M259 78l-10 22-7 22-6 27-13 18-8 24-6 30-12 19-7 26-9 24-9 20 7 9 16-18 11-30 15-27 10-28 10-24 10-28 12-20 11-25-2-22-8-18-10-21z" fill="none" stroke="#5d78aa" stroke-width="2"/>
  </g>`;
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

function formatM(value) {
  return (value / 1000000).toFixed(2);
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
  const daysSinceYearStart = Math.floor((now - yearStart) / msPerDay) - 1;
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
  const svg = generateDashboardSvg(rows);
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `report-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.svg`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, svg, "utf8");
  return { filename, filepath };
}

module.exports = { saveDashboardSvg };
