// server/backend/services/pdfService.js
// Server-generated PDF for the Comprehensive Assessment Report (Milestone 4).
// pdfkit only — no headless browser — keeps this fast and reliable on
// Render's free tier. Reads ONLY the already-persisted JSON columns
// (market_analysis, risk_analysis, recommendations); never calls Groq.

const PDFDocument = require('pdfkit');

const INDIGO = '#4F46E5';
const INDIGO_LIGHT = '#EEF0FF';
const INK = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#E4E7F2';
const GOOD = '#16A34A';
const GOOD_BG = '#ECFDF3';
const WARN = '#D97706';
const WARN_BG = '#FFFBEB';
const BAD = '#DC2626';
const BAD_BG = '#FEF2F2';
const INFO = '#2563EB';
const INFO_BG = '#EFF4FF';

const PAGE_MARGIN = 46;

// pdfkit's base-14 fonts (Helvetica etc.) use WinAnsiEncoding, which has NO
// glyph for the Indian Rupee sign (₹, U+20B9) — pdfkit silently substitutes
// a broken-looking glyph instead of throwing. Swapping it for "Rs." text
// keeps every currency string readable without bundling a custom Unicode
// font file just for one character.
function clean(str) {
  if (str == null) return str;
  return String(str).replace(/₹/g, 'Rs. ');
}

function scoreColor(score) {
  if (score >= 70) return GOOD;
  if (score >= 45) return WARN;
  return BAD;
}

function levelColor(level) {
  switch ((level || '').toLowerCase()) {
    case 'low': return GOOD;
    case 'moderate': return WARN;
    case 'high': return '#C2410C';
    case 'critical': return BAD;
    default: return INDIGO;
  }
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function sectionTitle(doc, number, text) {
  ensureSpace(doc, 50);
  doc.moveDown(0.9);
  doc.fillColor(INDIGO).fontSize(8).font('Helvetica-Bold').text(number);
  doc.fillColor(INK).fontSize(14).font('Helvetica-Bold').text(text);
  const lineY = doc.y + 3;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(doc.page.width - PAGE_MARGIN, lineY).strokeColor(BORDER).lineWidth(1).stroke();
  doc.y = lineY + 10;
  doc.x = PAGE_MARGIN;
  doc.fillColor(INK).font('Helvetica').fontSize(9.5);
}

function subheading(doc, text) {
  ensureSpace(doc, 26);
  doc.moveDown(0.35);
  doc.fillColor(INK).fontSize(10.5).font('Helvetica-Bold').text(text);
  doc.moveDown(0.15);
  doc.font('Helvetica').fontSize(9.5).fillColor(INK);
}

function bulletList(doc, items, color) {
  if (!items || !items.length) {
    doc.fillColor(MUTED).fontSize(9).text('—');
    return;
  }
  items.forEach((item) => {
    ensureSpace(doc, 16);
    const startY = doc.y;
    doc.circle(PAGE_MARGIN + 3, startY + 5, 1.6).fill(color || INDIGO);
    doc.fillColor(INK).fontSize(9).font('Helvetica').text(clean(item), PAGE_MARGIN + 12, startY, {
      width: doc.page.width - PAGE_MARGIN * 2 - 12,
    });
    doc.moveDown(0.25);
  });
  doc.x = PAGE_MARGIN;
}

// A row of equal-width "metric cards" (label + big value), matching the
// vrx-metric-card style from the web report.
function metricCardsRow(doc, items) {
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const gap = 10;
  const cardWidth = (usableWidth - gap * (items.length - 1)) / items.length;
  const cardHeight = 50;

  ensureSpace(doc, cardHeight + 14);
  const y = doc.y;

  items.forEach((item, i) => {
    const x = PAGE_MARGIN + i * (cardWidth + gap);
    doc.roundedRect(x, y, cardWidth, cardHeight, 6).fillAndStroke('#FAFAFF', BORDER);
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(6.5)
      .text(item.label.toUpperCase(), x + 8, y + 8, { width: cardWidth - 16 });
    doc.fillColor(item.color || INK).font('Helvetica-Bold').fontSize(11)
      .text(clean(item.value) || '—', x + 8, y + 21, { width: cardWidth - 16 });
  });

  doc.x = PAGE_MARGIN;
  doc.y = y + cardHeight + 14;
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
}

// A single prominent score card (Growth Potential / Overall Risk / Feasibility).
function bigScoreCard(doc, label, score, sublabel, color) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  const height = 66;
  ensureSpace(doc, height + 14);
  const y = doc.y;
  const c = color || scoreColor(score);

  doc.roundedRect(PAGE_MARGIN, y, width, height, 8).fillAndStroke(INDIGO_LIGHT, '#DCE0FF');
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), PAGE_MARGIN + 14, y + 12);
  doc.fillColor(c).font('Helvetica-Bold').fontSize(20).text(`${score}`, PAGE_MARGIN + 14, y + 24, { continued: true });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(' / 100');
  if (sublabel) {
    doc.fillColor(INK).font('Helvetica').fontSize(8).text(clean(sublabel), PAGE_MARGIN + 120, y + 22, {
      width: width - 140,
    });
  }

  doc.x = PAGE_MARGIN;
  doc.y = y + height + 14;
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
}

function competitorCard(doc, c) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  const height = 58;
  ensureSpace(doc, height + 10);
  const y = doc.y;

  doc.roundedRect(PAGE_MARGIN, y, width, height, 6).fillAndStroke('#FFFFFF', BORDER);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(clean(c.name) || '—', PAGE_MARGIN + 12, y + 10);
  doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(8)
    .text(`${clean(c.position) || ''}  •  ${c.marketShare || 0}% share`, PAGE_MARGIN + 12, y + 26);

  const barX = PAGE_MARGIN + 12;
  const barY = y + 40;
  const barWidth = 140;
  doc.roundedRect(barX, barY, barWidth, 5, 2.5).fill('#EEF0F6');
  doc.roundedRect(barX, barY, (barWidth * Math.min(100, c.marketShare || 0)) / 100, 5, 2.5).fill(INDIGO);

  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
    .text(`Strength: ${clean(c.strength) || '—'}`, PAGE_MARGIN + 165, y + 12, { width: width - 180 });
  doc.text(`Weakness: ${clean(c.weakness) || '—'}`, PAGE_MARGIN + 165, y + 30, { width: width - 180 });

  doc.x = PAGE_MARGIN;
  doc.y = y + height + 10;
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
}

// ---------- Two-column grid helper (row-based page breaks) ----------
// Draws entries two at a time, checking space for the WHOLE row before
// drawing either card, so a row is never split across a page boundary —
// this is what previously caused orphaned single cards and near-empty
// trailing pages.
function twoColumnGrid(doc, entries, cardHeight, gap, renderCard) {
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const colWidth = (usableWidth - gap) / 2;

  for (let i = 0; i < entries.length; i += 2) {
    ensureSpace(doc, cardHeight + 10);
    const y = doc.y;
    renderCard(doc, PAGE_MARGIN, y, colWidth, entries[i]);
    if (entries[i + 1]) {
      renderCard(doc, PAGE_MARGIN + colWidth + gap, y, colWidth, entries[i + 1]);
    }
    doc.y = y + cardHeight + 10;
    doc.x = PAGE_MARGIN;
  }
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
}

function drawRiskCard(doc, x, y, width, entry) {
  const { label, cat } = entry;
  const color = levelColor(cat.level);
  doc.roundedRect(x, y, width, 78, 6).fillAndStroke('#FFFFFF', BORDER);
  doc.roundedRect(x, y, 4, 78, 2).fill(color);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(label, x + 14, y + 10, { width: width - 24 });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(9).text(`${cat.score ?? 0}/100`, x + 14, y + 24);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.3);
  (cat.factors || []).slice(0, 3).forEach((f, i) => {
    doc.text(`• ${clean(f)}`, x + 14, y + 38 + i * 12, { width: width - 24 });
  });
}

function drawSwotCard(doc, x, y, width, entry) {
  const { label, items, bg, border } = entry;
  const height = 100;
  doc.roundedRect(x, y, width, height, 6).fillAndStroke(bg, border);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(label, x + 12, y + 10);
  doc.fillColor(INK).font('Helvetica').fontSize(7.6);
  (items || []).slice(0, 4).forEach((item, i) => {
    doc.text(`• ${clean(item)}`, x + 12, y + 26 + i * 17, { width: width - 24 });
  });
}

function priorityColor(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical': return BAD;
    case 'high': return WARN;
    case 'medium': return INFO;
    default: return MUTED;
  }
}

function impactColor(impact) {
  switch ((impact || '').toLowerCase()) {
    case 'high': return WARN;
    case 'medium': return INFO;
    default: return MUTED;
  }
}

function actionCard(doc, index, titleText, badgeText, badgeColor, bodyText) {
  const width = doc.page.width - PAGE_MARGIN * 2;
  ensureSpace(doc, 56);
  const y = doc.y;

  doc.roundedRect(PAGE_MARGIN, y, width, 48, 6).fillAndStroke('#FAFAFF', BORDER);
  doc.roundedRect(PAGE_MARGIN, y, 3, 48, 1.5).fill(badgeColor);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(String(index).padStart(2, '0'), PAGE_MARGIN + 12, y + 8);
  doc.fillColor(badgeColor).font('Helvetica-Bold').fontSize(7).text((badgeText || '').toUpperCase(), PAGE_MARGIN + 34, y + 8);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5).text(clean(titleText), PAGE_MARGIN + 12, y + 18, { width: width - 24 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(clean(bodyText), PAGE_MARGIN + 12, y + 32, { width: width - 24 });

  doc.x = PAGE_MARGIN;
  doc.y = y + 56;
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
}

function renderMarketSection(doc, analysis) {
  sectionTitle(doc, '01', 'Market & Competitor Intelligence');

  if (!analysis) {
    doc.fillColor(MUTED).fontSize(9.5).text('Not generated for this project.');
    return;
  }

  doc.fillColor(INK).fontSize(9.5).text(clean(analysis.marketOverview) || '—');
  doc.moveDown(0.5);

  if (analysis.marketSize) {
    subheading(doc, 'Market Sizing');
    metricCardsRow(doc, [
      { label: 'TAM', value: analysis.marketSize.tam, color: INDIGO },
      { label: 'SAM', value: analysis.marketSize.sam, color: INFO },
      { label: 'SOM', value: analysis.marketSize.som, color: GOOD },
      { label: 'Growth Rate', value: analysis.marketSize.growthRate, color: WARN },
    ]);
  }

  if (analysis.competitors && analysis.competitors.length) {
    subheading(doc, 'Key Competitors');
    analysis.competitors.forEach((c) => competitorCard(doc, c));
  }

  if (analysis.industryChallenges && analysis.industryChallenges.length) {
    subheading(doc, 'Industry Challenges');
    bulletList(doc, analysis.industryChallenges, WARN);
  }

  if (analysis.opportunities && analysis.opportunities.length) {
    subheading(doc, 'Market Opportunities');
    bulletList(doc, analysis.opportunities, GOOD);
  }

  if (analysis.growthPotential) {
    subheading(doc, 'Growth Potential');
    bigScoreCard(doc, 'Growth Potential Score', analysis.growthPotential.score || 0, analysis.growthPotential.summary);
  }
}

function renderRiskSection(doc, analysis) {
  sectionTitle(doc, '02', 'Risk Assessment & SWOT');

  if (!analysis) {
    doc.fillColor(MUTED).fontSize(9.5).text('Not generated for this project.');
    return;
  }

  bigScoreCard(
    doc,
    `Overall Risk — ${analysis.riskLevel || '—'}`,
    analysis.overallRiskScore || 0,
    `Estimated success probability: ${analysis.successProbability ?? '—'}%`,
    levelColor(analysis.riskLevel)
  );

  if (analysis.riskCategories) {
    subheading(doc, 'Risk Categories');
    const labels = { businessRisk: 'Business Risk', financialRisk: 'Financial Risk', operationalRisk: 'Operational Risk', technicalRisk: 'Technical Risk' };
    const entries = Object.keys(labels)
      .filter((key) => analysis.riskCategories[key])
      .map((key) => ({ label: labels[key], cat: analysis.riskCategories[key] }));
    twoColumnGrid(doc, entries, 78, 10, drawRiskCard);
  }

  if (analysis.swot) {
    subheading(doc, 'SWOT Analysis');
    const entries = [
      { label: 'STRENGTHS', items: analysis.swot.strengths, bg: GOOD_BG, border: '#CDF0DA' },
      { label: 'WEAKNESSES', items: analysis.swot.weaknesses, bg: BAD_BG, border: '#F8CFCF' },
      { label: 'OPPORTUNITIES', items: analysis.swot.opportunities, bg: INFO_BG, border: '#CBDBFC' },
      { label: 'THREATS', items: analysis.swot.threats, bg: WARN_BG, border: '#FCEAC1' },
    ];
    twoColumnGrid(doc, entries, 100, 10, drawSwotCard);
  }

  if (analysis.feasibility) {
    subheading(doc, 'Feasibility Assessment');
    bigScoreCard(
      doc,
      `Feasibility — ${analysis.feasibility.verdict || '—'}`,
      analysis.feasibility.overallPercentage || 0,
      analysis.feasibility.summary,
      GOOD
    );
  }
}

function renderRecommendationsSection(doc, report) {
  sectionTitle(doc, '03', 'Strategic Recommendations & Risk Mitigation');

  if (!report) {
    doc.fillColor(MUTED).fontSize(9.5).text('Not generated for this project.');
    return;
  }

  if (report.recommendations && report.recommendations.length) {
    subheading(doc, 'Prioritized Recommendations');
    report.recommendations.forEach((r, i) =>
      actionCard(doc, i + 1, r.title, r.priority || '—', priorityColor(r.priority), r.rationale)
    );
  }

  if (report.riskMitigation && report.riskMitigation.length) {
    subheading(doc, 'Risk Mitigation Strategies');
    report.riskMitigation.forEach((m, i) =>
      actionCard(doc, i + 1, m.risk, `${m.impact || '—'} impact`, impactColor(m.impact), m.strategy)
    );
  }
}

function drawFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 30;
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
      .text('Veridex — Startup & Project Risk Analyzer', PAGE_MARGIN, bottom, { continued: true, width: 300 })
      .text(`Page ${i - range.start + 1} of ${range.count}`, { align: 'right' });
  }
}

// ---------- Centered cover header ----------
function renderHeader(doc, project) {
  const width = doc.page.width - PAGE_MARGIN * 2;

  doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(15)
    .text('VERIDEX', PAGE_MARGIN, PAGE_MARGIN, { width, align: 'center', characterSpacing: 1.5 });

  doc.moveDown(0.15);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8)
    .text('COMPREHENSIVE ASSESSMENT REPORT', { width, align: 'center', characterSpacing: 1.2 });

  doc.moveDown(0.5);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(21)
    .text(project.project_name || 'Untitled Project', { width, align: 'center' });

  doc.moveDown(0.25);
  const tags = [project.industry, project.business_model, project.target_market, project.budget]
    .filter(Boolean)
    .map(clean);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
    .text(tags.join('   •   '), { width, align: 'center' });

  doc.moveDown(0.1);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5)
    .text(`Generated ${new Date().toLocaleDateString()}`, { width, align: 'center' });

  doc.moveDown(0.6);
  const lineY = doc.y;
  doc.moveTo(PAGE_MARGIN, lineY).lineTo(doc.page.width - PAGE_MARGIN, lineY).strokeColor(INDIGO).lineWidth(2).stroke();
  doc.y = lineY + 14;
  doc.x = PAGE_MARGIN;

  if (project.description) {
    doc.fillColor(INK).font('Helvetica-Oblique').fontSize(9)
      .text(clean(project.description), PAGE_MARGIN, doc.y, { width, align: 'left' });
  }
}

/**
 * Streams a complete PDF report directly to the given writable stream (an
 * Express response object).
 */
function generateProjectPdf(project, outputStream) {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
  doc.pipe(outputStream);

  renderHeader(doc, project);

  renderMarketSection(doc, project.market_analysis);
  renderRiskSection(doc, project.risk_analysis);
  renderRecommendationsSection(doc, project.recommendations);

  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica').text(
    'AI-assisted analysis. Verify figures independently before making business decisions.',
    PAGE_MARGIN,
    doc.y + 10,
    { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' }
  );

  drawFooters(doc);
  doc.end();
}

module.exports = { generateProjectPdf };