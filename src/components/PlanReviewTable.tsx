import React, { useState, useEffect } from 'react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Download, FileSpreadsheet, AlertCircle, Info, Calendar, DollarSign, Target, Activity, Building2, Users, CheckCircle, XCircle, Eye, Loader } from 'lucide-react';
import { StrategicObjective } from '../types/organization';
import { PlanType } from '../types/plan';
import { exportToExcel, exportToPDF, processDataForExport } from '../lib/utils/export';
import { MONTHS } from '../types/plan';

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
  isViewOnly = false
}) => {
  const { t } = useLanguage();
  const [processedObjectives, setProcessedObjectives] = useState<StrategicObjective[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedInitiatives, setExpandedInitiatives] = useState<Record<string, boolean>>({});

  // Production-safe data processing
  useEffect(() => {
    const processObjectivesData = () => {
      try {
        setIsProcessing(true);
        setError(null);
        
        console.log('PlanReviewTable: Processing objectives data for user org:', userOrgId);
        console.log('PlanReviewTable: Raw objectives count:', objectives?.length || 0);
        
        if (!objectives || !Array.isArray(objectives)) {
          console.log('PlanReviewTable: No valid objectives data');
          setProcessedObjectives([]);
          return;
        }

        // Production-safe objective processing with organization filtering
        const filtered = objectives.map(objective => {
          if (!objective) return null;

          // Get effective weight
          const effectiveWeight = objective.effective_weight ?? objective.planner_weight ?? objective.weight ?? 0;
          
          console.log(`PlanReviewTable: Processing objective "${objective.title}" with effective weight: ${effectiveWeight}`);

          // Filter initiatives to only show user's organization
          const filteredInitiatives = (objective.initiatives || [])
            .filter(initiative => {
              if (!initiative) return false;
              
              const isDefault = initiative.is_default === true;
              const hasNoOrg = !initiative.organization || initiative.organization === null;
              const belongsToUserOrg = userOrgId && initiative.organization && 
                                      Number(initiative.organization) === Number(userOrgId);
              
              const shouldInclude = isDefault || hasNoOrg || belongsToUserOrg;
              
              console.log(`PlanReviewTable: Initiative "${initiative.name}" - org:${initiative.organization}, userOrg:${userOrgId}, isDefault:${isDefault}, include:${shouldInclude}`);
              
              return shouldInclude;
            })
            .map(initiative => {
              if (!initiative) return initiative;

              // Filter performance measures for user's organization
              const filteredMeasures = (initiative.performance_measures || [])
                .filter(measure => {
                  if (!measure) return false;
                  const hasNoOrg = !measure.organization || measure.organization === null;
                  const belongsToUserOrg = userOrgId && measure.organization && 
                                          Number(measure.organization) === Number(userOrgId);
                  return hasNoOrg || belongsToUserOrg;
                });

              // Filter main activities for user's organization
              const filteredActivities = (initiative.main_activities || [])
                .filter(activity => {
                  if (!activity) return false;
                  const hasNoOrg = !activity.organization || activity.organization === null;
                  const belongsToUserOrg = userOrgId && activity.organization && 
                                          Number(activity.organization) === Number(userOrgId);
                  return hasNoOrg || belongsToUserOrg;
                });

              console.log(`PlanReviewTable: Initiative "${initiative.name}" filtered - measures:${filteredMeasures.length}, activities:${filteredActivities.length}`);

              return {
                ...initiative,
                performance_measures: filteredMeasures,
                main_activities: filteredActivities,
                organization_name: initiative.organization_name || 'Ministry of Health'
              };
            });

          return {
            ...objective,
            effective_weight: effectiveWeight,
            initiatives: filteredInitiatives
          };
        }).filter(Boolean);

        console.log(`PlanReviewTable: Processed ${filtered.length} objectives with user org filtering`);
        setProcessedObjectives(filtered);
        
      } catch (error) {
        console.error('PlanReviewTable: Error processing objectives:', error);
        setError('Failed to process plan data');
        setProcessedObjectives([]);
      } finally {
        setIsProcessing(false);
      }
    };

    processObjectivesData();
  }, [objectives, userOrgId]);

  // Toggle initiative expansion
  const toggleInitiativeExpand = (initiativeId: string) => {
    setExpandedInitiatives(prev => ({
      ...prev,
      [initiativeId]: !prev[initiativeId]
    }));
  };

  // Get selected months for quarter display
  const getMonthsForQuarter = (selectedMonths: string[], selectedQuarters: string[], quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
    if (!selectedMonths && !selectedQuarters) return '-';
    
    if (selectedQuarters && selectedQuarters.includes(quarter)) {
      const quarterMonths = MONTHS
        .filter(month => month.quarter === quarter)
        .map(month => month.value);
      return quarterMonths.join(', ');
    }
    
    if (selectedMonths && selectedMonths.length > 0) {
      const quarterMonths = MONTHS
        .filter(month => month.quarter === quarter && selectedMonths.includes(month.value))
        .map(month => month.value);
      return quarterMonths.length > 0 ? quarterMonths.join(', ') : '-';
    }
    
    return '-';
  };

  // Export functions
  const handleExportExcel = () => {
    try {
      const exportData = processDataForExport(processedObjectives, 'en');
      exportToExcel(
        exportData,
        `plan-${organizationName}-${new Date().toISOString().slice(0, 10)}`,
        'en',
        {
          organization: organizationName,
          planner: plannerName,
          fromDate: fromDate,
          toDate: toDate,
          planType: planType
        }
      );
    } catch (error) {
      console.error('Error exporting to Excel:', error);
    }
  };

  const handleExportPDF = () => {
    try {
      const exportData = processDataForExport(processedObjectives, 'en');
      exportToPDF(
        exportData,
        `plan-${organizationName}-${new Date().toISOString().slice(0, 10)}`,
        'en',
        {
          organization: organizationName,
          planner: plannerName,
          fromDate: fromDate,
          toDate: toDate,
          planType: planType
        }
      );
    } catch (error) {
      console.error('Error exporting to PDF:', error);
    }
  };

  // Calculate total budget
  const calculateTotalBudget = () => {
    let totalRequired = 0;
    let totalAvailable = 0;

    processedObjectives.forEach(objective => {
      objective.initiatives?.forEach(initiative => {
        initiative.main_activities?.forEach(activity => {
          // Get budget from sub-activities
          if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
            activity.sub_activities.forEach(subActivity => {
              const cost = subActivity.budget_calculation_type === 'WITH_TOOL' 
                ? Number(subActivity.estimated_cost_with_tool || 0)
                : Number(subActivity.estimated_cost_without_tool || 0);
              
              totalRequired += cost;
              totalAvailable += Number(subActivity.government_treasury || 0) +
                              Number(subActivity.sdg_funding || 0) +
                              Number(subActivity.partners_funding || 0) +
                              Number(subActivity.other_funding || 0);
            });
          }
        });
      });
    });

    return { totalRequired, totalAvailable, gap: Math.max(0, totalRequired - totalAvailable) };
  };

  const budgetSummary = calculateTotalBudget();

  // Loading state
  if (isProcessing) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span>Processing plan data...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <h3 className="text-lg font-medium text-red-800 mb-1">Error Loading Plan</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // Empty state
  if (!processedObjectives || processedObjectives.length === 0) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
        <Info className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
        <h3 className="text-lg font-medium text-yellow-800 mb-1">No Data Available</h3>
        <p className="text-yellow-600">No objectives or activities found for your organization.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan Header Information */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Organization:</span>
            <span className="ml-2 font-medium">{organizationName}</span>
          </div>
          <div>
            <span className="text-gray-500">Planner:</span>
            <span className="ml-2 font-medium">{plannerName}</span>
          </div>
          <div>
            <span className="text-gray-500">Plan Type:</span>
            <span className="ml-2 font-medium">{planType}</span>
          </div>
          <div>
            <span className="text-gray-500">Period:</span>
            <span className="ml-2 font-medium">{fromDate} - {toDate}</span>
          </div>
        </div>
      </div>

      {/* Budget Summary */}
      {budgetSummary.totalRequired > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-green-600" />
            Budget Summary
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-2xl font-bold text-blue-600">${budgetSummary.totalRequired.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Required</div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-2xl font-bold text-green-600">${budgetSummary.totalAvailable.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Available</div>
            </div>
            <div className={`p-3 rounded ${budgetSummary.gap > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className={`text-2xl font-bold ${budgetSummary.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                ${budgetSummary.gap.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">
                {budgetSummary.gap > 0 ? 'Funding Gap' : 'Surplus'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Actions */}
      {!isViewOnly && (
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleExportExcel}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </button>
        </div>
      )}

      {/* Objectives List */}
      <div className="space-y-6">
        {processedObjectives.map((objective, objIndex) => {
          const effectiveWeight = objective.effective_weight ?? objective.planner_weight ?? objective.weight ?? 0;
          
          return (
            <div key={objective.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {/* Objective Header */}
              <div className="bg-blue-50 p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Target className="h-5 w-5 text-blue-600 mr-2" />
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {objIndex + 1}. {objective.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{objective.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">{effectiveWeight.toFixed(1)}%</div>
                    <div className="text-xs text-gray-500">Weight</div>
                  </div>
                </div>
              </div>

              {/* Initiatives */}
              <div className="p-4">
                {!objective.initiatives || objective.initiatives.length === 0 ? (
                  <div className="text-center p-6 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                    <Info className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">No initiatives found for this objective</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {objective.initiatives.map((initiative, initIndex) => {
                      const isExpanded = expandedInitiatives[initiative.id] || false;
                      const allMeasures = initiative.performance_measures || [];
                      const allActivities = initiative.main_activities || [];
                      const totalItems = allMeasures.length + allActivities.length;

                      return (
                        <div key={initiative.id} className="border border-gray-200 rounded-lg">
                          {/* Initiative Header */}
                          <div 
                            className="bg-green-50 p-3 cursor-pointer hover:bg-green-100 transition-colors"
                            onClick={() => toggleInitiativeExpand(initiative.id)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Activity className="h-4 w-4 text-green-600 mr-2" />
                                <div>
                                  <h4 className="font-medium text-gray-900">
                                    {initiative.name}
                                  </h4>
                                  <div className="flex items-center mt-1 space-x-3">
                                    <span className="text-xs text-gray-600">
                                      Weight: {initiative.weight}%
                                    </span>
                                    <span className="text-xs text-gray-600">
                                      Items: {totalItems}
                                    </span>
                                    {initiative.organization_name && (
                                      <div className="flex items-center text-xs text-gray-600">
                                        <Building2 className="h-3 w-3 mr-1" />
                                        {initiative.organization_name}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleInitiativeExpand(initiative.id);
                                  }}
                                  className="text-green-600 hover:text-green-800"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Initiative Content */}
                          {isExpanded && (
                            <div className="p-3 space-y-4">
                              {/* Performance Measures */}
                              {allMeasures.length > 0 && (
                                <div>
                                  <h5 className="text-sm font-medium text-purple-700 mb-2 flex items-center">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2">
                                      PM
                                    </span>
                                    Performance Measures ({allMeasures.length})
                                  </h5>
                                  <div className="space-y-2">
                                    {allMeasures.map(measure => (
                                      <div key={measure.id} className="bg-purple-50 p-3 rounded border border-purple-200">
                                        <div className="flex justify-between items-start">
                                          <div className="flex-1">
                                            <h6 className="font-medium text-gray-900">{measure.name}</h6>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-gray-600">
                                              <div>Weight: {measure.weight}%</div>
                                              <div>Baseline: {measure.baseline || 'N/A'}</div>
                                              <div>Annual: {measure.annual_target || 0}</div>
                                              <div>Type: {measure.target_type || 'cumulative'}</div>
                                            </div>
                                            <div className="grid grid-cols-4 gap-2 mt-1 text-xs text-gray-500">
                                              <div>Q1: {measure.q1_target || 0}</div>
                                              <div>Q2: {measure.q2_target || 0}</div>
                                              <div>Q3: {measure.q3_target || 0}</div>
                                              <div>Q4: {measure.q4_target || 0}</div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Main Activities */}
                              {allActivities.length > 0 && (
                                <div>
                                  <h5 className="text-sm font-medium text-orange-700 mb-2 flex items-center">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 mr-2">
                                      MA
                                    </span>
                                    Main Activities ({allActivities.length})
                                  </h5>
                                  <div className="space-y-2">
                                    {allActivities.map(activity => {
                                      const subActivities = activity.sub_activities || [];
                                      const totalBudget = subActivities.reduce((sum, sub) => {
                                        const cost = sub.budget_calculation_type === 'WITH_TOOL' 
                                          ? Number(sub.estimated_cost_with_tool || 0)
                                          : Number(sub.estimated_cost_without_tool || 0);
                                        return sum + cost;
                                      }, 0);

                                      return (
                                        <div key={activity.id} className="bg-orange-50 p-3 rounded border border-orange-200">
                                          <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                              <h6 className="font-medium text-gray-900">{activity.name}</h6>
                                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-gray-600">
                                                <div>Weight: {activity.weight}%</div>
                                                <div>Baseline: {activity.baseline || 'N/A'}</div>
                                                <div>Annual: {activity.annual_target || 0}</div>
                                                <div>Sub-activities: {subActivities.length}</div>
                                              </div>
                                              <div className="grid grid-cols-4 gap-2 mt-1 text-xs text-gray-500">
                                                <div>Q1: {activity.q1_target || 0}</div>
                                                <div>Q2: {activity.q2_target || 0}</div>
                                                <div>Q3: {activity.q3_target || 0}</div>
                                                <div>Q4: {activity.q4_target || 0}</div>
                                              </div>
                                              {totalBudget > 0 && (
                                                <div className="mt-2 text-xs text-green-600 flex items-center">
                                                  <DollarSign className="h-3 w-3 mr-1" />
                                                  Budget: ${totalBudget.toLocaleString()}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* Sub-Activities */}
                                          {subActivities.length > 0 && (
                                            <div className="mt-3 space-y-1">
                                              <h6 className="text-xs font-medium text-gray-700">Sub-Activities:</h6>
                                              {subActivities.map(subActivity => {
                                                const cost = subActivity.budget_calculation_type === 'WITH_TOOL' 
                                                  ? Number(subActivity.estimated_cost_with_tool || 0)
                                                  : Number(subActivity.estimated_cost_without_tool || 0);
                                                
                                                return (
                                                  <div key={subActivity.id} className="bg-white p-2 rounded border border-gray-200">
                                                    <div className="flex justify-between items-center">
                                                      <div>
                                                        <span className="text-xs font-medium">{subActivity.name}</span>
                                                        <span className="ml-2 text-xs bg-blue-100 px-1 py-0.5 rounded text-blue-800">
                                                          {subActivity.activity_type}
                                                        </span>
                                                      </div>
                                                      <div className="text-xs text-green-600">
                                                        ${cost.toLocaleString()}
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Empty state for initiative */}
                              {allMeasures.length === 0 && allActivities.length === 0 && (
                                <div className="text-center p-4 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                                  <Info className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                                  <p className="text-sm text-gray-500">No measures or activities found for this initiative</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit Button - Only show if not preview mode and not view only */}
      {!isPreviewMode && !isViewOnly && (
        <div className="flex justify-end">
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader className="h-5 w-5 mr-2 animate-spin" />
                Submitting Plan...
              </>
            ) : (
              'Submit Plan for Review'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanReviewTable;