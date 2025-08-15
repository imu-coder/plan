import React, { useState, useEffect, useMemo } from 'react';
import { Download, FileSpreadsheet, File as FilePdf, Send, AlertCircle, CheckCircle, DollarSign, Building2, Target, Activity, BarChart3, Info, Loader, RefreshCw } from 'lucide-react';
import { organizations, auth, objectives, initiatives, performanceMeasures, mainActivities } from '../lib/api';
import { auth, objectives, initiatives, performanceMeasures, mainActivities, subActivities } from '../lib/api';
import type { PlanType } from '../types/plan';
import { MONTHS } from '../types/plan';
import { format } from 'date-fns';
import { MONTHS } from '../types/plan';
interface PlanReviewTableProps {
  objectives: StrategicObjective[];
  onSubmit: (data: any) => Promise<void>;
  isSubmitting: boolean;
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
  isPreviewMode?: boolean;
  userOrgId: number | null;
  isViewOnly?: boolean;
  refreshKey?: number; // Add refresh trigger
  onDataRefresh?: (refreshedData: StrategicObjective[]) => void; // Callback for fresh data
  onDataRefresh?: (refreshedObjectives: any[]) => void;
}

const PlanReviewTable: React.FC<PlanReviewTableProps> = ({
  isSubmitting,
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
  isPreviewMode = false,
  userOrgId,
  isViewOnly = false,
  refreshKey = 0,
  onDataRefresh
  onDataRefresh
}) => {
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [isLoadingFreshData, setIsLoadingFreshData] = useState(false);
  const [dataProcessingError, setDataProcessingError] = useState<string | null>(null);
  const [lastRefreshKey, setLastRefreshKey] = useState(refreshKey);
  const [expandedObjectives, setExpandedObjectives] = useState<Record<string, boolean>>({});
  const [expandedInitiatives, setExpandedInitiatives] = useState<Record<string, boolean>>({});
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
  // PRODUCTION-SAFE: Fetch fresh data when refreshKey changes (when review modal opens)
          const firstObjective = objectives[0];
    const fetchFreshDataForReview = async () => {
      if (refreshKey === lastRefreshKey || refreshKey === 0) {
        return; // No refresh needed
      }
      
            const firstInitiative = firstObjective.initiatives[0];
        setIsLoadingFreshData(true);
        setDataProcessingError(null);
        setLastRefreshKey(refreshKey);
        
        console.log('PlanReviewTable: Fetching fresh data for review, refreshKey:', refreshKey);
        console.log('PlanReviewTable: User organization ID:', userOrgId);
        
        if (!userOrgId) {
          console.warn('PlanReviewTable: No user organization ID available');
          setProcessedObjectives(objectives);
          return;
        }
        
        // Fetch fresh complete data for all objectives
        const enrichedObjectives = await fetchCompleteObjectiveData(objectives, userOrgId);
        
        console.log('PlanReviewTable: Successfully fetched fresh data:', enrichedObjectives.length);
        setProcessedObjectives(enrichedObjectives);
        
        // Notify parent component of fresh data
        if (onDataRefresh) {
          onDataRefresh(enrichedObjectives);
        }
        
        
        console.error('PlanReviewTable: Error fetching fresh data:', error);
        setDataProcessingError('Failed to fetch latest data. Using available data.');
        // Fallback to provided objectives
        setProcessedObjectives(objectives);
      } catch (error) {
        setIsLoadingFreshData(false);
        setProcessingError('Failed to determine user organization');
      }
    };
    if (userOrgId) {
      fetchFreshDataForReview();
  }, [userOrgId, planData, objectives]);
  }, [refreshKey, userOrgId, lastRefreshKey, objectives, onDataRefresh]);
  // PERFORMANCE OPTIMIZED: Enhanced data processing with caching
  // PRODUCTION-SAFE: Comprehensive data fetching with organization filtering
  const fetchCompleteObjectiveData = async (objectivesList: StrategicObjective[], orgId: number) => {
    if (!orgId || !objectivesList.length) {
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

      console.log('PlanReviewTable: Fetching complete data for', objectivesList.length, 'objectives, orgId:', orgId);
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
              
            
            console.log(`PlanReviewTable: Objective "${objective.title}" - ${objectiveInitiatives.length} total initiatives`);

            // PRODUCTION-SAFE: Filter initiatives for user's organization only
            const filteredInitiatives = objectiveInitiatives.filter(initiative => {
              if (!initiative) return false;
              
              const isDefault = initiative.is_default === true;
              const hasNoOrg = !initiative.organization || initiative.organization === null || initiative.organization === '';
              const belongsToUserOrg = initiative.organization && 
                                      (Number(initiative.organization) === Number(orgId) ||
                                       String(initiative.organization) === String(orgId));
              
              const shouldInclude = isDefault || hasNoOrg || belongsToUserOrg;
              
              console.log(`PlanReviewTable: Initiative "${initiative.name}" - org:${initiative.organization}, userOrg:${orgId}, include:${shouldInclude}`);
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
                  console.log(`PlanReviewTable: Fetching data for initiative "${initiative.name}"`);
                  
                    console.log(`PlanReviewTable: Measure "${measure.name}" - include: ${shouldInclude}`);
                    return shouldInclude;
                  });

                  // PRODUCTION-SAFE: Filter measures by organization
                  const filteredMeasures = allMeasures.filter(measure => {
                    if (!measure) return false;
                    const hasNoOrg = !measure.organization || measure.organization === null;
                    const belongsToUserOrg = measure.organization && 
                                            (Number(measure.organization) === Number(orgId) ||
                                             String(measure.organization) === String(orgId));
                    return hasNoOrg || belongsToUserOrg;
                  });
                  
                  console.log(`PlanReviewTable: Initiative "${initiative.name}" - ${allMeasures.length} total measures, ${filteredMeasures.length} filtered`);

                  // Fetch main activities with sub-activities
                  const activitiesResponse = await mainActivities.getByInitiative(initiative.id);
                  const allActivities = activitiesResponse?.data || [];
                  
                  console.log(`PlanReviewTable: Initiative "${initiative.name}" - ${allActivities.length} total activities`);
                  
                  // PRODUCTION-SAFE: Filter activities by organization and fetch sub-activities
                  const filteredActivities = await Promise.all(
                    allActivities
                      .filter(activity => {
                        if (!activity) return false;
                        const hasNoOrg = !activity.organization || activity.organization === null;
                        const belongsToUserOrg = activity.organization && 
                                                (Number(activity.organization) === Number(orgId) ||
                                                 String(activity.organization) === String(orgId));
                        const shouldInclude = hasNoOrg || belongsToUserOrg;
                        
                        console.log(`PlanReviewTable: Activity "${activity.name}" - org:${activity.organization}, include:${shouldInclude}`);
                        return shouldInclude;
                      })
                      .map(async (activity) => {
                        try {
                          // Fetch fresh sub-activities for budget calculation
                          const subActivitiesResponse = await subActivities.getByMainActivity(activity.id);
                          const activitySubActivities = subActivitiesResponse?.data || [];
                          
                          console.log(`PlanReviewTable: Activity "${activity.name}" - ${activitySubActivities.length} sub-activities`);
                          
                          return {
                            ...activity,
                            sub_activities: activitySubActivities
                          };
                        } catch (error) {
                          console.error(`PlanReviewTable: Error fetching sub-activities for activity ${activity.id}:`, error);
                          return {
                            ...activity,
                            sub_activities: []
                          };
                        }
                      })
                    const belongsToUserOrg = activity.organization && 
                    console.log(`PlanReviewTable: Activity "${activity.name}" - include: ${shouldInclude}`);
                  console.log(`PlanReviewTable: Initiative "${initiative.name}" - ${filteredActivities.length} filtered activities with sub-activities`);

                  return {
                    ...initiative,
                    performance_measures: filteredMeasures,
                    main_activities: filteredActivities
                  };
                } catch (error) {
                  console.error(`PlanReviewTable: Error fetching data for initiative ${initiative.id}:`, error);
                  return {
                    ...initiative,
                    performance_measures: initiative.performance_measures || [],
                    main_activities: initiative.main_activities || []
                  };
                }
              })
            );

            console.log(`PlanReviewTable: Objective "${objective.title}" - effective weight: ${effectiveWeight}, initiatives: ${enrichedInitiatives.length}`);

            // PRODUCTION-SAFE: Set effective weight correctly
            const effectiveWeight = objective.effective_weight !== undefined ? objective.effective_weight :
              objective.planner_weight !== undefined && objective.planner_weight !== null
              initiatives: enrichedInitiatives
            };
          } catch (error) {
            console.error(`PlanReviewTable: Error processing objective ${objective.id}:`, error);
            return objective; // Return original if processing fails
          }
        })
      );
      
      console.log('PlanReviewTable: Successfully enriched objectives with complete data:', enrichedObjectives.length);
      return enrichedObjectives;
      
      console.error('PlanReviewTable: Error in fetchCompleteObjectiveData:', error);
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
  // PRODUCTION-SAFE: Initialize with provided objectives if no refresh needed

    if (refreshKey === 0 || !userOrgId) {
      // Use provided objectives if no refresh requested or no userOrgId
      console.log('PlanReviewTable: Using provided objectives, no refresh needed');
      setProcessedObjectives(objectives);
      return;
    }
  }, [objectives, userOrgId, refreshKey]);
    const fetchOrganizations = async () => {
        console.log('PlanReviewTable: Fetching organizations for name mapping...');
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        
        if (response?.data && Array.isArray(response.data)) {
  // PRODUCTION-SAFE: Manual refresh function
  const handleManualRefresh = async () => {
    if (!userOrgId) return;
    
    try {
      setIsLoadingFreshData(true);
      setDataProcessingError(null);
      
      console.log('PlanReviewTable: Manual refresh triggered');
      const enrichedObjectives = await fetchCompleteObjectiveData(objectives, userOrgId);
      setProcessedObjectives(enrichedObjectives);
      
      if (onDataRefresh) {
        onDataRefresh(enrichedObjectives);
      }
    } catch (error) {
      console.error('PlanReviewTable: Manual refresh error:', error);
      setDataProcessingError('Failed to refresh data');
    } finally {
      setIsLoadingFreshData(false);
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
              
  // PRODUCTION-SAFE: Calculate budget from sub-activities
  const calculateActivityBudget = (activity: any) => {
    let budgetRequired = 0;
    let government = 0;
    let partners = 0;
    let sdg = 0;
    let other = 0;
        });
      });
      // Calculate from sub-activities (new structure)
      if (activity.sub_activities && Array.isArray(activity.sub_activities) && activity.sub_activities.length > 0) {
        activity.sub_activities.forEach(subActivity => {
          try {
            const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
              ? Number(subActivity.estimated_cost_with_tool || 0)
              : Number(subActivity.estimated_cost_without_tool || 0);

            budgetRequired += cost;
            government += Number(subActivity.government_treasury || 0);
            partners += Number(subActivity.partners_funding || 0);
            sdg += Number(subActivity.sdg_funding || 0);
            other += Number(subActivity.other_funding || 0);
          } catch (subError) {
            console.error('PlanReviewTable: Error processing sub-activity budget:', subError);
          }
        });
      } 
      // Fallback to legacy budget structure
      else if (activity.budget) {
        try {
          budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL' 
            ? Number(activity.budget.estimated_cost_with_tool || 0)
            : Number(activity.budget.estimated_cost_without_tool || 0);
          
          government = Number(activity.budget.government_treasury || 0);
          partners = Number(activity.budget.partners_funding || 0);
          sdg = Number(activity.budget.sdg_funding || 0);
          other = Number(activity.budget.other_funding || 0);
        } catch (budgetError) {
          console.error('PlanReviewTable: Error processing legacy budget:', budgetError);
        }
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
          
      console.error('PlanReviewTable: Error in calculateActivityBudget:', error);
    });
    
    const totalAvailable = government + partners + sdg + other;
    const gap = Math.max(0, budgetRequired - totalAvailable);
    
    return { budgetRequired, government, partners, sdg, other, totalAvailable, gap };

    if (!processedObjectives || processedObjectives.length === 0) {
      console.error('PlanReviewTable: No objectives data available for export');
      return;
    }
    
    console.log('PlanReviewTable: Exporting to Excel...');
    // Convert processed objectives to table rows format first

  // PRODUCTION-SAFE: Get months for quarter display
  const getMonthsForQuarter = (selectedMonths: string[], selectedQuarters: string[], quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string => {
    if (!selectedMonths && !selectedQuarters) return '-';
    
    try {
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
    } catch (error) {
      console.error('PlanReviewTable: Error in getMonthsForQuarter:', error);
    }
    
    return '-';
  };

    if (!processedObjectives || processedObjectives.length === 0) {
      console.error('PlanReviewTable: No objectives data available for export');
      return;
    }
    
    console.log('PlanReviewTable: Exporting to PDF...');
    // Convert processed objectives to table rows format first
  // PRODUCTION-SAFE: Format date safely
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      console.error('PlanReviewTable: Error formatting date:', e);
      return 'Invalid date';
    }
  };

  // Toggle functions for expand/collapse
  const toggleObjectiveExpand = (objectiveId: string) => {
    setExpandedObjectives(prev => ({
      ...prev,
      [objectiveId]: !prev[objectiveId]
    }));
  };

  const toggleInitiativeExpand = (initiativeId: string) => {
    setExpandedInitiatives(prev => ({
      ...prev,
      [initiativeId]: !prev[initiativeId]
    }));
  };

  // PRODUCTION-SAFE: Handle export functions
  const handleExportExcel = () => {
    try {
      const dataFormatted = processDataForExport(processedObjectives, 'en');
      exportToExcel(
        dataFormatted,
        `moh-plan-${new Date().toISOString().slice(0, 10)}`,
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
      console.error('PlanReviewTable: Export Excel error:', error);
    }
  };

  const handleExportPDF = () => {
    try {
      const dataFormatted = processDataForExport(processedObjectives, 'en');
      exportToPDF(
        dataFormatted,
        `moh-plan-${new Date().toISOString().slice(0, 10)}`,
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
      console.error('PlanReviewTable: Export PDF error:', error);
    }
  };

  // PRODUCTION-SAFE: Loading state
  if (isLoadingFreshData) {
    return (
      <div className="p-12 text-center">
        <Loader className="h-10 w-10 mx-auto text-green-500 animate-spin" />
        <p className="mt-4 text-gray-600 text-lg">Loading latest plan data...</p>
        <p className="mt-2 text-sm text-gray-500">Fetching fresh objectives, initiatives, and activities...</p>
      </div>
    );
  }

  // PRODUCTION-SAFE: Error state with fallback
  if (dataProcessingError) {
    return (
      <div className="p-6 text-center">
        <div className="rounded-full bg-yellow-100 p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-yellow-500" />
        </div>
        <h3 className="text-lg font-medium text-yellow-800 mb-2">Data Refresh Issue</h3>
        <p className="text-yellow-600 mb-4">{dataProcessingError}</p>
        <button
          onClick={handleManualRefresh}
          className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
        >
          <RefreshCw className="h-4 w-4 inline mr-2" />
          Try Refresh Again
        </button>
      </div>
    );
  }

  // PRODUCTION-SAFE: Empty state
  if (!processedObjectives || processedObjectives.length === 0) {
    return (
      <div className="p-8 text-center bg-yellow-50 rounded-lg border border-yellow-200">
        <Info className="h-10 w-10 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-yellow-800 mb-2">No Plan Data Available</h3>
        <p className="text-yellow-700 mb-4">No objectives found for this plan.</p>
        <button
          onClick={handleManualRefresh}
          className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200"
        >
  return (
    <div className="space-y-6">
      {/* Plan Header Information */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Organization:</span>
            <p className="font-medium text-gray-900">{organizationName}</p>
          </div>
          <div>
            <span className="text-gray-500">Planner:</span>
            <p className="font-medium text-gray-900">{plannerName}</p>
          </div>
          <div>
            <span className="text-gray-500">Period:</span>
            <p className="font-medium text-gray-900">{formatDate(fromDate)} - {formatDate(toDate)}</p>
          </div>
          <div>
            <span className="text-gray-500">Type:</span>
            <p className="font-medium text-gray-900">{planType}</p>
          </div>
        </div>
        
        {/* Refresh button */}
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing data for organization ID: {userOrgId || 'Not set'}
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={isLoadingFreshData}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoadingFreshData ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </>
            )}
          </button>
        </div>
      </div>

      {/* Export buttons */}
      {!isViewOnly && (
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleExportExcel}
            disabled={processedObjectives.length === 0}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export Excel
          </button>
        </div>
      )}

      {/* Plan Content */}
      <div className="space-y-6">
        {processedObjectives.map((objective, objIndex) => {
          if (!objective) return null;
          
          const effectiveWeight = objective.effective_weight || objective.planner_weight || objective.weight;
          const isObjectiveExpanded = expandedObjectives[objective.id] || false;
          
          return (
            <div key={objective.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              {/* Objective Header */}
              <div 
                className="bg-blue-50 px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-blue-100 transition-colors"
                onClick={() => toggleObjectiveExpand(objective.id.toString())}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium text-blue-900">
                      {objIndex + 1}. {objective.title}
                    </h3>
                    <p className="text-sm text-blue-700 mt-1">{objective.description}</p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm text-blue-600">Weight</div>
                      <div className="text-xl font-bold text-blue-800">{effectiveWeight}%</div>
                    </div>
                    <div className="text-blue-600">
                      {isObjectiveExpanded ? '▼' : '▶'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Objective Content */}
              {isObjectiveExpanded && (
                <div className="p-6">
                  {!objective.initiatives || objective.initiatives.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>No initiatives found for this objective</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {objective.initiatives.map((initiative, initIndex) => {
                        if (!initiative) return null;
                        
                        const isInitiativeExpanded = expandedInitiatives[initiative.id] || false;
                        const performanceMeasures = initiative.performance_measures || [];
                        const mainActivities = initiative.main_activities || [];
                        
                        return (
                          <div key={initiative.id} className="border border-gray-200 rounded-lg">
                            {/* Initiative Header */}
                            <div 
                              className="bg-green-50 px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-green-100 transition-colors"
                              onClick={() => toggleInitiativeExpand(initiative.id)}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <h4 className="font-medium text-green-900">
                                    {objIndex + 1}.{initIndex + 1} {initiative.name}
                                  </h4>
                                  <p className="text-sm text-green-700">
                                    Organization: {initiative.organization_name || 'Ministry of Health'}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-4">
                                  <div className="text-right">
                                    <div className="text-sm text-green-600">Weight</div>
                                    <div className="text-lg font-bold text-green-800">{initiative.weight}%</div>
                                  </div>
                                  <div className="text-green-600">
                                    {isInitiativeExpanded ? '▼' : '▶'}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Initiative Content */}
                            {isInitiativeExpanded && (
                              <div className="p-4">
                                {/* Performance Measures */}
                                {performanceMeasures.length > 0 && (
                                  <div className="mb-6">
                                    <h5 className="text-md font-medium text-purple-700 mb-3">
                                      Performance Measures ({performanceMeasures.length})
                                    </h5>
                                    <div className="grid gap-3">
                                      {performanceMeasures.map((measure, measureIndex) => (
                                        <div key={measure.id} className="bg-purple-50 p-3 rounded border border-purple-200">
                                          <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                              <h6 className="font-medium text-purple-900">
                                                PM {measureIndex + 1}: {measure.name}
                                              </h6>
                                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm text-purple-700">
                                                <div>Weight: {measure.weight}%</div>
                                                <div>Baseline: {measure.baseline || 'N/A'}</div>
                                                <div>Annual: {measure.annual_target || 0}</div>
                                                <div>Type: {measure.target_type || 'cumulative'}</div>
                                              </div>
                                              <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-purple-600">
                                                <div>
                                                  <div className="font-medium">Q1: {measure.q1_target || 0}</div>
                                                  <div className="text-purple-500">{getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q1')}</div>
                                                </div>
                                                <div>
                                                  <div className="font-medium">Q2: {measure.q2_target || 0}</div>
                                                  <div className="text-purple-500">{getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q2')}</div>
                                                </div>
                                                <div>
                                                  <div className="font-medium">Q3: {measure.q3_target || 0}</div>
                                                  <div className="text-purple-500">{getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q3')}</div>
                                                </div>
                                                <div>
                                                  <div className="font-medium">Q4: {measure.q4_target || 0}</div>
                                                  <div className="text-purple-500">{getMonthsForQuarter(measure.selected_months || [], measure.selected_quarters || [], 'Q4')}</div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Main Activities */}
                                {mainActivities.length > 0 && (
                                  <div>
                                    <h5 className="text-md font-medium text-orange-700 mb-3">
                                      Main Activities ({mainActivities.length})
                                    </h5>
                                    <div className="grid gap-3">
                                      {mainActivities.map((activity, activityIndex) => {
                                        const budgetData = calculateActivityBudget(activity);
                                        const sixMonthTarget = activity.target_type === 'cumulative' 
                                          ? Number(activity.q1_target || 0) + Number(activity.q2_target || 0) 
                                          : Number(activity.q2_target || 0);

                                        return (
                                          <div key={activity.id} className="bg-orange-50 p-4 rounded border border-orange-200">
                                            <div className="flex justify-between items-start mb-3">
                                              <div className="flex-1">
                                                <h6 className="font-medium text-orange-900">
                                                  MA {activityIndex + 1}: {activity.name}
                                                </h6>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm text-orange-700">
                                                  <div>Weight: {activity.weight}%</div>
                                                  <div>Baseline: {activity.baseline || 'N/A'}</div>
                                                  <div>Annual: {activity.annual_target || 0}</div>
                                                  <div>Type: {activity.target_type || 'cumulative'}</div>
                                                </div>
                                                <div className="grid grid-cols-5 gap-2 mt-2 text-xs text-orange-600">
                                                  <div>
                                                    <div className="font-medium">Q1: {activity.q1_target || 0}</div>
                                                    <div className="text-orange-500">{getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q1')}</div>
                                                  </div>
                                                  <div>
                                                    <div className="font-medium">Q2: {activity.q2_target || 0}</div>
                                                    <div className="text-orange-500">{getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q2')}</div>
                                                  </div>
                                                  <div>
                                                    <div className="font-medium">6M: {sixMonthTarget}</div>
                                                    <div className="text-orange-500">Target</div>
                                                  </div>
                                                  <div>
                                                    <div className="font-medium">Q3: {activity.q3_target || 0}</div>
                                                    <div className="text-orange-500">{getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q3')}</div>
                                                  </div>
                                                  <div>
                                                    <div className="font-medium">Q4: {activity.q4_target || 0}</div>
                                                    <div className="text-orange-500">{getMonthsForQuarter(activity.selected_months || [], activity.selected_quarters || [], 'Q4')}</div>
                                                  </div>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Budget Information */}
                                            {budgetData.budgetRequired > 0 && (
                                              <div className="mt-3 pt-3 border-t border-orange-200">
                                                <h6 className="text-sm font-medium text-orange-800 mb-2">Budget Information</h6>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                                  <div>
                                                    <div className="text-orange-600">Required</div>
                                                    <div className="font-medium">${budgetData.budgetRequired.toLocaleString()}</div>
                                                  </div>
                                                  <div>
                                                    <div className="text-orange-600">Government</div>
                                                    <div className="font-medium">${budgetData.government.toLocaleString()}</div>
                                                  </div>
                                                  <div>
                                                    <div className="text-orange-600">Partners</div>
                                                    <div className="font-medium">${budgetData.partners.toLocaleString()}</div>
                                                  </div>
                                                  <div>
                                                    <div className="text-orange-600">Gap</div>
                                                    <div className={`font-medium ${budgetData.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                      ${budgetData.gap.toLocaleString()}
                                                    </div>
                                                  </div>
                                                </div>
                                                
                                                {/* Sub-activities count */}
                                                {activity.sub_activities && activity.sub_activities.length > 0 && (
                                                  <div className="mt-2 text-xs text-orange-600">
                                                    Sub-activities: {activity.sub_activities.length}
                                                    {activity.sub_activities.map((sub, i) => (
                                                      <span key={sub.id} className="ml-2 bg-orange-200 px-1 rounded">
                                                        {sub.activity_type}
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* No content message */}
                                {performanceMeasures.length === 0 && mainActivities.length === 0 && (
                                  <div className="text-center py-6 text-gray-500">
                                    <Info className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                                    <p>No performance measures or main activities found for this initiative</p>
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
              )}
            </div>
          );
        })}
      </div>

      {/* Submit button for non-preview mode */}
      {!isPreviewMode && !isViewOnly && (
        <div className="flex justify-end pt-6 border-t border-gray-200">
          <button
            onClick={() => onSubmit(processedObjectives)}
            disabled={isSubmitting || processedObjectives.length === 0}
            className="flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Submit for Review
              </>
            )}
          </button>
        </div>
      }
    </div>
  );
};

export default PlanReviewTable;

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
import { X, FileSpreadsheet, File as FilePdf, RefreshCw, AlertCircle, Info, Loader, CheckCircle } from 'lucide-react';
