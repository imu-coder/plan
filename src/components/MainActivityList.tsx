import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, subActivities, auth } from '../lib/api';
import { 
  Activity, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, 
  Building2, Info, DollarSign, Users, Calendar, Target, Loader, Plus,
  ClipboardList, Calculator, RefreshCw
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity, SubActivity } from '../types/plan';
import { isPlanner } from '../types/user';
import ActivityBudgetForm from './ActivityBudgetForm';
import ActivityBudgetDetails from './ActivityBudgetDetails';
import TrainingCostingTool from './TrainingCostingTool';
import MeetingWorkshopCostingTool from './MeetingWorkshopCostingTool';
import PrintingCostingTool from './PrintingCostingTool';
import ProcurementCostingTool from './ProcurementCostingTool';
import SupervisionCostingTool from './SupervisionCostingTool';

interface MainActivityListProps {
  initiativeId: string;
  initiativeWeight: number;
  onEditActivity: (activity: MainActivity) => void;
  onSelectActivity?: (activity: MainActivity) => void;
  isNewPlan?: boolean;
  planKey?: string;
  refreshKey?: number;
}

const MainActivityList: React.FC<MainActivityListProps> = ({ 
  initiativeId,
  initiativeWeight,
  onEditActivity,
  onSelectActivity,
  isNewPlan = false,
  planKey = 'default',
  refreshKey = 0,
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  // All state hooks at top level
  const [isUserPlanner, setIsUserPlanner] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastRefreshKey, setLastRefreshKey] = useState(refreshKey);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  const [selectedSubActivity, setSelectedSubActivity] = useState<SubActivity | null>(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showBudgetDetails, setShowBudgetDetails] = useState(false);
  const [showCostingTool, setShowCostingTool] = useState(false);
  const [costingToolType, setCostingToolType] = useState<'Training' | 'Meeting' | 'Workshop' | 'Printing' | 'Procurement' | 'Supervision' | null>(null);
  const [budgetCalculationType, setBudgetCalculationType] = useState<'WITH_TOOL' | 'WITHOUT_TOOL'>('WITHOUT_TOOL');
  const [costingToolData, setCostingToolData] = useState<any>(null);
  const [isSubmittingBudget, setIsSubmittingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [manualRefreshCounter, setManualRefreshCounter] = useState(0);

  // PRODUCTION-SAFE: Stable query key that never changes unexpectedly
  const queryKey = useMemo(() => [
    'main-activities-stable', 
    initiativeId, 
    userOrgId?.toString() || 'no-org',
    manualRefreshCounter
  ], [initiativeId, userOrgId, manualRefreshCounter]);

  // Fetch user data once and keep stable
  useEffect(() => {
    let mounted = true;
    
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!mounted) return;
        
        setIsUserPlanner(isPlanner(authData.userOrganizations));
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgId = authData.userOrganizations[0].organization;
          setUserOrgId(orgId);
          console.log('MainActivityList: User organization ID set to:', orgId);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
    
    return () => {
      mounted = false;
    };
  }, []);

  // PRODUCTION-SAFE: Ultra-stable query that never loses data
  const { data: activitiesList, isLoading, refetch, isFetching, error } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!initiativeId || !userOrgId) {
        console.log('MainActivityList: Missing required data - initiative:', initiativeId, 'userOrg:', userOrgId);
        return { data: [] };
      }
      
      console.log(`MainActivityList: Fetching activities for initiative ${initiativeId}, user org ${userOrgId}`);
      
      try {
        const response = await mainActivities.getByInitiative(initiativeId);
        console.log('MainActivityList: Raw API response:', response?.data?.length || 0, 'activities');
        
        // PRODUCTION-SAFE: Handle all possible response structures
        let activitiesData = [];
        if (response?.data?.results && Array.isArray(response.data.results)) {
          activitiesData = response.data.results;
        } else if (response?.data && Array.isArray(response.data)) {
          activitiesData = response.data;
        } else if (response?.results && Array.isArray(response.results)) {
          activitiesData = response.results;
        } else if (Array.isArray(response)) {
          activitiesData = response;
        }
        
        console.log('MainActivityList: Extracted activities data:', activitiesData.length);
        
        // PRODUCTION-SAFE: Ultra-permissive filtering to prevent data loss
        const filteredActivities = activitiesData.filter(activity => {
          if (!activity || !activity.id) {
            console.log('MainActivityList: Skipping activity without ID:', activity);
            return false;
          }
          
          // Ultra-permissive organization check
          const hasNoOrganization = !activity.organization || 
                                   activity.organization === null || 
                                   activity.organization === '' ||
                                   activity.organization === 'null' ||
                                   activity.organization === undefined ||
                                   activity.organization === 'undefined';
          
          const belongsToUserOrg = userOrgId && activity.organization && 
                                  (Number(activity.organization) === Number(userOrgId));
          
          // PRODUCTION-SAFE: Include if no org OR belongs to user org
          const shouldInclude = hasNoOrganization || belongsToUserOrg;
          
          console.log(`MainActivityList: Activity "${activity.name}" - org:${activity.organization}, userOrg:${userOrgId}, include:${shouldInclude}`);
          
          return shouldInclude;
        });
        
        console.log(`MainActivityList: Filtered ${activitiesData.length} total to ${filteredActivities.length} for user org`);
        
        return { data: filteredActivities };
        
      } catch (error) {
        console.error('MainActivityList: Error fetching activities:', error);
        throw error;
      }
    },
    enabled: !!(initiativeId && userOrgId), // Only run when we have required data
    staleTime: 10 * 60 * 1000, // 10 minutes - very long cache
    cacheTime: 30 * 60 * 1000, // 30 minutes - ultra long cache
    refetchOnMount: false, // Don't refetch on mount to preserve data
    refetchOnWindowFocus: false, // Don't refetch on focus
    refetchInterval: false, // No automatic refetch
    retry: 3,
    retryDelay: 1000,
    keepPreviousData: true, // CRITICAL: Keep previous data during refetch
  });

  // Manual refresh function that's safe and doesn't cause disappearing
  const handleManualRefresh = useCallback(() => {
    console.log('MainActivityList: Manual refresh triggered');
    setManualRefreshCounter(prev => prev + 1);
  }, []);

  // Listen for external refresh key changes safely
  useEffect(() => {
    if (refreshKey !== lastRefreshKey && refreshKey > 0) {
      console.log('MainActivityList: External refresh key changed, triggering safe refresh');
      setLastRefreshKey(refreshKey);
      handleManualRefresh();
    }
  }, [refreshKey, lastRefreshKey, handleManualRefresh]);

  // PRODUCTION-SAFE: Sub-activity creation that never affects main activities
  const createSubActivityMutation = useMutation({
    mutationFn: async (subActivityData: any) => {
      console.log('MainActivityList: Creating sub-activity with data:', subActivityData);
      
      try {
        // Create the sub-activity
        const response = await subActivities.create(subActivityData);
        console.log('MainActivityList: Sub-activity created successfully:', response);
        return response;
      } catch (error) {
        console.error('MainActivityList: Failed to create sub-activity:', error);
        throw error;
      }
    },
    onMutate: async (subActivityData) => {
      // PRODUCTION-SAFE: Optimistic update that preserves all existing data
      console.log('MainActivityList: Optimistic update for new sub-activity');
      
      await queryClient.cancelQueries({ queryKey });
      
      const previousData = queryClient.getQueryData<{ data: MainActivity[] }>(queryKey);
      
      if (previousData?.data && selectedActivity) {
        const newSubActivity = {
          id: `temp-${Date.now()}`,
          main_activity: selectedActivity.id,
          name: subActivityData.name || 'New Sub-Activity',
          activity_type: subActivityData.activity_type || 'Other',
          ...subActivityData
        };
        
        // Add the new sub-activity to the selected main activity
        const updatedActivities = previousData.data.map(activity => {
          if (activity.id === selectedActivity.id) {
            return {
              ...activity,
              sub_activities: [...(activity.sub_activities || []), newSubActivity]
            };
          }
          return activity;
        });
        
        // PRODUCTION-SAFE: Update cache without losing any data
        queryClient.setQueryData(queryKey, { data: updatedActivities });
      }
      
      return { previousData };
    },
    onSuccess: (newSubActivity, variables, context) => {
      console.log('MainActivityList: Sub-activity creation success, updating cache optimistically');
      
      // PRODUCTION-SAFE: Only update the specific activity, don't touch others
      const currentData = queryClient.getQueryData<{ data: MainActivity[] }>(queryKey);
      
      if (currentData?.data && selectedActivity) {
        const updatedActivities = currentData.data.map(activity => {
          if (activity.id === selectedActivity.id) {
            // Replace temp sub-activity with real one
            const updatedSubActivities = (activity.sub_activities || []).map(sub => 
              sub.id.startsWith('temp-') ? newSubActivity.data || newSubActivity : sub
            );
            
            return {
              ...activity,
              sub_activities: updatedSubActivities,
              total_budget: activity.total_budget || 0,
              total_funding: activity.total_funding || 0,
              funding_gap: activity.funding_gap || 0
            };
          }
          return activity;
        });
        
        // PRODUCTION-SAFE: Preserve all activities, just update the one with new sub-activity
        queryClient.setQueryData(queryKey, { data: updatedActivities });
        console.log('MainActivityList: Cache updated with new sub-activity, all activities preserved');
      }
      
      // PRODUCTION-SAFE: Delayed background sync (won't affect UI)
      setTimeout(() => {
        console.log('MainActivityList: Background cache refresh for latest data');
        queryClient.invalidateQueries({ 
          queryKey: ['main-activities-stable', initiativeId, userOrgId?.toString()],
          exact: false 
        });
      }, 5000); // 5 second delay to ensure UI stability
    },
    onError: (error, variables, context) => {
      console.error('MainActivityList: Sub-activity creation failed:', error);
      
      // PRODUCTION-SAFE: Rollback to previous state on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      
      setBudgetError(`Failed to create sub-activity: ${error.message}`);
    },
  });

  // PRODUCTION-SAFE: Delete mutation that preserves other activities
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => mainActivities.delete(activityId),
    onMutate: async (activityId) => {
      console.log('MainActivityList: Optimistic delete for activity:', activityId);
      
      await queryClient.cancelQueries({ queryKey });
      
      const previousData = queryClient.getQueryData<{ data: MainActivity[] }>(queryKey);
      
      if (previousData?.data) {
        const updatedActivities = previousData.data.filter(activity => activity.id !== activityId);
        queryClient.setQueryData(queryKey, { data: updatedActivities });
      }
      
      return { previousData };
    },
    onSuccess: () => {
      console.log('MainActivityList: Activity deleted successfully');
      // PRODUCTION-SAFE: No immediate refetch, rely on optimistic update
    },
    onError: (error, activityId, context) => {
      console.error('MainActivityList: Delete failed:', error);
      
      // PRODUCTION-SAFE: Rollback on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
    },
  });

  // Memoized data processing to prevent unnecessary recalculations
  const processedActivities = useMemo(() => {
    if (!activitiesList?.data || !Array.isArray(activitiesList.data)) {
      console.log('MainActivityList: No activities data or not array:', activitiesList);
      return [];
    }
    
    console.log('MainActivityList: Processing', activitiesList.data.length, 'activities');
    
    // PRODUCTION-SAFE: Enrich with organization names and ensure all fields exist
    return activitiesList.data.map(activity => {
      if (!activity) return null;
      
      return {
        ...activity,
        organization_name: activity.organization_name || 
                         organizationsMap[String(activity.organization)] || 
                         'Ministry of Health',
        sub_activities: Array.isArray(activity.sub_activities) ? activity.sub_activities : [],
        total_budget: activity.total_budget || 0,
        total_funding: activity.total_funding || 0,
        funding_gap: activity.funding_gap || 0,
        weight: Number(activity.weight) || 0
      };
    }).filter(Boolean); // Remove any null entries
  }, [activitiesList?.data, organizationsMap]);

  // Calculate weight totals safely
  const weightCalculations = useMemo(() => {
    const totalActivitiesWeight = processedActivities.reduce((sum, activity) => 
      sum + (Number(activity.weight) || 0), 0
    );
    
    const maxAllowedTotal = parseFloat((initiativeWeight * 0.65).toFixed(2));
    const remainingWeight = parseFloat((maxAllowedTotal - totalActivitiesWeight).toFixed(2));
    const isWeightValid = totalActivitiesWeight <= maxAllowedTotal;

    return {
      totalActivitiesWeight,
      maxAllowedTotal,
      remainingWeight,
      isWeightValid
    };
  }, [processedActivities, initiativeWeight]);

  const { totalActivitiesWeight, maxAllowedTotal, remainingWeight, isWeightValid } = weightCalculations;

  // PRODUCTION-SAFE: Budget submission that doesn't affect main activities display
  const handleBudgetSubmit = useCallback(async (budgetData: any) => {
    if (!selectedActivity) {
      setBudgetError('No activity selected for budget');
      return;
    }

    setIsSubmittingBudget(true);
    setBudgetError(null);
    
    console.log('MainActivityList: Submitting budget for activity:', selectedActivity.id);
    console.log('MainActivityList: Budget data:', budgetData);
    
    try {
      // Prepare sub-activity data
      const subActivityData = {
        main_activity: selectedActivity.id,
        name: budgetData.name || `${budgetData.activity_type} for ${selectedActivity.name}`,
        activity_type: budgetData.activity_type || 'Other',
        description: budgetData.description || '',
        budget_calculation_type: budgetData.budget_calculation_type || 'WITHOUT_TOOL',
        estimated_cost_with_tool: Number(budgetData.estimated_cost_with_tool) || 0,
        estimated_cost_without_tool: Number(budgetData.estimated_cost_without_tool) || 0,
        government_treasury: Number(budgetData.government_treasury) || 0,
        sdg_funding: Number(budgetData.sdg_funding) || 0,
        partners_funding: Number(budgetData.partners_funding) || 0,
        other_funding: Number(budgetData.other_funding) || 0,
        training_details: budgetData.training_details || null,
        meeting_workshop_details: budgetData.meeting_workshop_details || null,
        procurement_details: budgetData.procurement_details || null,
        printing_details: budgetData.printing_details || null,
        supervision_details: budgetData.supervision_details || null,
        partners_details: budgetData.partners_details || null
      };
      
      console.log('MainActivityList: Creating sub-activity with data:', subActivityData);
      
      // Create sub-activity using mutation (this preserves main activities)
      await createSubActivityMutation.mutateAsync(subActivityData);
      
      console.log('MainActivityList: Sub-activity created successfully');
      
      // Close forms
      setShowBudgetForm(false);
      setShowCostingTool(false);
      setSelectedActivity(null);
      setCostingToolData(null);
      
    } catch (error: any) {
      console.error('MainActivityList: Budget submission failed:', error);
      setBudgetError(error.message || 'Failed to save budget');
    } finally {
      setIsSubmittingBudget(false);
    }
  }, [selectedActivity, createSubActivityMutation]);

  // Costing tool handlers
  const handleCostingToolResult = useCallback(async (costingData: any) => {
    console.log('MainActivityList: Costing tool result received:', costingData);
    setCostingToolData(costingData);
    setShowCostingTool(false);
    setShowBudgetForm(true);
  }, []);

  const handleActivityAction = useCallback((activity: MainActivity, action: 'budget' | 'details') => {
    console.log(`MainActivityList: ${action} action for activity:`, activity.name);
    setSelectedActivity(activity);
    
    if (action === 'budget') {
      setShowBudgetForm(true);
      setShowBudgetDetails(false);
    } else {
      setShowBudgetDetails(true);
      setShowBudgetForm(false);
    }
  }, []);

  const handleAddBudget = useCallback((activity: MainActivity, calculationType: 'WITH_TOOL' | 'WITHOUT_TOOL', activityType?: string) => {
    console.log(`MainActivityList: Adding budget for activity ${activity.name} with calculation type: ${calculationType}`);
    
    setSelectedActivity(activity);
    setBudgetCalculationType(calculationType);
    
    if (calculationType === 'WITH_TOOL' && activityType) {
      setCostingToolType(activityType as any);
      setShowCostingTool(true);
      setShowBudgetForm(false);
    } else {
      setShowBudgetForm(true);
      setShowCostingTool(false);
    }
  }, []);

  const handleCloseAllForms = useCallback(() => {
    setShowBudgetForm(false);
    setShowBudgetDetails(false);
    setShowCostingTool(false);
    setSelectedActivity(null);
    setSelectedSubActivity(null);
    setCostingToolData(null);
    setBudgetError(null);
  }, []);

  const handleDeleteActivity = useCallback((activityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this main activity? This will also delete all associated sub-activities and budgets.')) {
      console.log('MainActivityList: Deleting activity:', activityId);
      deleteActivityMutation.mutate(activityId);
    }
  }, [deleteActivityMutation]);

  // PRODUCTION-SAFE: Loading states
  if (isLoading && !processedActivities.length) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span>Loading main activities...</span>
      </div>
    );
  }

  if (error && !processedActivities.length) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center text-red-500 mb-2">
          <AlertCircle className="h-5 w-5 mr-2" />
          <h3 className="font-medium">Error Loading Activities</h3>
        </div>
        <p className="text-red-600 mb-4">{error.message || 'Failed to load main activities'}</p>
        <button
          onClick={handleManualRefresh}
          className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
        >
          <RefreshCw className="h-4 w-4 inline mr-2" />
          Try Again
        </button>
      </div>
    );
  }

  // PRODUCTION-SAFE: Show costing tools
  if (showCostingTool && selectedActivity && costingToolType) {
    const CostingComponent = {
      'Training': TrainingCostingTool,
      'Meeting': MeetingWorkshopCostingTool,
      'Workshop': MeetingWorkshopCostingTool,
      'Printing': PrintingCostingTool,
      'Procurement': ProcurementCostingTool,
      'Supervision': SupervisionCostingTool
    }[costingToolType];

    if (CostingComponent) {
      return (
        <div className="space-y-6">
          <CostingComponent
            onCalculate={handleCostingToolResult}
            onCancel={handleCloseAllForms}
            initialData={costingToolData}
          />
        </div>
      );
    }
  }

  // PRODUCTION-SAFE: Show budget form
  if (showBudgetForm && selectedActivity) {
    return (
      <div className="space-y-6">
        <ActivityBudgetForm
          activity={selectedActivity}
          budgetCalculationType={budgetCalculationType}
          activityType={costingToolData?.activity_type || costingToolType}
          onSubmit={handleBudgetSubmit}
          initialData={costingToolData}
          costingToolData={costingToolData}
          onCancel={handleCloseAllForms}
          isSubmitting={isSubmittingBudget}
        />
        
        {budgetError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center text-red-500">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span className="font-medium">Budget Error</span>
            </div>
            <p className="text-red-600 mt-2">{budgetError}</p>
            <button
              onClick={() => setBudgetError(null)}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }

  // PRODUCTION-SAFE: Show budget details
  if (showBudgetDetails && selectedActivity) {
    return (
      <ActivityBudgetDetails
        activity={selectedActivity}
        onBack={handleCloseAllForms}
        onEdit={() => {
          setShowBudgetDetails(false);
          setShowBudgetForm(true);
        }}
        isReadOnly={!isUserPlanner}
      />
    );
  }

  // PRODUCTION-SAFE: Main activities list display
  return (
    <div className="space-y-6">
      {/* Weight Distribution Summary */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Main Activities Weight Distribution
          </h3>
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-gray-400" />
            {isFetching && (
              <Loader className="h-4 w-4 animate-spin text-blue-600" />
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Initiative Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Activities Total</p>
            <p className="text-2xl font-semibold text-blue-600">{totalActivitiesWeight.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Available (65% max)</p>
            <p className={`text-2xl font-semibold ${isWeightValid ? 'text-green-600' : 'text-red-600'}`}>
              {remainingWeight.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            <strong>Rule:</strong> Main activities can use up to 65% of initiative weight ({maxAllowedTotal}%). 
            Performance measures use the remaining 35%.
          </p>
        </div>

        {!isWeightValid && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">
              Total activities weight ({totalActivitiesWeight.toFixed(1)}%) exceeds maximum allowed ({maxAllowedTotal}%)
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            Showing {processedActivities.length} activities for your organization
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={isFetching}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Activities List */}
      {processedActivities.length === 0 ? (
        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
          <Activity className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Main Activities Found</h3>
          <p className="text-gray-500 mb-4">
            No main activities have been created yet for this initiative.
          </p>
          {isUserPlanner && (
            <button 
              onClick={() => onEditActivity({} as MainActivity)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create Main Activity
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {processedActivities.map((activity) => (
            <div
              key={activity.id}
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 transition-colors"
            >
              {/* Activity Header */}
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center">
                    <h4 className="text-lg font-medium text-gray-900">{activity.name}</h4>
                    <span className="ml-3 px-2.5 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                      {activity.weight}%
                    </span>
                  </div>
                  
                  {activity.baseline && (
                    <p className="text-sm text-gray-600 mt-1">
                      <strong>Baseline:</strong> {activity.baseline}
                    </p>
                  )}
                  
                  <div className="flex items-center mt-2 text-sm text-gray-600">
                    <Building2 className="h-4 w-4 mr-1" />
                    <span>{activity.organization_name}</span>
                  </div>
                </div>

                {isUserPlanner && (
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditActivity(activity);
                      }}
                      className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => handleDeleteActivity(activity.id, e)}
                      className="text-red-600 hover:text-red-800 flex items-center text-sm"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Targets Display */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Q1 Target</div>
                  <div className="text-sm font-medium">{activity.q1_target || 0}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Q2 Target</div>
                  <div className="text-sm font-medium">{activity.q2_target || 0}</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded">
                  <div className="text-xs text-blue-600">6-Month</div>
                  <div className="text-sm font-medium text-blue-800">
                    {activity.target_type === 'cumulative' 
                      ? Number(activity.q1_target || 0) + Number(activity.q2_target || 0)
                      : activity.q2_target || 0}
                  </div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500">Q3 Target</div>
                  <div className="text-sm font-medium">{activity.q3_target || 0}</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded">
                  <div className="text-xs text-green-600">Annual</div>
                  <div className="text-sm font-medium text-green-800">{activity.annual_target || 0}</div>
                </div>
              </div>

              {/* Sub-activities Section */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-md font-medium text-gray-700 flex items-center">
                    <ClipboardList className="h-5 w-5 mr-2 text-green-600" />
                    Sub-Activities & Budgets 
                    <span className="ml-2 text-sm text-gray-500">({activity.sub_activities?.length || 0})</span>
                  </h5>
                  
                  {isUserPlanner && (
                    <div className="flex space-x-2">
                      <div className="relative group">
                        <button
                          onClick={() => handleAddBudget(activity, 'WITH_TOOL')}
                          className="px-3 py-1.5 bg-green-100 text-green-700 rounded-md hover:bg-green-200 text-sm flex items-center"
                        >
                          <Calculator className="h-4 w-4 mr-1" />
                          Add Budget (Tool)
                        </button>
                        
                        {/* Activity Type Selection Dropdown */}
                        <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                          <div className="py-1">
                            {['Training', 'Meeting', 'Workshop', 'Printing', 'Procurement', 'Supervision'].map((type) => (
                              <button
                                key={type}
                                onClick={() => handleAddBudget(activity, 'WITH_TOOL', type)}
                                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                {type} Tool
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => handleAddBudget(activity, 'WITHOUT_TOOL')}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 text-sm flex items-center"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Budget (Manual)
                      </button>
                    </div>
                  )}
                </div>

                {/* Sub-activities List */}
                {!activity.sub_activities || activity.sub_activities.length === 0 ? (
                  <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-gray-500 text-sm">No sub-activities created yet</p>
                    {isUserPlanner && (
                      <p className="text-xs text-gray-400 mt-1">Click "Add Budget" above to create sub-activities with budgets</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activity.sub_activities.map((subActivity) => (
                      <div key={subActivity.id} className="bg-gray-50 p-4 rounded border border-gray-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <h6 className="font-medium text-gray-900">{subActivity.name}</h6>
                              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                                {subActivity.activity_type}
                              </span>
                            </div>
                            
                            {subActivity.description && (
                              <p className="text-sm text-gray-600 mt-1">{subActivity.description}</p>
                            )}
                          </div>
                          
                          <div className="text-right">
                            <div className="text-sm font-medium text-green-600">
                              ETB {(subActivity.estimated_cost || 0).toLocaleString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {subActivity.budget_calculation_type === 'WITH_TOOL' ? 'Tool Calculated' : 'Manual Entry'}
                            </div>
                          </div>
                        </div>

                        {/* Budget Summary for Sub-activity */}
                        <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                          <div className="text-center">
                            <div className="text-gray-500">Government</div>
                            <div className="font-medium">ETB {(subActivity.government_treasury || 0).toLocaleString()}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500">Partners</div>
                            <div className="font-medium">ETB {(subActivity.partners_funding || 0).toLocaleString()}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500">SDG</div>
                            <div className="font-medium">ETB {(subActivity.sdg_funding || 0).toLocaleString()}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-gray-500">Other</div>
                            <div className="font-medium">ETB {(subActivity.other_funding || 0).toLocaleString()}</div>
                          </div>
                        </div>

                        {/* Funding Gap Indicator */}
                        {subActivity.funding_gap > 0 && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            Funding gap: ETB {subActivity.funding_gap.toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {/* Activity Total Budget */}
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-blue-800">Activity Total Budget:</span>
                        <span className="font-bold text-blue-900">ETB {(activity.total_budget || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-sm text-blue-600">Total Funding:</span>
                        <span className="text-sm font-medium text-blue-700">ETB {(activity.total_funding || 0).toLocaleString()}</span>
                      </div>
                      {activity.funding_gap > 0 && (
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-sm text-red-600">Funding Gap:</span>
                          <span className="text-sm font-medium text-red-700">ETB {activity.funding_gap.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add activity button */}
      {isUserPlanner && (
        <div className="text-center">
          <button 
            onClick={() => onEditActivity({} as MainActivity)}
            disabled={remainingWeight <= 0.01}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {processedActivities.length === 0 ? 'Create First Main Activity' : 
             remainingWeight <= 0.01 ? `No Weight Available (${remainingWeight.toFixed(1)}%)` :
             'Create New Main Activity'}
          </button>
          
          {remainingWeight <= 0.01 && totalActivitiesWeight < maxAllowedTotal && (
            <p className="mt-2 text-xs text-amber-600">
              Cannot add more activities. Total weight would exceed {maxAllowedTotal}% limit.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MainActivityList;