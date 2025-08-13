import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MONTHS } from '../../types/plan';

// Helper function to get selected months for a specific quarter
const getMonthsForQuarter = (selectedMonths: string[], selectedQuarters: string[], quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
  if (!selectedMonths && !selectedQuarters) return '-';
  
  // If quarters are selected, show all months in that quarter
  if (selectedQuarters && selectedQuarters.includes(quarter)) {
    const quarterMonths = MONTHS
      .filter(month => month.quarter === quarter)
      .map(month => month.value);
    return quarterMonths.join(', ');
  }
  
  // If individual months are selected, show only selected months for that quarter
  if (selectedMonths && selectedMonths.length > 0) {
    const quarterMonths = MONTHS
      .filter(month => month.quarter === quarter && selectedMonths.includes(month.value))
      .map(month => month.value);
    return quarterMonths.length > 0 ? quarterMonths.join(', ') : '-';
  }
  
  return '-';
};

// Table headers in English and Amharic
const TABLE_HEADERS_EN = [
  'No.',
  'Strategic Objective',
  'Strategic Objective Weight',
  'Strategic Initiative',
  'Initiative Weight',
  'Performance Measure/Main Activity',
  'Weight',
  'Baseline',
  'Q1 Target (Selected Months)',
  'Q2 Target (Selected Months)',
  '6-Month Target',
  'Q3 Target (Selected Months)',
  'Q4 Target (Selected Months)',
  'Annual Target',
  'Implementor',
  'Budget Required',
  'Government',
  'Partners',
  'SDG',
  'Other',
  'Total Available',
  'Gap'
];

const TABLE_HEADERS_AM = [
  'ተ.ቁ',
  'ስትራቴጂክ ዓላማ',
  'የስትራቴጂክ ዓላማ ክብደት',
  'ስትራቴጂክ ተነሳሽነት',
  'የተነሳሽነት ክብደት',
  'የአፈጻጸም መለኪያ/ዋና እንቅስቃሴ',
  'ክብደት',
  'መነሻ',
  'የ1ኛ ሩብ ዓመት ዒላማ (የተመረጡ ወራት)',
  'የ2ኛ ሩብ ዓመት ዒላማ (የተመረጡ ወራት)',
  '6 ወር ዒላማ',
  'የ3ኛ ሩብ ዓመት ዒላማ (የተመረጡ ወራት)',
  'የ4ኛ ሩብ ዓመት ዒላማ (የተመረጡ ወራት)',
  'የዓመት ዒላማ',
  'ተግባሪ',
  'የሚያስፈልግ በጀት',
  'የመንግስት',
  'አጋሮች',
  'ኤስዲጂ',
  'ሌላ',
  'ጠቅላላ ያለ',
  'ክፍተት'
];

const formatCurrency = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '$0' : `$${num.toLocaleString()}`;
};

export const exportToExcel = async (
  data: any[],
  filename: string,
  language: 'en' | 'am' = 'en',
  metadata?: {
    organization?: string;
    planner?: string;
    fromDate?: string;
    toDate?: string;
    planType?: string;
  }
) => {
  const headers = language === 'en' ? TABLE_HEADERS_EN : TABLE_HEADERS_AM;
  
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  
  // Add metadata rows if provided
  const metadataRows = [];
  if (metadata) {
    metadataRows.push(['Organization:', metadata.organization || '']);
    metadataRows.push(['Planner:', metadata.planner || '']);
    metadataRows.push(['Plan Type:', metadata.planType || '']);
    metadataRows.push(['From Date:', metadata.fromDate || '']);
    metadataRows.push(['To Date:', metadata.toDate || '']);
    metadataRows.push([]); // Empty row
  }
  
  // Transform data to match table structure and add to worksheet
  const tableData = data.map(row => [
    row.No || '',
    row['Strategic Objective'] || '',
    row['Strategic Objective Weight'] || '',
    row['Strategic Initiative'] || '',
    row['Initiative Weight'] || '',
    row['Performance Measure/Main Activity'] || '',
    row.Weight || '',
    row.Baseline || '',
    `${row.Q1Target || ''}\n${row.Q1Months || ''}`,
    `${row.Q2Target || ''}\n${row.Q2Months || ''}`,
    row.SixMonthTarget || '',
    `${row.Q3Target || ''}\n${row.Q3Months || ''}`,
    `${row.Q4Target || ''}\n${row.Q4Months || ''}`,
    row.AnnualTarget || '',
    row.Implementor || '',
    formatCurrency(row.BudgetRequired),
    formatCurrency(row.Government),
    formatCurrency(row.Partners),
    formatCurrency(row.SDG),
    formatCurrency(row.Other),
    formatCurrency(row.TotalAvailable),
    formatCurrency(row.Gap)
  ]);
  
  // Combine metadata, headers, and data
  const worksheetData = [
    ...metadataRows,
    headers,
    ...tableData
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths
  const colWidths = [
    { wch: 5 },   // No.
    { wch: 25 },  // Strategic Objective
    { wch: 12 },  // Objective Weight
    { wch: 25 },  // Strategic Initiative
    { wch: 12 },  // Initiative Weight
    { wch: 30 },  // Performance Measure/Main Activity
    { wch: 10 },  // Weight
    { wch: 15 },  // Baseline
    { wch: 20 },  // Q1 Target + Months
    { wch: 20 },  // Q2 Target + Months
    { wch: 15 },  // 6-Month Target
    { wch: 20 },  // Q3 Target + Months
    { wch: 20 },  // Q4 Target + Months
    { wch: 15 },  // Annual Target
    { wch: 20 },  // Implementor
    { wch: 15 },  // Budget Required
    { wch: 12 },  // Government
    { wch: 12 },  // Partners
    { wch: 12 },  // SDG
    { wch: 12 },  // Other
    { wch: 15 },  // Total Available
    { wch: 12 }   // Gap
  ];
  
  ws['!cols'] = colWidths;
  
  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Strategic Plan');
  
  // Generate Excel file and trigger download
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToPDF = (
  data: any[],
  filename: string,
  language: 'en' | 'am' = 'en',
  metadata?: {
    organization?: string;
    planner?: string;
    fromDate?: string;
    toDate?: string;
    planType?: string;
  }
) => {
  const headers = language === 'en' ? TABLE_HEADERS_EN : TABLE_HEADERS_AM;
  
  // Create PDF document
  const doc = new jsPDF('landscape', 'pt', 'a4');
  
  // Add title
  doc.setFontSize(16);
  doc.text('Strategic Plan Export', 40, 40);
  
  // Add metadata if provided
  let yPosition = 70;
  if (metadata) {
    doc.setFontSize(10);
    if (metadata.organization) {
      doc.text(`Organization: ${metadata.organization}`, 40, yPosition);
      yPosition += 15;
    }
    if (metadata.planner) {
      doc.text(`Planner: ${metadata.planner}`, 40, yPosition);
      yPosition += 15;
    }
    if (metadata.planType) {
      doc.text(`Plan Type: ${metadata.planType}`, 40, yPosition);
      yPosition += 15;
    }
    if (metadata.fromDate && metadata.toDate) {
      doc.text(`Period: ${metadata.fromDate} - ${metadata.toDate}`, 40, yPosition);
      yPosition += 15;
    }
    yPosition += 10;
  }
  
  // Transform data to match table structure
  const tableData = data.map(row => [
    row.No || '',
    row['Strategic Objective'] || '',
    row['Strategic Objective Weight'] || '',
    row['Strategic Initiative'] || '',
    row['Initiative Weight'] || '',
    row['Performance Measure/Main Activity'] || '',
    row.Weight || '',
    row.Baseline || '',
    `${row.Q1Target || ''}\n${row.Q1Months || ''}`,
    `${row.Q2Target || ''}\n${row.Q2Months || ''}`,
    row.SixMonthTarget || '',
    `${row.Q3Target || ''}\n${row.Q3Months || ''}`,
    `${row.Q4Target || ''}\n${row.Q4Months || ''}`,
    row.AnnualTarget || '',
    row.Implementor || '',
    formatCurrency(row.BudgetRequired),
    formatCurrency(row.Government),
    formatCurrency(row.Partners),
    formatCurrency(row.SDG),
    formatCurrency(row.Other),
    formatCurrency(row.TotalAvailable),
    formatCurrency(row.Gap)
  ]);
  
  // Generate table
  autoTable(doc, {
    head: [headers],
    body: tableData,
    startY: yPosition,
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 25 },
      1: { cellWidth: 60 },
      2: { halign: 'center', cellWidth: 35 },
      3: { cellWidth: 60 },
      4: { halign: 'center', cellWidth: 35 },
      5: { cellWidth: 70 },
      6: { halign: 'center', cellWidth: 30 },
      7: { halign: 'center', cellWidth: 40 },
      8: { halign: 'center', cellWidth: 50 },
      9: { halign: 'center', cellWidth: 50 },
      10: { halign: 'center', cellWidth: 40 },
      11: { halign: 'center', cellWidth: 50 },
      12: { halign: 'center', cellWidth: 50 },
      13: { halign: 'center', cellWidth: 40 },
      14: { cellWidth: 50 },
      15: { halign: 'right', cellWidth: 40 },
      16: { halign: 'right', cellWidth: 35 },
      17: { halign: 'right', cellWidth: 35 },
      18: { halign: 'right', cellWidth: 35 },
      19: { halign: 'right', cellWidth: 35 },
      20: { halign: 'right', cellWidth: 40 },
      21: { halign: 'right', cellWidth: 35 }
    },
    margin: { top: 60, right: 40, bottom: 60, left: 40 },
    pageBreak: 'auto',
    showHead: 'everyPage',
  });
  
  // Save the PDF
  doc.save(`${filename}.pdf`);
};

export const processDataForExport = (objectives: any[], language: 'en' | 'am' = 'en'): any[] => {
  const exportData: any[] = [];
  
  if (!objectives || !Array.isArray(objectives)) {
    return exportData;
  }

  objectives.forEach((objective, objIndex) => {
    if (!objective) return;
    
    const effectiveWeight = objective.effective_weight || objective.planner_weight || objective.weight;
    
    if (!objective.initiatives || objective.initiatives.length === 0) {
      exportData.push({
        'No': objIndex + 1,
        'Strategic Objective': objective.title || 'Untitled Objective',
        'Strategic Objective Weight': `${effectiveWeight}%`,
        'Strategic Initiative': '-',
        'Initiative Weight': '-',
        'Performance Measure/Main Activity': '-',
        'Weight': '-',
        'Baseline': '-',
        'Q1Target': '-',
        'Q1Months': '-',
        'Q2Target': '-',
        'Q2Months': '-',
        'SixMonthTarget': '-',
        'Q3Target': '-',
        'Q3Months': '-',
        'Q4Target': '-',
        'Q4Months': '-',
        'AnnualTarget': '-',
        'Implementor': 'Ministry of Health',
        'BudgetRequired': '-',
        'Government': '-',
        'Partners': '-',
        'SDG': '-',
        'Other': '-',
        'TotalAvailable': '-',
        'Gap': '-'
      });
      return;
    }

    let objectiveAdded = false;

    objective.initiatives.forEach((initiative: any) => {
      if (!initiative) return;
      
      const performanceMeasures = initiative.performance_measures || [];
      const mainActivities = initiative.main_activities || [];
      const allItems = [...performanceMeasures, ...mainActivities];

      if (allItems.length === 0) {
        exportData.push({
          'No': objectiveAdded ? '' : (objIndex + 1).toString(),
          'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
          'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight}%`,
          'Strategic Initiative': initiative.name || 'Untitled Initiative',
          'Initiative Weight': `${initiative.weight || 0}%`,
          'Performance Measure/Main Activity': '-',
          'Weight': '-',
          'Baseline': '-',
          'Q1Target': '-',
          'Q1Months': '-',
          'Q2Target': '-',
          'Q2Months': '-',
          'SixMonthTarget': '-',
          'Q3Target': '-',
          'Q3Months': '-',
          'Q4Target': '-',
          'Q4Months': '-',
          'AnnualTarget': '-',
          'Implementor': initiative.organization_name || 'Ministry of Health',
          'BudgetRequired': '-',
          'Government': '-',
          'Partners': '-',
          'SDG': '-',
          'Other': '-',
          'TotalAvailable': '-',
          'Gap': '-'
        });
        objectiveAdded = true;
        return;
      }

      let initiativeAddedForObjective = false;

      performanceMeasures.forEach((measure: any) => {
        if (!measure) return;
        
        const sixMonthTarget = measure.target_type === 'cumulative' 
          ? Number(measure.q1_target || 0) + Number(measure.q2_target || 0) 
          : Number(measure.q2_target || 0);
        
        const q1Months = getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q1');
        const q2Months = getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q2');
        const q3Months = getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q3');
        const q4Months = getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q4');
        
        exportData.push({
          'No': objectiveAdded ? '' : (objIndex + 1).toString(),
          'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
          'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight}%`,
          'Strategic Initiative': initiativeAddedForObjective ? '' : (initiative.name || 'Untitled Initiative'),
          'Initiative Weight': initiativeAddedForObjective ? '' : `${initiative.weight || 0}%`,
          'Performance Measure/Main Activity': `PM: ${measure.name}`,
          'Weight': `${measure.weight}%`,
          'Baseline': measure.baseline || '-',
          'Q1Target': measure.q1_target || 0,
          'Q1Months': q1Months,
          'Q2Target': measure.q2_target || 0,
          'Q2Months': q2Months,
          'SixMonthTarget': sixMonthTarget,
          'Q3Target': measure.q3_target || 0,
          'Q3Months': q3Months,
          'Q4Target': measure.q4_target || 0,
          'Q4Months': q4Months,
          'AnnualTarget': measure.annual_target || 0,
          'Implementor': initiative.organization_name || '-',
          'BudgetRequired': 0,
          'Government': 0,
          'Partners': 0,
          'SDG': 0,
          'Other': 0,
          'TotalAvailable': 0,
          'Gap': 0
        });
        
        objectiveAdded = true;
        initiativeAddedForObjective = true;
      });

      mainActivities.forEach((activity: any) => {
        if (!activity) return;
        
        let budgetRequired = 0;
        let government = 0;
        let partners = 0;
        let sdg = 0;
        let other = 0;
        let totalAvailable = 0;
        let gap = 0;

        if (activity.budget) {
          budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL' 
            ? Number(activity.budget.estimated_cost_with_tool || 0)
            : Number(activity.budget.estimated_cost_without_tool || 0);
          
          government = Number(activity.budget.government_treasury || 0);
          partners = Number(activity.budget.partners_funding || 0);
          sdg = Number(activity.budget.sdg_funding || 0);
          other = Number(activity.budget.other_funding || 0);
          totalAvailable = government + partners + sdg + other;
          gap = Math.max(0, budgetRequired - totalAvailable);
        }

        const sixMonthTarget = activity.target_type === 'cumulative' 
          ? Number(activity.q1_target || 0) + Number(activity.q2_target || 0) 
          : Number(activity.q2_target || 0);
        
        const q1Months = getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q1');
        const q2Months = getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q2');
        const q3Months = getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q3');
        const q4Months = getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q4');
        
        exportData.push({
          'No': objectiveAdded ? '' : (objIndex + 1).toString(),
          'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
          'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight}%`,
          'Strategic Initiative': initiativeAddedForObjective ? '' : (initiative.name || 'Untitled Initiative'),
          'Initiative Weight': initiativeAddedForObjective ? '' : `${initiative.weight || 0}%`,
          'Performance Measure/Main Activity': `MA: ${activity.name}`,
          'Weight': `${activity.weight}%`,
          'Baseline': activity.baseline || '-',
          'Q1Target': activity.q1_target || 0,
          'Q1Months': q1Months,
          'Q2Target': activity.q2_target || 0,
          'Q2Months': q2Months,
          'SixMonthTarget': sixMonthTarget,
          'Q3Target': activity.q3_target || 0,
          'Q3Months': q3Months,
          'Q4Target': activity.q4_target || 0,
          'Q4Months': q4Months,
          'AnnualTarget': activity.annual_target || 0,
          'Implementor': initiative.organization_name || 
                        (activity.organization_name) ||
                        'Ministry of Health',
          'BudgetRequired': budgetRequired,
          'Government': government,
          'Partners': partners,
          'SDG': sdg,
          'Other': other,
          'TotalAvailable': totalAvailable,
          'Gap': gap
        });
        
        objectiveAdded = true;
        initiativeAddedForObjective = true;
      });
    });
  });

  return exportData;
};