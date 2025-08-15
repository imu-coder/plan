import React, { useState, useEffect, useMemo } from 'react';
import { Download, FileSpreadsheet, File as FilePdf, Send, AlertCircle, CheckCircle, DollarSign, Building2, Target, Activity, BarChart3, Info, Loader, RefreshCw } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { organizations, auth, objectives, initiatives, performanceMeasures, mainActivities } from '../lib/api';
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
  refreshKey?: number;
  onDataRefresh?: (refreshedObjectives: any[]) => void;
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
  planData = null,
  refreshKey = 0,
  onDataRefresh
}) => {
  const { t } = useLanguage();
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [processedObjectives, setProcessedObjectives] = useState<StrategicObjective[]>(objectives || []);
  const [isLoading, setIsLoading] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [effectiveUserOrgId, setEffectiveUserOrgId] = useState<number | null>(userOrgId);
  const [dataVersion, setDataVersion] = useState(0);

  // Determine user organization ID with multiple fallbacks
  useEffect(() => {
    const determineUserOrgId = async () => {
      try {
        let orgId = userOrgId;
        
        // If no userOrgId provided, try to get from auth
        if (!orgId) {
          const authData = await auth.getCurrentUser();
          if (authData.userOrganizations && authData.userOrganizations.length > 0) {
            orgId = authData.userOrganizations[0].organization;
            console.log('PlanReviewTable: Got user org from auth:', orgId);
          }
        }
        
        // If still no orgId, try from planData
        if (!orgId && planData?.organization) {
          orgId = Number(planData.organization);
          console.log('PlanReviewTable: Got user org from planData:', orgId);
        }
        
        // If still no orgId, try from objectives data
        if (!orgId && objectives && objectives.length > 0) {
          const firstObjective = objectives[0];
          if (firstObjective?.initiatives && firstObjective.initiatives.length > 0) {
            const firstInitiative = firstObjective.initiatives[0];
            if (firstInitiative?.organization) {
              orgId = Number(firstInitiative.organization);
              console.log('PlanReviewTable: Got user org from objectives data:', orgId);
            }
          }
        }
        
        setEffectiveUserOrgId(orgId);
        console.log('PlanReviewTable: Effective user org ID set to:', orgId);
      } catch (error) {
        console.error('PlanReviewTable: Failed to determine user org ID:', error);
        setProcessingError('Failed to determine user organization');
      }
    };
    
    determineUserOrgId();
  }, [userOrgId, planData, objectives]);

  // PERFORMANCE OPTIMIZED: Enhanced data processing with caching
  const processObjectiveData = async (objectivesList: StrategicObjective[], useCache = false) => {
    if (!effectiveUserOrgId || !objectivesList || objectivesList.length === 0) {
      console.log('PlanReviewTable: Missing required data for processing');
      return objectivesList || [];
    }

    try {
      // PERFORMANCE: Check if we already have fresh data and can skip processing
      if (useCache && processedObjectives.length > 0 && refreshKey <= 1) {
        console.log('PlanReviewTable: Using cached processed data');
        return processedObjectives;
      }

      console.log('PlanReviewTable: Starting fresh data processing for user org:', effectiveUserOrgId);
      console.log('PlanReviewTable: Processing objectives:', objectivesList.length);
      
      setProcessingError(null);
      setIsLoading(true);

      // PERFORMANCE: Batch API calls for better performance
      const batchSize = 3;
      const enrichedObjectives = await Promise.all(
        objectivesList.map(async (objective, index) => {
          // PERFORMANCE: Add small delay between batches to prevent server overload
          if (index > 0 && index % batchSize === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          try {
            console.log(`PlanReviewTable: Processing objective ${objective.id}: ${objective.title}`);
            
            // PERFORMANCE: Only fetch if we don't have recent data
            const initiativesResponse = await initiatives.getByObjective(objective.id.toString());
            const objectiveInitiatives = initiativesResponse?.data || [];
            
            console.log(`PlanReviewTable: Found ${objectiveInitiatives.length} initiatives for objective ${objective.id}`);

            // PRODUCTION-SAFE: Filter initiatives for user's organization
            const filteredInitiatives = objectiveInitiatives.filter(initiative => {
              const isDefault = initiative.is_default === true;
              const hasNoOrg = !initiative.organization || initiative.organization === null;
              const belongsToUserOrg = initiative.organization && 
                                      (Number(initiative.organization) === Number(effectiveUserOrgId) ||
                                       String(initiative.organization) === String(effectiveUserOrgId));
              
              const shouldInclude = isDefault || hasNoOrg || belongsToUserOrg;
              console.log(`PlanReviewTable: Initiative "${initiative.name}" - include: ${shouldInclude}`);
              return shouldInclude;
            });

            console.log(`PlanReviewTable: Filtered to ${filteredInitiatives.length} initiatives for user org`);

            // PRODUCTION-SAFE: For each initiative, get fresh performance measures and main activities
            const enrichedInitiatives = await Promise.all(
              filteredInitiatives.map(async (initiative, initIndex) => {
                // PERFORMANCE: Small delay between initiative processing
                if (initIndex > 0 && initIndex % 2 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 50));
                }

                try {
                  console.log(`PlanReviewTable: Processing initiative ${initiative.id}: ${initiative.name}`);
                  
                  // PERFORMANCE: Parallel API calls for measures and activities
                  const [measuresResponse, activitiesResponse] = await Promise.allSettled([
                    performanceMeasures.getByInitiative(initiative.id),
                    mainActivities.getByInitiative(initiative.id)
                  ]);

                  // PERFORMANCE: Handle settled promises safely
                  const allMeasures = measuresResponse.status === 'fulfilled' ? (measuresResponse.value?.data || []) : [];
                  const allActivities = activitiesResponse.status === 'fulfilled' ? (activitiesResponse.value?.data || []) : [];
                  
                  if (measuresResponse.status === 'rejected') {
                    console.warn(`Failed to fetch measures for initiative ${initiative.id}:`, measuresResponse.reason);
                  }
                  if (activitiesResponse.status === 'rejected') {
                    console.warn(`Failed to fetch activities for initiative ${initiative.id}:`, activitiesResponse.reason);
                  }

                  // PRODUCTION-SAFE: Filter measures by organization
                  const filteredMeasures = allMeasures.filter(measure => {
                    const hasNoOrg = !measure.organization || measure.organization === null;
                    const belongsToUserOrg = measure.organization && 
                                            (Number(measure.organization) === Number(effectiveUserOrgId) ||
                                             String(measure.organization) === String(effectiveUserOrgId));
                    
                    const shouldInclude = hasNoOrg || belongsToUserOrg;
                    console.log(`PlanReviewTable: Measure "${measure.name}" - include: ${shouldInclude}`);
                    return shouldInclude;
                  });

                  // PRODUCTION-SAFE: Filter activities by organization
                  const filteredActivities = allActivities.filter(activity => {
                    const hasNoOrg = !activity.organization || activity.organization === null;
                    const belongsToUserOrg = activity.organization && 
                                            (Number(activity.organization) === Number(effectiveUserOrgId) ||
                                             String(activity.organization) === String(effectiveUserOrgId));
                    
                    const shouldInclude = hasNoOrg || belongsToUserOrg;
                    console.log(`PlanReviewTable: Activity "${activity.name}" - include: ${shouldInclude}`);
                    return shouldInclude;
                  });

                  console.log(`PlanReviewTable: Initiative "${initiative.name}" - measures: ${allMeasures.length} → ${filteredMeasures.length}, activities: ${allActivities.length} → ${filteredActivities.length}`);

                  return {
                    ...initiative,
                    performance_measures: filteredMeasures,
                    main_activities: filteredActivities
                  };
                } catch (error) {
                  console.error(`PlanReviewTable: Error processing initiative ${initiative.id}:`, error);
                  return {
                    ...initiative,
                    performance_measures: initiative.performance_measures || [],
                    main_activities: initiative.main_activities || []
                  };
                }
              })
            );

            return {
              ...objective,
              initiatives: enrichedInitiatives
            };
          } catch (error) {
            console.error(`PlanReviewTable: Error processing objective ${objective.id}:`, error);
            return objective; // Return original if processing fails
          }
        })
      );
      
      console.log('PlanReviewTable: Successfully processed all objectives');
      return enrichedObjectives;
      
    } catch (error) {
      console.error('PlanReviewTable: Error in processObjectiveData:', error);
      setProcessingError(`Failed to process objectives data: ${error.message || 'Unknown error'}`);
      return objectivesList || []; // Return original data as fallback
    } finally {
      setIsLoading(false);
    }
  };

  // PERFORMANCE: Smart data processing - only when needed
  useEffect(() => {
    const loadAndProcessData = async () => {
      // PERFORMANCE: Skip if we already have current data
      if (refreshKey <= 1 && processedObjectives.length > 0 && processedObjectives.length === objectives.length) {
        console.log('PlanReviewTable: Data appears current, skipping refresh');
        return;
      }

      if (objectives && objectives.length > 0 && effectiveUserOrgId) {
        try {
          console.log(`PlanReviewTable: Fresh data needed (refreshKey: ${refreshKey})`);
          const processedData = await processObjectiveData(objectives);
          setProcessedObjectives(processedData);
          setDataVersion(prev => prev + 1);
          
          // PRODUCTION: Notify parent of fresh data if callback provided
          if (onDataRefresh && typeof onDataRefresh === 'function') {
            try {
              onDataRefresh(processedData);
            } catch (callbackError) {
              console.error('PlanReviewTable: Error in onDataRefresh callback:', callbackError);
            }
          }
        } catch (error) {
          console.error('PlanReviewTable: Error loading and processing data:', error);
          setProcessingError(`Failed to load fresh data: ${error.message || 'Unknown error'}`);
        }
      } else {
        // PERFORMANCE: If no objectives or user org, set empty state quickly
        if (!objectives || objectives.length === 0) {
          setProcessedObjectives([]);
        }
        if (!effectiveUserOrgId) {
          console.log('PlanReviewTable: No user organization ID available');
        }
      }
    };

    // PERFORMANCE: Debounce rapid successive calls
    const timeoutId = setTimeout(() => {
      loadAndProcessData();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [objectives, refreshKey, effectiveUserOrgId, onDataRefresh]);

  // Manual refresh function
  const handleManualRefresh = async () => {
    console.log('PlanReviewTable: Manual refresh triggered');
    setIsLoading(true);
    setProcessingError(null);
    
    try {
      // PERFORMANCE: Force fresh data (no cache)
      const freshData = await processObjectiveData(objectives, false);
      setProcessedObjectives(freshData);
      setDataVersion(prev => prev + 1);
      
      if (onDataRefresh && typeof onDataRefresh === 'function') {
        try {
          onDataRefresh(freshData);
        } catch (callbackError) {
          console.error('PlanReviewTable: Error in onDataRefresh callback:', callbackError);
        }
      }
    } catch (error) {
      console.error('PlanReviewTable: Manual refresh failed:', error);
      setProcessingError(`Manual refresh failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

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
        console.log('PlanReviewTable: Fetching organizations for name mapping...');
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        
        if (response?.data && Array.isArray(response.data)) {
          response.data.forEach((org: any) => {
            if (org?.id && org?.name) {
              orgMap[String(org.id)] = org.name;
            }
          });
          console.log('PlanReviewTable: Created organizations map with', Object.keys(orgMap).length, 'entries');
        } else {
          console.warn('PlanReviewTable: Invalid organizations response:', response);
        }
        
        setOrganizationsMap(orgMap);
      } catch (error) {
        console.error('PlanReviewTable: Failed to fetch organizations:', error);
        // Continue with empty map - don't block the component
        setOrganizationsMap({});
      }
    };
    
    fetchOrganizations();
  }, []);

  // PRODUCTION-SAFE: Calculate totals with comprehensive error handling
  const calculateTotals = () => {
    try {
      console.log('PlanReviewTable: Calculating budget totals from processed objectives');
      
      if (!processedObjectives?.length) {
        console.log('PlanReviewTable: No processed objectives available for calculation');
        return { total: 0, governmentTotal: 0, partnersTotal: 0, sdgTotal: 0, otherTotal: 0 };
      }

      let total = 0;
      let governmentTotal = 0;
      let partnersTotal = 0;
      let sdgTotal = 0;
      let otherTotal = 0;

      processedObjectives.forEach((objective, objIndex) => {
        if (!objective?.initiatives) {
          console.log(`PlanReviewTable: Objective ${objIndex} has no initiatives`);
          return;
        }
        
        objective.initiatives.forEach((initiative, initIndex) => {
          if (!initiative?.main_activities) {
            console.log(`PlanReviewTable: Initiative ${initIndex} in objective ${objIndex} has no main activities`);
            return;
          }
          
          initiative.main_activities.forEach((activity, actIndex) => {
            if (!activity) {
              console.warn(`PlanReviewTable: Activity ${actIndex} is null`);
              return;
            }
            
            // PRODUCTION-SAFE: Calculate budget from sub-activities with fallback to legacy budget
            let activityBudgetRequired = 0;
            let activityGovernment = 0;
            let activityPartners = 0;
            let activitySdg = 0;
            let activityOther = 0;
            
            try {
              // Calculate from sub-activities if they exist
              if (activity.sub_activities && Array.isArray(activity.sub_activities) && activity.sub_activities.length > 0) {
                console.log(`PlanReviewTable: Activity "${activity.name}" has ${activity.sub_activities.length} sub-activities`);
                
                activity.sub_activities.forEach((subActivity: any, subIndex) => {
                  if (!subActivity) {
                    console.warn(`PlanReviewTable: Sub-activity ${subIndex} is null`);
                    return;
                  }
                  
                  const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                    ? Number(subActivity.estimated_cost_with_tool || 0)
                    : Number(subActivity.estimated_cost_without_tool || 0);
                  
                  const subGov = Number(subActivity.government_treasury || 0);
                  const subPartners = Number(subActivity.partners_funding || 0);
                  const subSdg = Number(subActivity.sdg_funding || 0);
                  const subOther = Number(subActivity.other_funding || 0);
                  
                  activityBudgetRequired += subCost;
                  activityGovernment += subGov;
                  activityPartners += subPartners;
                  activitySdg += subSdg;
                  activityOther += subOther;
                  
                  console.log(`PlanReviewTable: Sub-activity "${subActivity.name}" budget: $${subCost.toLocaleString()}`);
                });
              } else if (activity.budget) {
                // Fallback to legacy budget if no sub-activities
                console.log(`PlanReviewTable: Activity "${activity.name}" using legacy budget`);
                
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
              
              console.log(`PlanReviewTable: Activity "${activity.name}" total budget: $${activityBudgetRequired.toLocaleString()}`);
              
            } catch (activityError) {
              console.error(`PlanReviewTable: Error processing activity ${actIndex}:`, activityError);
              // Continue with other activities
            }
          });
        });
      });
      
      console.log('PlanReviewTable: Final budget totals:', {
        total: total.toLocaleString(),
        government: governmentTotal.toLocaleString(),
        partners: partnersTotal.toLocaleString(),
        sdg: sdgTotal.toLocaleString(),
        other: otherTotal.toLocaleString()
      });
      
      return { total, governmentTotal, partnersTotal, sdgTotal, otherTotal };
      
    } catch (error) {
      console.error('PlanReviewTable: Error calculating budget totals:', error);
      return { total: 0, governmentTotal: 0, partnersTotal: 0, sdgTotal: 0, otherTotal: 0 };
    }
  };

  const formatCurrency = (amount: number): string => {
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch (error) {
      console.error('PlanReviewTable: Date formatting error:', error);
      return 'Invalid Date';
    }
  };

  // PERFORMANCE: Memoized calculations to prevent re-processing
  const { totalBudget, totalFunding, fundingGap } = React.useMemo(() => {
    if (!processedObjectives || processedObjectives.length === 0) {
      return { totalBudget: 0, totalFunding: 0, fundingGap: 0 };
    }

    let budget = 0;
    let funding = 0;

    try {
      processedObjectives.forEach(objective => {
        objective.initiatives?.forEach(initiative => {
          initiative.main_activities?.forEach(activity => {
            if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
              activity.sub_activities.forEach(subActivity => {
                const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                budget += cost;
                funding += Number(subActivity.government_treasury || 0) +
                          Number(subActivity.sdg_funding || 0) +
                          Number(subActivity.partners_funding || 0) +
                          Number(subActivity.other_funding || 0);
              });
            }
          });
        });
      });
    } catch (error) {
      console.error('Error calculating budget totals:', error);
    }

    return {
      totalBudget: budget,
      totalFunding: funding,
      fundingGap: Math.max(0, budget - funding)
    };
  }, [processedObjectives, dataVersion]);

  // PRODUCTION-SAFE: Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Processing Plan Data</h3>
          <p className="text-gray-500">Please wait while we prepare your strategic plan...</p>
        </div>
      </div>
    );
  }

  // PRODUCTION-SAFE: Error state
  if (processingError) {
    return (
      <div className="p-6 text-center">
        <div className="rounded-full bg-red-100 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-red-800 mb-2">Error Processing Plan Data</h3>
        <p className="text-red-600 mb-4">{processingError}</p>
        <div className="flex justify-center space-x-3">
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader className="h-4 w-4 animate-spin mr-2" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // PRODUCTION-SAFE: No organization context
  if (!effectiveUserOrgId) {
    return (
      <div className="p-6 text-center">
        <div className="rounded-full bg-yellow-100 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-yellow-500" />
        </div>
        <h3 className="text-lg font-medium text-yellow-800 mb-2">Organization Context Required</h3>
        <p className="text-yellow-600 mb-4">Unable to determine your organization context. Please ensure you're properly logged in.</p>
        <button
          onClick={handleManualRefresh}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  // PRODUCTION-SAFE: No objectives available
  if (!processedObjectives || processedObjectives.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="rounded-full bg-gray-100 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Target className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Plan Data Available</h3>
        <p className="text-gray-500 mb-4">
          {objectives?.length === 0 
            ? "No strategic objectives were found for this plan."
            : `Found ${objectives?.length || 0} objectives but none contain data for your organization (ID: ${effectiveUserOrgId}).`
          }
        </p>
        <button
          onClick={handleManualRefresh}
          disabled={isLoading}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader className="h-4 w-4 animate-spin mr-2" />
              Checking...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Check for Data
            </>
          )}
        </button>
      </div>
    );
  }

  const handleSubmitPlan = async () => {
    console.log('PlanReviewTable: Submitting plan...');
    setIsSubmittingPlan(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      await onSubmit();
      console.log('PlanReviewTable: Plan submitted successfully');
      setSubmitSuccess('Plan submitted successfully!');
    } catch (error: any) {
      console.error('PlanReviewTable: Plan submission failed:', error);
      setSubmitError(error.message || 'Failed to submit plan');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  // PRODUCTION-SAFE: Convert objectives to table rows format with comprehensive error handling
  const convertObjectivesToTableRows = (objectives: StrategicObjective[]) => {
    if (!objectives || !Array.isArray(objectives)) {
      console.error('PlanReviewTable: Invalid objectives data for table rows conversion');
      return [];
    }
    
    const tableRows: any[] = [];
    console.log(`PlanReviewTable: Converting ${objectives.length} objectives to table rows`);

    objectives.forEach((objective, objIndex) => {
      if (!objective) {
        console.warn(`PlanReviewTable: Skipping null objective at index ${objIndex}`);
        return;
      }
      
      // PRODUCTION-SAFE: Get effective weight with multiple fallbacks
      const effectiveWeight = objective.effective_weight || 
                             objective.planner_weight || 
                             objective.weight || 
                             0;
      
      console.log(`PlanReviewTable: Converting objective "${objective.title}" with effective weight ${effectiveWeight}%`);
      
      if (!objective.initiatives || objective.initiatives.length === 0) {
        console.log(`PlanReviewTable: Objective "${objective.title}" has no initiatives`);
        tableRows.push({
          'No': objIndex + 1,
          'Strategic Objective': objective.title || 'Untitled Objective',
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
          'Implementor': organizationName || 'Ministry of Health',
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
      
      objective.initiatives.forEach((initiative, initIndex) => {
        if (!initiative) {
          console.warn(`PlanReviewTable: Skipping null initiative at index ${initIndex}`);
          return;
        }
        
        console.log(`PlanReviewTable: Converting initiative "${initiative.name}" with ${initiative.performance_measures?.length || 0} measures and ${initiative.main_activities?.length || 0} activities`);
        
        const allItems = [
          ...(initiative.performance_measures || []).map(item => ({ ...item, type: 'Performance Measure' })),
          ...(initiative.main_activities || []).map(item => ({ ...item, type: 'Main Activity' }))
        ].filter(item => item != null); // Filter out any null items

        if (allItems.length === 0) {
          console.log(`PlanReviewTable: Initiative "${initiative.name}" has no performance measures or main activities`);
          tableRows.push({
            'No': objectiveAdded ? '' : (objIndex + 1),
            'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
            'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
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
            'Implementor': initiative.organization_name || 
                          organizationsMap[String(initiative.organization)] || 
                          organizationName || 
                          'Ministry of Health',
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

        allItems.forEach((item, itemIndex) => {
          if (!item) {
            console.warn(`PlanReviewTable: Skipping null item at index ${itemIndex}`);
            return;
          }
          
          console.log(`PlanReviewTable: Converting ${item.type}: "${item.name}"`);
          
          // PRODUCTION-SAFE: Calculate budget values for main activities
          let budgetRequired = 0;
          let government = 0;
          let partners = 0;
          let sdg = 0;
          let other = 0;
          let totalAvailable = 0;
          let gap = 0;

          try {
            if (item.type === 'Main Activity') {
              // PRODUCTION-SAFE: Calculate budget from sub-activities with fallback
              if (item.sub_activities && Array.isArray(item.sub_activities) && item.sub_activities.length > 0) {
                console.log(`PlanReviewTable: Main Activity "${item.name}" has ${item.sub_activities.length} sub-activities`);
                
                item.sub_activities.forEach((subActivity: any, subIndex: number) => {
                  if (!subActivity) {
                    console.warn(`PlanReviewTable: Sub-activity ${subIndex} is null in activity "${item.name}"`);
                    return;
                  }
                  
                  try {
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
                    
                    console.log(`PlanReviewTable: Sub-activity "${subActivity.name}" - Budget: $${subBudgetRequired.toLocaleString()}, Gov: $${subGov.toLocaleString()}`);
                  } catch (subError) {
                    console.error(`PlanReviewTable: Error processing sub-activity ${subIndex}:`, subError);
                  }
                });
                
                totalAvailable = government + partners + sdg + other;
                gap = Math.max(0, budgetRequired - totalAvailable);
              } else if (item.budget) {
                // Fallback to legacy budget if no sub-activities
                console.log(`PlanReviewTable: Main Activity "${item.name}" using legacy budget`);
                
                try {
                  budgetRequired = item.budget.budget_calculation_type === 'WITH_TOOL' 
                    ? Number(item.budget.estimated_cost_with_tool || 0)
                    : Number(item.budget.estimated_cost_without_tool || 0);
                  
                  government = Number(item.budget.government_treasury || 0);
                  partners = Number(item.budget.partners_funding || 0);
                  sdg = Number(item.budget.sdg_funding || 0);
                  other = Number(item.budget.other_funding || 0);
                  totalAvailable = government + partners + sdg + other;
                  gap = Math.max(0, budgetRequired - totalAvailable);
                } catch (budgetError) {
                  console.error(`PlanReviewTable: Error processing legacy budget for "${item.name}":`, budgetError);
                }
              } else {
                console.log(`PlanReviewTable: Main Activity "${item.name}" has no budget data`);
              }
            }
          } catch (itemError) {
            console.error(`PlanReviewTable: Error processing item "${item.name}":`, itemError);
          }

          // PRODUCTION-SAFE: Calculate 6-month target with validation
          const sixMonthTarget = item.target_type === 'cumulative' 
            ? Number(item.q1_target || 0) + Number(item.q2_target || 0)
            : Number(item.q2_target || 0);

          // PRODUCTION-SAFE: Get selected months for each quarter
          const q1Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q1');
          const q2Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q2');
          const q3Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q3');
          const q4Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q4');

          // PRODUCTION-SAFE: Add PM/MA prefix to name with fallback
          const displayName = item.type === 'Performance Measure' 
            ? `PM: ${item.name || 'Unnamed Measure'}` 
            : `MA: ${item.name || 'Unnamed Activity'}`;

          tableRows.push({
            'No': objectiveAdded ? '' : (objIndex + 1).toString(),
            'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
            'Strategic Objective Weight': objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
            'Strategic Initiative': initiativeAdded ? '' : (initiative.name || 'Untitled Initiative'),
            'Initiative Weight': initiativeAdded ? '' : `${initiative.weight || 0}%`,
            'Performance Measure/Main Activity': displayName,
            'Weight': `${item.weight || 0}%`,
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
            'Implementor': initiative.organization_name || 
                          organizationsMap[String(initiative.organization)] || 
                          organizationName || 
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
          initiativeAdded = true;
        });
      });
    });

    console.log(`PlanReviewTable: Converted to ${tableRows.length} table rows`);
    return tableRows;
  };

  const handleExportExcel = () => {
    if (!processedObjectives || processedObjectives.length === 0) {
      console.error('PlanReviewTable: No objectives data available for export');
      return;
    }
    
    console.log('PlanReviewTable: Exporting to Excel...');
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
      console.error('PlanReviewTable: No objectives data available for export');
      return;
    }
    
    console.log('PlanReviewTable: Exporting to PDF...');
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

  // PRODUCTION-SAFE: Calculate totals with the new method
  const budgetTotals = calculateTotals();

  // Convert processed objectives to table rows
  const tableRows: any[] = [];

  processedObjectives.forEach((objective, objIndex) => {
    if (!objective) {
      console.warn(`PlanReviewTable: Skipping null objective at index ${objIndex}`);
      return;
    }
    
    // PRODUCTION-SAFE: Get effective weight with multiple fallbacks
    const effectiveWeight = objective.effective_weight || 
                           objective.planner_weight || 
                           objective.weight || 
                           0;
    
    console.log(`PlanReviewTable: Processing table row for objective "${objective.title}" with effective weight ${effectiveWeight}%`);
    
    if (!objective.initiatives || objective.initiatives.length === 0) {
      console.log(`PlanReviewTable: Objective "${objective.title}" has no initiatives for table`);
      tableRows.push({
        no: objIndex + 1,
        objective: objective.title || 'Untitled Objective',
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
        implementor: organizationName || 'Ministry of Health',
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
    
    objective.initiatives.forEach((initiative, initIndex) => {
      if (!initiative) {
        console.warn(`PlanReviewTable: Skipping null initiative ${initIndex} in objective "${objective.title}"`);
        return;
      }
      
      console.log(`PlanReviewTable: Processing initiative "${initiative.name}" for table`);
      
      const allItems = [
        ...(initiative.performance_measures || []).map(item => ({ ...item, type: 'Performance Measure' })),
        ...(initiative.main_activities || []).map(item => ({ ...item, type: 'Main Activity' }))
      ].filter(item => item != null); // Filter out null items

      if (allItems.length === 0) {
        console.log(`PlanReviewTable: Initiative "${initiative.name}" has no items for table`);
        tableRows.push({
          no: objectiveAdded ? '' : (objIndex + 1),
          objective: objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
          objectiveWeight: objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
          initiative: initiative.name || 'Untitled Initiative',
          initiativeWeight: `${initiative.weight || 0}%`,
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
          implementor: initiative.organization_name || 
                      organizationsMap[String(initiative.organization)] || 
                      organizationName || 
                      'Ministry of Health',
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

      allItems.forEach((item, itemIndex) => {
        if (!item) {
          console.warn(`PlanReviewTable: Skipping null item ${itemIndex} in initiative "${initiative.name}"`);
          return;
        }
        
        console.log(`PlanReviewTable: Processing ${item.type}: "${item.name}" for table`);
        
        // PRODUCTION-SAFE: Calculate budget values for main activities
        let budgetRequired = 0;
        let government = 0;
        let partners = 0;
        let sdg = 0;
        let other = 0;
        let totalAvailable = 0;
        let gap = 0;

        try {
          if (item.type === 'Main Activity') {
            // PRODUCTION-SAFE: Calculate budget from sub-activities with comprehensive error handling
            if (item.sub_activities && Array.isArray(item.sub_activities) && item.sub_activities.length > 0) {
              console.log(`PlanReviewTable: Activity "${item.name}" has ${item.sub_activities.length} sub-activities`);
              
              item.sub_activities.forEach((subActivity: any, subIndex: number) => {
                if (!subActivity) {
                  console.warn(`PlanReviewTable: Sub-activity ${subIndex} is null`);
                  return;
                }
                
                try {
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
                  
                  console.log(`PlanReviewTable: Sub-activity "${subActivity.name}" contributes $${subBudgetRequired.toLocaleString()} to budget`);
                } catch (subError) {
                  console.error(`PlanReviewTable: Error processing sub-activity ${subIndex}:`, subError);
                }
              });
              
              totalAvailable = government + partners + sdg + other;
              gap = Math.max(0, budgetRequired - totalAvailable);
            } else if (item.budget) {
              // Fallback to legacy budget if no sub-activities
              console.log(`PlanReviewTable: Activity "${item.name}" using legacy budget`);
              
              try {
                budgetRequired = item.budget.budget_calculation_type === 'WITH_TOOL' 
                  ? Number(item.budget.estimated_cost_with_tool || 0)
                  : Number(item.budget.estimated_cost_without_tool || 0);
                
                government = Number(item.budget.government_treasury || 0);
                partners = Number(item.budget.partners_funding || 0);
                sdg = Number(item.budget.sdg_funding || 0);
                other = Number(item.budget.other_funding || 0);
                totalAvailable = government + partners + sdg + other;
                gap = Math.max(0, budgetRequired - totalAvailable);
              } catch (budgetError) {
                console.error(`PlanReviewTable: Error processing legacy budget:`, budgetError);
              }
            } else {
              console.log(`PlanReviewTable: Activity "${item.name}" has no budget data`);
            }
          }
        } catch (itemError) {
          console.error(`PlanReviewTable: Error processing item "${item.name}":`, itemError);
        }

        // PRODUCTION-SAFE: Calculate 6-month target with validation
        const sixMonthTarget = item.target_type === 'cumulative' 
          ? Number(item.q1_target || 0) + Number(item.q2_target || 0)
          : Number(item.q2_target || 0);

        // PRODUCTION-SAFE: Get selected months for each quarter
        const q1Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q1');
        const q2Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q2');
        const q3Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q3');
        const q4Months = getMonthsForQuarter(item.selected_months || [], item.selected_quarters || [], 'Q4');

        // PRODUCTION-SAFE: Add prefix based on item type with fallback
        const displayName = item.type === 'Performance Measure' 
          ? `PM: ${item.name || 'Unnamed Measure'}` 
          : `MA: ${item.name || 'Unnamed Activity'}`;

        tableRows.push({
          no: objectiveAdded ? '' : (objIndex + 1).toString(),
          objective: objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
          objectiveWeight: objectiveAdded ? '' : `${effectiveWeight.toFixed(1)}%`,
          initiative: initiativeAdded ? '' : (initiative.name || 'Untitled Initiative'),
          initiativeWeight: initiativeAdded ? '' : `${initiative.weight || 0}%`,
          itemName: displayName,
          itemType: item.type,
          itemWeight: `${item.weight || 0}%`,
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
          implementor: initiative.organization_name || 
                      organizationsMap[String(initiative.organization)] || 
                      item.organization_name ||
                      organizationName || 
                      'Ministry of Health',
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

  console.log(`PlanReviewTable: Generated ${tableRows.length} table rows for display`);

  return (
    <div className="space-y-6">
      {/* Plan Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <Building2 className="h-6 w-6 mr-2 text-green-600" />
          Strategic Plan
          {effectiveUserOrgId && (
            <span className="ml-2 text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
              Org ID: {effectiveUserOrgId}
            </span>
          )}
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
        
        {/* PRODUCTION DEBUG INFO */}
        <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-600">
          <p>Debug Info: User Org: {effectiveUserOrgId}, Objectives: {objectives?.length || 0} → {processedObjectives?.length || 0}, Rows: {tableRows.length}</p>
        </div>
      </div>

      {/* Export Actions */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Complete Plan Details</h3>
        <div className="flex space-x-2">
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            )}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!processedObjectives?.length}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={!processedObjectives?.length}
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
      {tableRows.length === 0 ? (
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <Info className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">No Data to Display</h3>
          <p className="text-yellow-600">
            {objectives?.length === 0 
              ? "No objectives were found for this plan."
              : `Found ${objectives?.length || 0} objectives but they don't contain data for your organization (ID: ${effectiveUserOrgId}).`
            }
          </p>
          <button
            onClick={handleManualRefresh}
            disabled={isLoading}
            className="mt-4 px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200 disabled:opacity-50"
          >
            {isLoading ? 'Processing...' : 'Refresh Data'}
          </button>
        </div>
      ) : (
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
      )}

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
          
          {/* PERFORMANCE: Quick summary stats */}
          <div className="mt-4 grid grid-cols-3 gap-4 text-center text-xs text-gray-500">
            <div>Total Budget: ${totalBudget.toLocaleString()}</div>
            <div>Total Funding: ${totalFunding.toLocaleString()}</div>
            <div>Funding Gap: ${fundingGap.toLocaleString()}</div>
          </div>

          {!isPreviewMode && !isViewOnly && (
            <div className="flex justify-end mt-6">
              <button
                onClick={handleSubmitPlan}
                disabled={isSubmitting || isSubmittingPlan || tableRows.length === 0}
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
                    Submit Plan for Review ({tableRows.length} items)
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submit Button - Only show if not preview mode and not view only */}
      {!isPreviewMode && !isViewOnly && (
        <div className="flex justify-end">
          <button
            onClick={handleSubmitPlan}
            disabled={isSubmitting || isSubmittingPlan || tableRows.length === 0}
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
                Submit Plan for Review ({tableRows.length} items)
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default PlanReviewTable;