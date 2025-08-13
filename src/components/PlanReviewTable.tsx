import React, { useState, useEffect } from 'react';
import { Download, FileSpreadsheet, File as FilePdf, Send, AlertCircle, CheckCircle, DollarSign, Building2, Target, Activity, BarChart3, Info, Loader } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, auth } from '../lib/api';
import type { StrategicObjective } from '../types/organization';
import type { PlanType } from '../types/plan';
import { MONTHS } from '../types/plan';
import { exportToExcel, exportToPDF, processDataForExport } from '../lib/utils/export';

interface PlanReviewTableProps {
  objectives: StrategicObjective[];
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
  organizationName: string;
  plannerName: string;
  fromDate: string;
  toDate: string;
  planType: PlanType;
  isPreviewMode?: boolean;
  userOrgId?: number | null;
  isViewOnly?: boolean;
  planData?: any;
}

const PlanReviewTable: React.FC<PlanReviewTableProps> = ({
  objectives,
  onSubmit,
  isSubmitting,
  organizationName,
  plannerName,
  fromDate,
  toDate,
  planType,
  isPreviewMode = false,
  userOrgId = null,
  isViewOnly = false,
  planData = null
}) => {
  const { t } = useLanguage();
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [processedObjectives, setProcessedObjectives] = useState<StrategicObjective[]>([]);

  // Determine the effective user organization ID
  const effectiveUserOrgId = userOrgId || planData?.organization || null;

  // Auto-fetch data when component mounts or key props change
  useEffect(() => {
    console.log('PlanReviewTable: Auto-fetching data on mount/change');
    console.log('Props received:', {
      organizationName,
      plannerName,
      objectivesLength: objectives?.length || 0,
      userOrgId,
      effectiveUserOrgId
    });
    
    // Process objectives immediately when they're available
    if (objectives && objectives.length > 0 && effectiveUserOrgId) {
      console.log('Processing objectives automatically...');
      processObjectivesData();
    }
  }, [objectives, effectiveUserOrgId, organizationName, plannerName]);

  // Helper function to get selected months for a specific quarter
  const getMonthsForQuarter = (selectedMonths: string[] | null, selectedQuarters: string[] | null, quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
    if (!selectedMonths && !selectedQuarters) {
      return '-';
    }
    
    // If quarters are selected, show all months in that quarter
    if (selectedQuarters && Array.isArray(selectedQuarters) && selectedQuarters.includes(quarter)) {
      const quarterMonths = MONTHS
        .filter(month => month.quarter === quarter)
        .map(month => month.value);
      return quarterMonths.join(', ');
    }
    
    // If individual months are selected, show only selected months for that quarter
    if (selectedMonths && Array.isArray(selectedMonths) && selectedMonths.length > 0) {
      const quarterMonths = MONTHS
        .filter(month => month.quarter === quarter && selectedMonths.includes(month.value))
        .map(month => month.value);
      return quarterMonths.length > 0 ? quarterMonths.join(', ') : '-';
    }
    
    return '-';
  };

  // Fetch organizations on mount
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        response.data.forEach((org: any) => {
          orgMap[org.id] = org.name;
        });
        
        setOrganizationsMap(orgMap);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      }
    };
    
    fetchOrganizations();
  }, []);

  // Process objectives when data changes
  const processObjectivesData = () => {
    if (!effectiveUserOrgId || !objectives?.length) {
      console.log('Cannot process objectives: missing userOrgId or objectives');
      setProcessedObjectives([]);
      return;
    }
    
    try {
      console.log(`Processing ${objectives.length} objectives for user org ${effectiveUserOrgId}`);
      
      const filteredObjectives = objectives.map(objective => {
        if (!objective) return objective;

        // Process initiatives for this objective
        const userInitiatives = (objective.initiatives || []).filter(initiative => {
          const isDefault = initiative.is_default === true;
          const belongsToUserOrg = Number(initiative.organization) === Number(effectiveUserOrgId);
          const hasNoOrg = !initiative.organization;
          const belongsToOtherOrg = initiative.organization && Number(initiative.organization) !== Number(effectiveUserOrgId);
          
          return (isDefault || belongsToUserOrg || hasNoOrg) && !belongsToOtherOrg;
        });

        // For each initiative, filter measures and activities
        const processedInitiatives = userInitiatives.map(initiative => {
          const filteredMeasures = (initiative.performance_measures || []).filter(measure => {
            const belongsToUserOrg = !measure.organization || Number(measure.organization) === Number(effectiveUserOrgId);
            return belongsToUserOrg;
          });

          const filteredActivities = (initiative.main_activities || []).filter(activity => {
            const belongsToUserOrg = !activity.organization || Number(activity.organization) === Number(effectiveUserOrgId);
            return belongsToUserOrg;
          });

          return {
            ...initiative,
            performance_measures: filteredMeasures,
            main_activities: filteredActivities
          };
        });

        return {
          ...objective,
          initiatives: processedInitiatives
        };
      });

      console.log(`Successfully processed ${filteredObjectives.length} objectives`);
      setProcessedObjectives(filteredObjectives);
    } catch (error) {
      console.error('Error processing objectives:', error);
      setProcessedObjectives([]);
    }
  };

  // Convert objectives to table rows format (same as what's displayed in the table)
  const convertObjectivesToTableRows = (objectives: StrategicObjective[]) => {
    const tableRows: any[] = [];

    objectives.forEach((objective, objIndex) => {
      const effectiveWeight = objective.effective_weight || objective.planner_weight || objective.weight;
      
      if (!objective.initiatives || objective.initiatives.length === 0) {
        // Objective with no initiatives
        tableRows.push({
          'No': objIndex + 1,
          'Strategic Objective': objective.title,
          'Strategic Objective Weight': `${effectiveWeight.toFixed(1)}%`,
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
          'Implementor': organizationName,
          'BudgetRequired': 0,
          'Government': 0,
          'Partners': 0,
          'SDG': 0,
          'Other': 0,
          'TotalAvailable': 0,
          'Gap': 0
        });
        return;
      }

      let objectiveAdded = false;
      
      objective.initiatives.forEach((initiative) => {
        const allItems = [
          ...(initiative.performance_measures || []).map(item => ({ ...item, type: 'Performance Measure' })),
          ...(initiative.main_activities || []).map(item => ({ ...item, type: 'Main Activity' }))
        ];

        if (allItems.length === 0) {
          // Initiative with no items
          tableRows.push({
            'No': objectiveAdded ? '' : (objIndex + 1),
            'Strategic Objective': objectiveAdded ? '' : objective.title,
            'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
            'Strategic Initiative': initiative.name,
            'Initiative Weight': `${initiative.weight}%`,
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
            'Implementor': initiative.organization_name || organizationsMap[initiative.organization] || organizationName,
            'BudgetRequired': 0,
            'Government': 0,
            'Partners': 0,
            'SDG': 0,
            'Other': 0,
            'TotalAvailable': 0,
            'Gap': 0
          });
          objectiveAdded = true;
          return;
        }

        let initiativeAdded = false;

        allItems.forEach((item) => {
          // Calculate budget values for main activities
          let budgetRequired = 0;
          let government = 0;
          let partners = 0;
          let sdg = 0;
          let other = 0;
          let totalAvailable = 0;
          let gap = 0;

          if (item.type === 'Main Activity') {
            // Calculate budget from sub-activities if they exist
            if (item.sub_activities && item.sub_activities.length > 0) {
              item.sub_activities.forEach((subActivity: any) => {
                const subBudgetRequired = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                const subGov = Number(subActivity.government_treasury || 0);
                const subPartners = Number(subActivity.partners_funding || 0);
                const subSdg = Number(subActivity.sdg_funding || 0);
                const subOther = Number(subActivity.other_funding || 0);
                
                budgetRequired += subBudgetRequired;
                government += subGov;
                partners += subPartners;
                sdg += subSdg;
                other += subOther;
              });
              
              totalAvailable = government + partners + sdg + other;
              gap = Math.max(0, budgetRequired - totalAvailable);
            } else if (item.budget) {
              // Use legacy budget if no sub-activities
              budgetRequired = item.budget.budget_calculation_type === 'WITH_TOOL' 
                ? Number(item.budget.estimated_cost_with_tool || 0)
                : Number(item.budget.estimated_cost_without_tool || 0);
              
              government = Number(item.budget.government_treasury || 0);
              partners = Number(item.budget.partners_funding || 0);
              sdg = Number(item.budget.sdg_funding || 0);
              other = Number(item.budget.other_funding || 0);
              totalAvailable = government + partners + sdg + other;
              gap = Math.max(0, budgetRequired - totalAvailable);
            }
          }

          // Calculate 6-month target
          const sixMonthTarget = item.target_type === 'cumulative' 
            ? Number(item.q1_target || 0) + Number(item.q2_target || 0)
            : Number(item.q2_target || 0);

          // Get selected months for each quarter
          const q1Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q1');
          const q2Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q2');
          const q3Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q3');
          const q4Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q4');

          // Add PM/MA prefix to name
          const displayName = item.type === 'Performance Measure' 
            ? `PM: ${item.name}` 
            : `MA: ${item.name}`;

          tableRows.push({
            'No': objectiveAdded ? '' : (objIndex + 1).toString(),
            'Strategic Objective': objectiveAdded ? '' : objective.title,
            'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
            'Strategic Initiative': initiativeAdded ? '' : initiative.name,
            'Initiative Weight': initiativeAdded ? '' : `${initiative.weight}%`,
            'Performance Measure/Main Activity': displayName,
            'Weight': `${item.weight}%`,
            'Baseline': item.baseline || '-',
            'Q1Target': item.q1_target || 0,
            'Q1Months': q1Months,
            'Q2Target': item.q2_target || 0,
            'Q2Months': q2Months,
            'SixMonthTarget': sixMonthTarget,
            'Q3Target': item.q3_target || 0,
            'Q3Months': q3Months,
            'Q4Target': item.q4_target || 0,
            'Q4Months': q4Months,
            'AnnualTarget': item.annual_target || 0,
            'Implementor': initiative.organization_name || organizationsMap[initiative.organization] || organizationName,
            'BudgetRequired': budgetRequired,
            'Government': government,
            'Partners': partners,
            'SDG': sdg,
            'Other': other,
            'TotalAvailable': totalAvailable,
            'Gap': gap
          });
          
          objectiveAdded = true;
          initiativeAdded = true;
        });
      });
    });

    return tableRows;
  };

  const formatCurrency = (amount: number): string => {
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      return dateString;
    }
  };

  const calculateTotals = () => {
    let total = 0;
    let governmentTotal = 0;
    let sdgTotal = 0;
    let partnersTotal = 0;
    let otherTotal = 0;

    if (!processedObjectives?.length) {
      return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
    }

    try {
      processedObjectives.forEach((objective: any) => {
        objective?.initiatives?.forEach((initiative: any) => {
          initiative?.main_activities?.forEach((activity: any) => {
            let activityBudgetRequired = 0;
            let activityGovernment = 0;
            let activityPartners = 0;
            let activitySdg = 0;
            let activityOther = 0;
            
            // Calculate budget from sub-activities if they exist
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                activityBudgetRequired += subCost;
                activityGovernment += Number(subActivity.government_treasury || 0);
                activityPartners += Number(subActivity.partners_funding || 0);
                activitySdg += Number(subActivity.sdg_funding || 0);
                activityOther += Number(subActivity.other_funding || 0);
              });
            } else if (activity.budget) {
              // Use legacy budget if no sub-activities
              activityBudgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL' 
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);
              
              activityGovernment = Number(activity.budget.government_treasury || 0);
              activityPartners = Number(activity.budget.partners_funding || 0);
              activitySdg = Number(activity.budget.sdg_funding || 0);
              activityOther = Number(activity.budget.other_funding || 0);
            }
            
            // Add to overall totals
            total += activityBudgetRequired;
            governmentTotal += activityGovernment;
            partnersTotal += activityPartners;
            sdgTotal += activitySdg;
            otherTotal += activityOther;
          });
        });
      });
    } catch (e) {
      console.error('Error calculating total budget:', e);
    }

    return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
  };

  const budgetTotals = calculateTotals();

  const handleSubmitPlan = async () => {
    setIsSubmittingPlan(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      await onSubmit();
      setSubmitSuccess('Plan submitted successfully!');
    } catch (error: any) {
      setSubmitError(error.message || 'Failed to submit plan');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const handleExportExcel = () => {
    if (!processedObjectives || processedObjectives.length === 0) {
      console.error('No objectives data available for export');
      return;
    }
    
    // Convert processed objectives to table rows format first
    const tableRowsData = convertObjectivesToTableRows(processedObjectives);
    
    exportToExcel(
      tableRowsData,
      `plan-${new Date().toISOString().slice(0, 10)}`,
      'en',
      {
        organization: organizationName,
        planner: plannerName,
        fromDate,
        toDate,
        planType: planType
      }
    );
  };

  const handleExportPDF = () => {
    if (!processedObjectives || processedObjectives.length === 0) {
      console.error('No objectives data available for export');
      return;
    }
    
    // Convert processed objectives to table rows format first
    const tableRowsData = convertObjectivesToTableRows(processedObjectives);
    
    exportToPDF(
      tableRowsData,
      `plan-${new Date().toISOString().slice(0, 10)}`,
      'en',
      {
        organization: organizationName,
        planner: plannerName,
        fromDate,
        toDate,
        planType: planType
      }
    );
  };

  // Show loading if no organization context
  if (!effectiveUserOrgId) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span className="text-gray-600">Loading...</span>
      </div>
    );
  }

  // Show message if no objectives
  if (!processedObjectives || processedObjectives.length === 0) {
    return (
      <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
        <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Plan Data</h3>
        <p className="text-gray-500">No objectives or plan data available to display.</p>
      </div>
    );
  }

  // Convert processed objectives to table rows
  const tableRows: any[] = [];

  processedObjectives.forEach((objective, objIndex) => {
    const effectiveWeight = objective.effective_weight || objective.planner_weight || objective.weight;
    
    if (!objective.initiatives || objective.initiatives.length === 0) {
      // Objective with no initiatives
      tableRows.push({
        no: objIndex + 1,
        objective: objective.title,
        objectiveWeight: `${effectiveWeight.toFixed(1)}%`,
        initiative: '-',
        initiativeWeight: '-',
        itemName: '-',
        itemType: 'Objective',
        itemWeight: '-',
        baseline: '-',
        q1Target: '-',
        q1Months: '-',
        q2Target: '-',
        q2Months: '-',
        sixMonthTarget: '-',
        q3Target: '-',
        q3Months: '-',
        q4Target: '-',
        q4Months: '-',
        annualTarget: '-',
        implementor: organizationName,
        budgetRequired: 0,
        government: 0,
        partners: 0,
        sdg: 0,
        other: 0,
        totalAvailable: 0,
        gap: 0
      });
      return;
    }

    let objectiveAdded = false;
    
    objective.initiatives.forEach((initiative) => {
      const allItems = [
        ...(initiative.performance_measures || []).map(item => ({ ...item, type: 'Performance Measure' })),
        ...(initiative.main_activities || []).map(item => ({ ...item, type: 'Main Activity' }))
      ];

      if (allItems.length === 0) {
        // Initiative with no items
        tableRows.push({
          no: objectiveAdded ? '' : (objIndex + 1),
          objective: objectiveAdded ? '' : objective.title,
          objectiveWeight: objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
          initiative: initiative.name,
          initiativeWeight: `${initiative.weight}%`,
          itemName: '-',
          itemType: 'Initiative',
          itemWeight: '-',
          baseline: '-',
          q1Target: '-',
          q1Months: '-',
          q2Target: '-',
          q2Months: '-',
          sixMonthTarget: '-',
          q3Target: '-',
          q3Months: '-',
          q4Target: '-',
          q4Months: '-',
          annualTarget: '-',
          implementor: initiative.organization_name || organizationsMap[initiative.organization] || organizationName,
          budgetRequired: 0,
          government: 0,
          partners: 0,
          sdg: 0,
          other: 0,
          totalAvailable: 0,
          gap: 0
        });
        objectiveAdded = true;
        return;
      }

      let initiativeAdded = false;

      allItems.forEach((item) => {
        // Calculate budget values for main activities
        let budgetRequired = 0;
        let government = 0;
        let partners = 0;
        let sdg = 0;
        let other = 0;
        let totalAvailable = 0;
        let gap = 0;

        if (item.type === 'Main Activity') {
          // Calculate budget from sub-activities if they exist
          if (item.sub_activities && item.sub_activities.length > 0) {
            item.sub_activities.forEach((subActivity: any) => {
              const subBudgetRequired = subActivity.budget_calculation_type === 'WITH_TOOL'
                ? Number(subActivity.estimated_cost_with_tool || 0)
                : Number(subActivity.estimated_cost_without_tool || 0);
              
              const subGov = Number(subActivity.government_treasury || 0);
              const subPartners = Number(subActivity.partners_funding || 0);
              const subSdg = Number(subActivity.sdg_funding || 0);
              const subOther = Number(subActivity.other_funding || 0);
              
              budgetRequired += subBudgetRequired;
              government += subGov;
              partners += subPartners;
              sdg += subSdg;
              other += subOther;
            });
            
            totalAvailable = government + partners + sdg + other;
            gap = Math.max(0, budgetRequired - totalAvailable);
          } else if (item.budget) {
            // Use legacy budget if no sub-activities
            budgetRequired = item.budget.budget_calculation_type === 'WITH_TOOL' 
              ? Number(item.budget.estimated_cost_with_tool || 0)
              : Number(item.budget.estimated_cost_without_tool || 0);
            
            government = Number(item.budget.government_treasury || 0);
            partners = Number(item.budget.partners_funding || 0);
            sdg = Number(item.budget.sdg_funding || 0);
            other = Number(item.budget.other_funding || 0);
            totalAvailable = government + partners + sdg + other;
            gap = Math.max(0, budgetRequired - totalAvailable);
          }
        }

        // Calculate 6-month target
        const sixMonthTarget = item.target_type === 'cumulative' 
          ? Number(item.q1_target || 0) + Number(item.q2_target || 0)
          : Number(item.q2_target || 0);

        // Get selected months for each quarter
        const q1Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q1');
        const q2Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q2');
        const q3Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q3');
        const q4Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q4');

        // Add prefix based on item type
        const displayName = item.type === 'Performance Measure' 
          ? `PM: ${item.name}` 
          : `MA: ${item.name}`;

        tableRows.push({
          no: objectiveAdded ? '' : (objIndex + 1).toString(),
          objective: objectiveAdded ? '' : objective.title,
          objectiveWeight: objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
          initiative: initiativeAdded ? '' : initiative.name,
          initiativeWeight: initiativeAdded ? '' : `${initiative.weight}%`,
          itemName: displayName,
          itemType: item.type,
          itemWeight: `${item.weight}%`,
          baseline: item.baseline || '-',
          q1Target: item.q1_target || 0,
          q1Months: q1Months,
          q2Target: item.q2_target || 0,
          q2Months: q2Months,
          sixMonthTarget: sixMonthTarget,
          q3Target: item.q3_target || 0,
          q3Months: q3Months,
          q4Target: item.q4_target || 0,
          q4Months: q4Months,
          annualTarget: item.annual_target || 0,
          implementor: initiative.organization_name || organizationsMap[initiative.organization] || organizationName,
          budgetRequired,
          government,
          partners,
          sdg,
          other,
          totalAvailable,
          gap
        });
          
        objectiveAdded = true;
        initiativeAdded = true;
      });
    });
  });

  return (
    <div className="space-y-6">
      {/* Plan Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <Building2 className="h-6 w-6 mr-2 text-green-600" />
          Strategic Plan
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Planner Organization:</span>
            <div className="font-medium">{organizationName || 'Not specified'}</div>
          </div>
          <div>
            <span className="text-gray-500">Planner:</span>
            <div className="font-medium">{plannerName || 'Not specified'}</div>
          </div>
          <div>
            <span className="text-gray-500">Plan Type:</span>
            <div className="font-medium">{planType || 'Not specified'}</div>
          </div>
          <div>
            <span className="text-gray-500">Planning Period:</span>
            <div className="font-medium">{formatDate(fromDate)} - {formatDate(toDate)}</div>
          </div>
        </div>
      </div>

      {/* Export Actions */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Complete Plan Details</h3>
        <div className="flex space-x-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <FilePdf className="h-4 w-4 mr-2" />
            PDF
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
          <p className="text-sm text-red-600">{submitError}</p>
        </div>
      )}

      {submitSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
          <p className="text-sm text-green-600">{submitSuccess}</p>
        </div>
      )}

      {/* Comprehensive Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-green-600">
              <tr>
                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">No.</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Strategic Objective</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Obj Weight</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Strategic Initiative</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Init Weight</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">PM/MA Name</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Weight</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Baseline</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">
                  <div>Q1 Target</div>
                  <div className="text-xs font-normal opacity-90">(Jul-Sep)</div>
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">
                  <div>Q2 Target</div>
                  <div className="text-xs font-normal opacity-90">(Oct-Dec)</div>
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20 bg-blue-700">6-Month Target</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">
                  <div>Q3 Target</div>
                  <div className="text-xs font-normal opacity-90">(Jan-Mar)</div>
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">
                  <div>Q4 Target</div>
                  <div className="text-xs font-normal opacity-90">(Apr-Jun)</div>
                </th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Annual Target</th>
                <th className="px-4 py-4 text-left text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Implementor</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Budget Required</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Government</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Partners</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">SDG</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Other</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-white/20">Total Available</th>
                <th className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Gap</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tableRows.map((row, index) => (
                <tr key={index} className={`hover:bg-gray-50 ${
                  row.itemType === 'Performance Measure' ? 'bg-purple-50' : 
                  row.itemType === 'Main Activity' ? 'bg-green-50' : 
                  'bg-blue-50'
                }`}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{row.no}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                    <div className="truncate" title={row.objective}>{row.objective}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {row.objectiveWeight && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {row.objectiveWeight}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                    <div className="truncate" title={row.initiative}>{row.initiative}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {row.initiativeWeight && row.initiativeWeight !== '-' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {row.initiativeWeight}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                    <div className="flex items-center">
                      {row.itemType === 'Performance Measure' && (
                        <BarChart3 className="h-4 w-4 text-purple-600 mr-2 flex-shrink-0" title="Performance Measure" />
                      )}
                      {row.itemType === 'Main Activity' && (
                        <Activity className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" title="Main Activity" />
                      )}
                      <div className="truncate" title={row.itemName}>{row.itemName}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {row.itemWeight && row.itemWeight !== '-' && (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        row.itemType === 'Performance Measure' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {row.itemWeight}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{row.baseline}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-900">
                    <div className="font-medium">{row.q1Target}</div>
                    <div className="text-xs text-blue-600 mt-1 font-medium">{row.q1Months}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-900">
                    <div className="font-medium">{row.q2Target}</div>
                    <div className="text-xs text-blue-600 mt-1 font-medium">{row.q2Months}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-medium text-blue-600">{row.sixMonthTarget}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-900">
                    <div className="font-medium">{row.q3Target}</div>
                    <div className="text-xs text-blue-600 mt-1 font-medium">{row.q3Months}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-900">
                    <div className="font-medium">{row.q4Target}</div>
                    <div className="text-xs text-blue-600 mt-1 font-medium">{row.q4Months}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center font-medium text-gray-900">{row.annualTarget}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-xs">
                    <div className="truncate" title={row.implementor || organizationName}>
                      {row.implementor || organizationName || 'Ministry of Health'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                    {row.budgetRequired > 0 ? formatCurrency(row.budgetRequired) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                    {row.government > 0 ? formatCurrency(row.government) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                    {row.partners > 0 ? formatCurrency(row.partners) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                    {row.sdg > 0 ? formatCurrency(row.sdg) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                    {row.other > 0 ? formatCurrency(row.other) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-blue-600">
                    {row.totalAvailable > 0 ? formatCurrency(row.totalAvailable) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                    {row.gap > 0 ? (
                      <span className="text-red-600">{formatCurrency(row.gap)}</span>
                    ) : row.budgetRequired > 0 ? (
                      <span className="text-green-600">Funded</span>
                    ) : '-'}
                  </td>
                </tr>
              ))}

              {/* Summary Row */}
              {budgetTotals.total > 0 && (
                <tr className="bg-blue-100 border-t-2 border-blue-300">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900" colSpan={15}>
                    TOTAL BUDGET SUMMARY
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                    {formatCurrency(budgetTotals.total)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-blue-600">
                    {formatCurrency(budgetTotals.governmentTotal)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-purple-600">
                    {formatCurrency(budgetTotals.partnersTotal)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-green-600">
                    {formatCurrency(budgetTotals.sdgTotal)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-orange-600">
                    {formatCurrency(budgetTotals.otherTotal)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-blue-600">
                    {formatCurrency(budgetTotals.governmentTotal + budgetTotals.partnersTotal + budgetTotals.sdgTotal + budgetTotals.otherTotal)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold">
                    {(budgetTotals.total - (budgetTotals.governmentTotal + budgetTotals.partnersTotal + budgetTotals.sdgTotal + budgetTotals.otherTotal)) > 0 ? (
                      <span className="text-red-600">{formatCurrency(budgetTotals.total - (budgetTotals.governmentTotal + budgetTotals.partnersTotal + budgetTotals.sdgTotal + budgetTotals.otherTotal))}</span>
                    ) : (
                      <span className="text-green-600">Fully Funded</span>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Budget Summary Cards */}
      {budgetTotals.total > 0 && (
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-green-600" />
            Budget Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">Required</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(budgetTotals.total)}</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">Available</div>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(budgetTotals.governmentTotal + budgetTotals.partnersTotal + budgetTotals.sdgTotal + budgetTotals.otherTotal)}
              </div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">Government</div>
              <div className="text-xl font-bold text-blue-600">{formatCurrency(budgetTotals.governmentTotal)}</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">Partners</div>
              <div className="text-xl font-bold text-purple-600">{formatCurrency(budgetTotals.partnersTotal)}</div>
            </div>
          </div>
          
          {(budgetTotals.total - (budgetTotals.governmentTotal + budgetTotals.partnersTotal + budgetTotals.sdgTotal + budgetTotals.otherTotal)) > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <span className="text-sm font-medium text-red-700">
                  Funding Gap: {formatCurrency(budgetTotals.total - (budgetTotals.governmentTotal + budgetTotals.partnersTotal + budgetTotals.sdgTotal + budgetTotals.otherTotal))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Submit Button - Only show if not preview mode and not view only */}
      {!isPreviewMode && !isViewOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleSubmitPlan}
            disabled={isSubmitting || isSubmittingPlan}
            className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {isSubmitting || isSubmittingPlan ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                Submit Plan for Review
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanReviewTable;