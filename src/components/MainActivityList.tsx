import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, auth, api } from '../lib/api';
import { BarChart3, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, Building2, Info, DollarSign, RefreshCw, Loader } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity } from '../types/plan';
import { isPlanner } from '../types/user';

interface MainActivityListProps {
  initiativeId: string;
  initiativeWeight: number;
  onEditActivity: (activity: MainActivity) => void;
  onSelectActivity?: (activity: MainActivity) => void;
  isNewPlan?: boolean;
  planKey?: string;
  isUserPlanner: boolean;
  userOrgId: number | null;
  refreshKey?: number;
}

const MainActivityList: React.FC<MainActivityListProps> = ({ 
  initiativeId,
  initiativeWeight,
  onEditActivity,
  onSelectActivity,
  isNewPlan = false,
  planKey = 'default',
  isUserPlanner,
  userOrgId,
  refreshKey = 0,
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastRefreshKey, setLastRefreshKey] = useState(refreshKey);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  
  console.log('MainActivityList initialized with:', {
    initiativeId,
    initiativeWeight,
    userOrgId,
    isUserPlanner,
    refreshKey
  });

  // Force refresh function for external use
  const forceRefresh = () => {
    console.log('Force refreshing main activities list');
    setRefreshTrigger(prev => prev + 1);
    setRetryAttempt(prev => prev + 1);
    queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
    refetch();
  };

  // Listen for external refresh key changes
  useEffect(() => {
    if (refreshKey !== lastRefreshKey) {
      console.log('MainActivityList: External refresh key changed, refreshing data');
      setLastRefreshKey(refreshKey);
      forceRefresh();
    }
  }, [refreshKey, lastRefreshKey]);

  // Production-safe API call with multiple fallback strategies
  const fetchMainActivitiesSafely = async () => {
    if (!initiativeId) {
      console.log('MainActivityList: Missing initiativeId, cannot fetch activities');
      return { data: [] };
    }

    console.log(`MainActivityList: Fetching activities for initiative ${initiativeId} (attempt ${retryAttempt + 1})`);
    
    try {
      // Strategy 1: Try the dedicated getByInitiative method
      console.log('MainActivityList: Attempt 1 - Using mainActivities.getByInitiative');
      const response = await mainActivities.getByInitiative(initiativeId);
      
      if (response?.data && Array.isArray(response.data)) {
        console.log(`MainActivityList: Success! Found ${response.data.length} activities via getByInitiative`);
        return response;
      } else {
        console.warn('MainActivityList: getByInitiative returned invalid data format:', response);
        throw new Error('Invalid response format from getByInitiative');
      }
    } catch (error1) {
      console.warn('MainActivityList: Attempt 1 failed:', error1);
      
      try {
        // Strategy 2: Direct API call with query params
        console.log('MainActivityList: Attempt 2 - Direct API call with query params');
        const response = await api.get(`/main-activities/?initiative=${initiativeId}`);
        
        let activitiesData = response.data?.results || response.data || [];
        
        if (!Array.isArray(activitiesData)) {
          console.warn('MainActivityList: Direct API call returned non-array:', activitiesData);
          activitiesData = [];
        }
        
        console.log(`MainActivityList: Success! Found ${activitiesData.length} activities via direct API`);
        return { data: activitiesData };
        
      } catch (error2) {
        console.warn('MainActivityList: Attempt 2 failed:', error2);
        
        try {
          // Strategy 3: Get all activities and filter client-side
          console.log('MainActivityList: Attempt 3 - Get all activities and filter');
          const response = await mainActivities.getAll();
          
          let allActivities = response?.data || [];
          if (!Array.isArray(allActivities)) {
            allActivities = allActivities.results || [];
          }
          
          const filteredActivities = allActivities.filter((activity: any) => 
            activity && activity.initiative && String(activity.initiative) === String(initiativeId)
          );
          
          console.log(`MainActivityList: Success! Found ${filteredActivities.length} activities via filtering all`);
          return { data: filteredActivities };
          
        } catch (error3) {
          console.error('MainActivityList: All attempts failed:', { error1, error2, error3 });
          throw new Error(`Failed to fetch main activities: ${error3.message}`);
        }
      }
    }
  };

  // Fetch all main activities for this initiative with retry logic
  const { data: activitiesList, isLoading, refetch, error: fetchError } = useQuery({
    queryKey: ['main-activities', initiativeId, planKey, refreshTrigger, refreshKey, retryAttempt],
    queryFn: fetchMainActivitiesSafely,
    enabled: !!initiativeId && !!userOrgId,
    staleTime: 0,
    cacheTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    onError: (error) => {
      console.error('MainActivityList: Query error:', error);
    },
    onSuccess: (data) => {
      console.log('MainActivityList: Query success, activities loaded:', data?.data?.length || 0);
    }
  });

  // Delete activity mutation with optimistic updates
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => {
      console.log('MainActivityList: Deleting activity:', activityId);
      return mainActivities.delete(activityId);
    },
    onMutate: async (activityId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: ['main-activities', initiativeId] 
      });

      // Snapshot the previous value
      const previousActivities = queryClient.getQueryData<{ data: MainActivity[] }>(
        ['main-activities', initiativeId, planKey, refreshTrigger, refreshKey, retryAttempt]
      );

      // Optimistically update to the new value
      if (previousActivities?.data) {
        queryClient.setQueryData(
          ['main-activities', initiativeId, planKey, refreshTrigger, refreshKey, retryAttempt],
          {
            ...previousActivities,
            data: previousActivities.data.filter(activity => activity.id !== activityId)
          }
        );
      }

      return { previousActivities };
    },
    onError: (err, activityId, context) => {
      console.error('Failed to delete activity:', err);
      // Rollback to previous state on error
      if (context?.previousActivities) {
        queryClient.setQueryData(
          ['main-activities', initiativeId, planKey, refreshTrigger, refreshKey, retryAttempt],
          context.previousActivities
        );
      }
    },
    onSettled: () => {
      // Gentle background refresh (doesn't clear UI)
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ['main-activities', initiativeId] 
        });
      }, 1000);
    }
  });

  // Production-safe activity filtering
  const filteredActivities = React.useMemo(() => {
    console.log('MainActivityList: Filtering activities for user org:', userOrgId);
    
    if (!activitiesList?.data || !Array.isArray(activitiesList.data)) {
      console.log('MainActivityList: No activities data to filter');
      return [];
    }

    console.log('MainActivityList: Raw activities from API:', activitiesList.data.length);
    
    // PRODUCTION-SAFE: Proper organization filtering for main activities
    const filtered = activitiesList.data.filter(activity => {
      if (!activity) {
        console.log('MainActivityList: Skipping null activity');
        return false;
      }
      
      // Check if this is a default activity (available to all)
      const isDefault = activity.is_default === true;
      
      // Check if activity has no organization (legacy data)
      const hasNoOrg = !activity.organization || activity.organization === null;
      
      // Check if activity belongs to user's organization
      const belongsToUserOrg = userOrgId && activity.organization && 
                              Number(activity.organization) === Number(userOrgId);
      
      // Include if: default, no org (legacy), or belongs to user's org
      const shouldInclude = isDefault || hasNoOrg || belongsToUserOrg;
      
      console.log(`MainActivityList: Activity "${activity.name}" - isDefault:${isDefault}, org:${activity.organization}, userOrg:${userOrgId}, include:${shouldInclude}`);
      
      return shouldInclude;
    });
    
    console.log(`MainActivityList: Filtered ${activitiesList.data.length} total to ${filtered.length} for user org ${userOrgId}`);
    
    return filtered;
  }, [activitiesList?.data, userOrgId]);

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      console.log('MainActivityList: Manual refresh triggered');
      setRetryAttempt(prev => prev + 1);
      await refetch();
      console.log('MainActivityList: Manual refresh completed');
    } catch (error) {
      console.error('MainActivityList: Manual refresh failed:', error);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // Handle activity deletion
  const handleDeleteActivity = (activityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
      deleteActivityMutation.mutate(activityId);
    }
  };

  // Calculate weight totals
  const totalActivitiesWeight = filteredActivities.reduce((sum, activity) => 
    sum + (Number(activity.weight) || 0), 0
  );
  
  // Expected weight is 65% of initiative weight
  const expectedActivitiesWeight = parseFloat((initiativeWeight * 0.65).toFixed(2));
  const remainingWeight = parseFloat((expectedActivitiesWeight - totalActivitiesWeight).toFixed(2));
  
  // Check if weight is valid (within 0.01% tolerance)
  const isWeightValid = totalActivitiesWeight <= expectedActivitiesWeight;

  console.log('MainActivityList: Weight calculations:', {
    initiativeWeight,
    expectedActivitiesWeight,
    totalActivitiesWeight,
    remainingWeight,
    isWeightValid,
    activitiesCount: filteredActivities.length
  });

  // Loading state
  if (isLoading && initiativeId) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <div>
          <span className="text-gray-600">Loading main activities...</span>
          <p className="text-xs text-gray-500 mt-1">Initiative: {initiativeId}</p>
        </div>
      </div>
    );
  }

  // Error state with retry option
  if (fetchError) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-800 font-medium">Failed to Load Main Activities</span>
          </div>
          <p className="text-red-700 text-sm mb-3">
            {fetchError.message || 'Unable to fetch main activities from the server'}
          </p>
          <div className="flex space-x-2">
            <button
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
            >
              {isManualRefreshing ? (
                <>
                  <Loader className="h-4 w-4 inline mr-1 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 inline mr-1" />
                  Try Again
                </>
              )}
            </button>
            {isUserPlanner && (
              <button 
                onClick={() => onEditActivity({} as MainActivity)}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                <PlusCircle className="h-4 w-4 inline mr-1" />
                Create Activity
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Empty state when no activities exist
  if (!filteredActivities || filteredActivities.length === 0) {
    return (
      <div className="space-y-4">
        {/* Weight Distribution Card */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Main Activities Weight Distribution
            </h3>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Initiative Weight</p>
              <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Expected (65%)</p>
              <p className="text-2xl font-semibold text-blue-600">{expectedActivitiesWeight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-semibold text-green-600">{expectedActivitiesWeight}%</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 flex items-center">
              <Info className="h-4 w-4 mr-2" />
              <strong>Rule:</strong> Main activities can use up to 65% of initiative weight ({expectedActivitiesWeight}%). 
              Remaining 35% is reserved for performance measures.
            </p>
          </div>
        </div>

        {/* Empty State */}
        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Main Activities Found</h3>
          <p className="text-gray-500 mb-4">
            No main activities have been created yet for this initiative.
          </p>
          <div className="flex justify-center space-x-3">
            <button
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {isManualRefreshing ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Check Again
                </>
              )}
            </button>
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
        </div>
      </div>
    );
  }

  // Main render with activities
  return (
    <div className="space-y-4">
      {/* Weight Distribution Summary */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Main Activities Weight Distribution
          </h3>
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            <button
              onClick={handleManualRefresh}
              disabled={isManualRefreshing}
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              {isManualRefreshing ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Initiative Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Current Total</p>
            <p className="text-2xl font-semibold text-blue-600">{totalActivitiesWeight.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Remaining</p>
            <p className={`text-2xl font-semibold ${isWeightValid ? 'text-green-600' : 'text-red-600'}`}>
              {remainingWeight.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            <strong>Target:</strong> Activities can use up to {expectedActivitiesWeight}% 
            (65% of initiative weight {initiativeWeight}%).
          </p>
        </div>

        {remainingWeight < 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Over target by {Math.abs(remainingWeight).toFixed(1)}%. Please reduce existing activity weights.</p>
          </div>
        )}

        {isWeightValid && totalActivitiesWeight > 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">Weight distribution is within limits ({totalActivitiesWeight.toFixed(1)}% ≤ {expectedActivitiesWeight}%)</p>
          </div>
        )}
      </div>

      {/* Activities List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 flex items-center">
            <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Activities ({filteredActivities.length})
            </span>
            Main Activities
          </h3>
          {isUserPlanner && (
            <button 
              onClick={() => onEditActivity({} as MainActivity)}
              disabled={remainingWeight <= 0}
              className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Add Activity
            </button>
          )}
        </div>
        
        {filteredActivities.map((activity) => {
          // Calculate budget totals for display
          const totalBudget = activity.sub_activities?.reduce((sum, sub) => {
            const cost = sub.budget_calculation_type === 'WITH_TOOL'
              ? Number(sub.estimated_cost_with_tool || 0)
              : Number(sub.estimated_cost_without_tool || 0);
            return sum + cost;
          }, 0) || 0;

          const totalFunding = activity.sub_activities?.reduce((sum, sub) => {
            return sum + 
              Number(sub.government_treasury || 0) +
              Number(sub.sdg_funding || 0) +
              Number(sub.partners_funding || 0) +
              Number(sub.other_funding || 0);
          }, 0) || 0;

          const fundingGap = Math.max(0, totalBudget - totalFunding);

          return (
            <div
              key={activity.id}
              onClick={() => onSelectActivity && onSelectActivity(activity)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <h4 className="font-medium text-gray-900">{activity.name}</h4>
                  {activity.organization_name && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {activity.organization_name}
                    </span>
                  )}
                  {activity.sub_activities && activity.sub_activities.length > 0 && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {activity.sub_activities.length} Sub-Activities
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-blue-600">
                    {activity.weight}%
                  </span>
                </div>
              </div>
              
              {/* Activity Targets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs text-gray-500">
                <div>Baseline: {activity.baseline || 'N/A'}</div>
                <div>Annual Target: {activity.annual_target || 0}</div>
                <div>Q1: {activity.q1_target || 0}</div>
                <div>Q2: {activity.q2_target || 0}</div>
                <div>Q3: {activity.q3_target || 0}</div>
                <div>Q4: {activity.q4_target || 0}</div>
              </div>

              {/* Budget Summary */}
              {totalBudget > 0 && (
                <div className="mt-3 p-2 bg-gray-50 rounded border text-xs">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center text-gray-600">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Budget: ETB {totalBudget.toLocaleString()}
                    </span>
                    <span className={`font-medium ${fundingGap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fundingGap > 0 ? `Gap: ETB ${fundingGap.toLocaleString()}` : 'Fully Funded'}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="flex justify-end mt-2">
                {isUserPlanner ? (
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditActivity(activity);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={(e) => handleDeleteActivity(activity.id, e)}
                      disabled={deleteActivityMutation.isPending}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center disabled:opacity-50"
                    >
                      {deleteActivityMutation.isPending ? (
                        <Loader className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      {deleteActivityMutation.isPending ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 flex items-center">
                    <Lock className="h-3 w-3 mr-1" />
                    Read Only
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add activity button for planners */}
      {isUserPlanner && (
        <div className="mt-4 text-center">
          <button 
            onClick={() => onEditActivity({} as MainActivity)}
            disabled={remainingWeight <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {filteredActivities.length === 0 ? 'Create First Main Activity' : 
             remainingWeight <= 0 ? `No Weight Available (${remainingWeight.toFixed(1)}%)` :
             'Create New Main Activity'}
          </button>
          
          {remainingWeight <= 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Cannot add more activities. Total weight cannot exceed {expectedActivitiesWeight}% (65% of initiative).
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MainActivityList;