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

// Two-column grid state is tracked as scratch properties on the doc object
// itself, reset before each grid and finalized after — avoids threading
// extra state through every call.
function riskCategoryCard(doc, label, cat) {
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const width = (usableWidth - 10) / 2;
  ensureSpace(doc, 90);
  const x = doc.__riskCol === 1 ? PAGE_MARGIN + width + 10 : PAGE_MARGIN;
  const y = doc.__riskColY || doc.y;
  const color = levelColor(cat.level);

  doc.roundedRect(x, y, width, 78, 6).fillAndStroke('#FFFFFF', BORDER);
  doc.roundedRect(x, y, 4, 78, 2).fill(color);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(label, x + 14, y + 10, { width: width - 24 });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(9).text(`${cat.score ?? 0}/100`, x + 14, y + 24);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.3);
  (cat.factors || []).slice(0, 3).forEach((f, i) => {
    doc.text(`• ${clean(f)}`, x + 14, y + 38 + i * 12, { width: width - 24 });
  });

  if (doc.__riskCol === 1) {
    doc.__riskCol = 0;
    doc.__riskColY = y + 88;
    doc.x = PAGE_MARGIN;
    doc.y = doc.__riskColY;
  } else {
    doc.__riskCol = 1;
    doc.__riskColY = y;
  }
}

function finishRiskGrid(doc) {
  doc.__riskCol = 0;
  doc.__riskColY = null;
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
}

function swotQuadrant(doc, label, items, bg, border) {
  const usableWidth = doc.page.width - PAGE_MARGIN * 2;
  const width = (usableWidth - 10) / 2;
  const height = 100;
  const x = doc.__swotCol === 1 ? PAGE_MARGIN + width + 10 : PAGE_MARGIN;
  const y = doc.__swotColY || doc.y;

  doc.roundedRect(x, y, width, height, 6).fillAndStroke(bg, border);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(label, x + 12, y + 10);
  doc.fillColor(INK).font('Helvetica').fontSize(7.6);
  (items || []).slice(0, 4).forEach((item, i) => {
    doc.text(`• ${clean(item)}`, x + 12, y + 26 + i * 17, { width: width - 24 });
  });

  if (doc.__swotCol === 1) {
    doc.__swotCol = 0;
    doc.__swotColY = y + height + 10;
    doc.x = PAGE_MARGIN;
    doc.y = doc.__swotColY;
  } else {
    doc.__swotCol = 1;
    doc.__swotColY = y;
  }
}

function finishSwotGrid(doc) {
  doc.__swotCol = 0;
  doc.__swotColY = null;
  doc.font('Helvetica').fillColor(INK).fontSize(9.5);
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
    doc.__riskCol = 0;
    doc.__riskColY = null;
    Object.keys(labels).forEach((key) => {
      if (analysis.riskCategories[key]) riskCategoryCard(doc, labels[key], analysis.riskCategories[key]);
    });
    finishRiskGrid(doc);
  }

  if (analysis.swot) {
    subheading(doc, 'SWOT Analysis');
    doc.__swotCol = 0;
    doc.__swotColY = null;
    swotQuadrant(doc, 'STRENGTHS', analysis.swot.strengths, GOOD_BG, '#CDF0DA');
    swotQuadrant(doc, 'WEAKNESSES', analysis.swot.weaknesses, BAD_BG, '#F8CFCF');
    swotQuadrant(doc, 'OPPORTUNITIES', analysis.swot.opportunities, INFO_BG, '#CBDBFC');
    swotQuadrant(doc, 'THREATS', analysis.swot.threats, WARN_BG, '#FCEAC1');
    finishSwotGrid(doc);
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

/**
 * Streams a complete PDF report directly to the given writable stream (an
 * Express response object).
 */
function generateProjectPdf(project, outputStream) {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
  doc.pipe(outputStream);

  doc.fillColor(INDIGO).fontSize(20).font('Helvetica-Bold').text('VERIDEX', PAGE_MARGIN, PAGE_MARGIN, { continued: true });
  doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('   Comprehensive Assessment Report');
  doc.moveDown(0.2);
  doc.fillColor(INK).fontSize(17).font('Helvetica-Bold').text(project.project_name || 'Untitled Project');

  const tags = [project.industry, project.business_model, project.target_market, project.budget]
    .filter(Boolean)
    .map(clean);
  doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(tags.join('   •   '));
  doc.fillColor(MUTED).fontSize(7.5).text(`Generated ${new Date().toLocaleDateString()}`);
  doc.moveDown(0.5);

  if (project.description) {
    doc.fillColor(INK).fontSize(9).font('Helvetica-Oblique').text(clean(project.description));
  }

  const topLineY = doc.y + 8;
  doc.moveTo(PAGE_MARGIN, topLineY).lineTo(doc.page.width - PAGE_MARGIN, topLineY).strokeColor(INDIGO).lineWidth(2).stroke();
  doc.y = topLineY + 14;
  doc.x = PAGE_MARGIN;

  renderMarketSection(doc, project.market_analysis);
  renderRiskSection(doc, project.risk_analysis);
  renderRecommendationsSection(doc, project.recommendations);

  ensureSpace(doc, 40);
  doc.moveDown(1);
  doc.fillColor(MUTED).fontSize(7.5).font('Helvetica').text(
    'AI-assisted analysis. Verify figures independently before making business decisions.',
    { align: 'center' }
  );

  drawFooters(doc);
  doc.end();
}

module.exports = { generateProjectPdf };