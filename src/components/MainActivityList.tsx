import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, auth } from '../lib/api';
import { Activity, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, DollarSign, Building2, Info, Loader } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity } from '../types/organization';
import { isPlanner } from '../types/user';

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
  refreshKey = 0
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [isUserPlanner, setIsUserPlanner] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Get user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        setIsUserPlanner(isPlanner(authData.userOrganizations));
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
  }, []);

  // Fetch main activities for this initiative
  const { data: activitiesList, isLoading, error, refetch } = useQuery({
    queryKey: ['main-activities', initiativeId, refreshKey],
    queryFn: async () => {
      if (!initiativeId) {
        console.log('Missing initiativeId, cannot fetch main activities');
        return { data: [] };
      }
      
      console.log(`Fetching main activities for initiative ${initiativeId}`);
      const response = await mainActivities.getByInitiative(initiativeId);
      console.log('Main activities response:', response?.data?.length || 0, 'activities');
      return response;
    },
    enabled: !!initiativeId,
    staleTime: 0,
    cacheTime: 0,
    refetchOnMount: true,
  });

  // Delete activity mutation
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => mainActivities.delete(activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      refetch();
    }
  });

  // Filter activities based on user organization
  const filteredActivities = React.useMemo(() => {
    if (!activitiesList?.data || !Array.isArray(activitiesList.data)) {
      console.log('No activities data or not array:', activitiesList);
      return [];
    }
    
    console.log('All activities before filtering:', activitiesList.data.length);
    console.log('User org ID:', userOrgId);
    
    // Filter activities: show activities that belong to user's org or have no org assigned
    const filtered = activitiesList.data.filter(activity => {
      const belongsToUserOrg = !activity.organization || activity.organization === userOrgId;
      console.log(`Activity "${activity.name}": org=${activity.organization}, userOrg=${userOrgId}, belongs=${belongsToUserOrg}`);
      return belongsToUserOrg;
    });
    
    console.log('Filtered activities:', filtered.length);
    return filtered;
  }, [activitiesList?.data, userOrgId]);

  // Calculate weight totals
  const totalActivitiesWeight = filteredActivities.reduce((sum, activity) => 
    sum + (Number(activity.weight) || 0), 0
  );
  
  const maxAllowedWeight = parseFloat((initiativeWeight * 0.65).toFixed(2));
  const remainingWeight = parseFloat((maxAllowedWeight - totalActivitiesWeight).toFixed(2));
  const isWeightValid = totalActivitiesWeight <= maxAllowedWeight;

  console.log('Weight calculations:', {
    initiativeWeight,
    maxAllowedWeight,
    totalActivitiesWeight,
    remainingWeight,
    isWeightValid,
    activitiesCount: filteredActivities.length
  });

  // Handle activity deletion
  const handleDeleteActivity = (activityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this activity? This action cannot be undone.')) {
      deleteActivityMutation.mutate(activityId);
    }
  };

  // Handle activity validation
  const handleValidateActivities = () => {
    setValidationSuccess(null);
    setValidationError(null);
    
    if (isWeightValid) {
      setValidationSuccess(`Activity weights are valid (${totalActivitiesWeight.toFixed(2)}% ≤ ${maxAllowedWeight}%)`);
      setTimeout(() => setValidationSuccess(null), 3000);
    } else {
      setValidationError(`Activity weights (${totalActivitiesWeight.toFixed(2)}%) exceed maximum allowed (${maxAllowedWeight}%)`);
      setTimeout(() => setValidationError(null), 5000);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader className="h-5 w-5 animate-spin mr-2" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-500 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-4" />
        <p className="text-lg mb-2">Error loading activities</p>
        <p className="text-sm">Failed to load main activities. Please try again.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  // If there are no activities yet, show empty state
  if (filteredActivities.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Activity Weight Distribution (65% Rule)
            </h3>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Initiative Weight</p>
              <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Max Allowed (65%)</p>
              <p className="text-2xl font-semibold text-blue-600">{maxAllowedWeight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-semibold text-green-600">{maxAllowedWeight}%</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 flex items-center">
              <Info className="h-4 w-4 mr-2" />
              <strong>65% Rule:</strong> Total main activities weight must not exceed {maxAllowedWeight}% 
              (65% of initiative weight {initiativeWeight}%).
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-gray-700">Main Activities</h3>
        </div>

        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
          <Activity className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Main Activities Found</h3>
          <p className="text-gray-500 mb-4">
            No main activities have been created yet for this initiative.
          </p>
          {isUserPlanner && (
            <button 
              onClick={() => onEditActivity({} as MainActivity)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Create First Main Activity
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Activity Weight Distribution (65% Rule)
          </h3>
          <Activity className="h-5 w-5 text-gray-400" />
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Initiative Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Current Total</p>
            <p className="text-2xl font-semibold text-orange-600">{totalActivitiesWeight.toFixed(1)}%</p>
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
            <strong>65% Rule:</strong> Total activities weight must not exceed {maxAllowedWeight}% 
            (65% of initiative weight {initiativeWeight}%).
          </p>
        </div>

        {!isWeightValid && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Activities weight exceeds maximum allowed by {Math.abs(remainingWeight).toFixed(1)}%</p>
          </div>
        )}

        {isWeightValid && totalActivitiesWeight > 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">Activity weights are within the allowed limit</p>
          </div>
        )}

        {/* Validation Messages */}
        {validationSuccess && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">{validationSuccess}</p>
          </div>
        )}

        {validationError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{validationError}</p>
          </div>
        )}

        {isUserPlanner && filteredActivities.length > 0 && (
          <div className="mt-4">
            <button
              onClick={handleValidateActivities}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Validate Activities Weight ({totalActivitiesWeight.toFixed(1)}% / {maxAllowedWeight}%)
            </button>
          </div>
        )}
      </div>

      {/* Main Activities List */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            Activities ({filteredActivities.length})
          </span>
          Main Activities
        </h3>
        
        {filteredActivities.map((activity) => {
          // Calculate budget summary from sub-activities
          const subActivities = activity.sub_activities || [];
          const totalBudget = subActivities.reduce((sum, sub) => {
            const cost = sub.budget_calculation_type === 'WITH_TOOL' 
              ? Number(sub.estimated_cost_with_tool || 0)
              : Number(sub.estimated_cost_without_tool || 0);
            return sum + cost;
          }, 0);
          
          const totalFunding = subActivities.reduce((sum, sub) => {
            return sum + Number(sub.government_treasury || 0) + 
                       Number(sub.sdg_funding || 0) + 
                       Number(sub.partners_funding || 0) + 
                       Number(sub.other_funding || 0);
          }, 0);
          
          const fundingGap = Math.max(0, totalBudget - totalFunding);

          return (
            <div
              key={activity.id}
              onClick={() => onSelectActivity && onSelectActivity(activity)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-orange-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <Activity className="h-5 w-5 text-orange-600 mr-2" />
                  <h4 className="font-medium text-gray-900">{activity.name}</h4>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-orange-600">
                    {activity.weight}%
                  </span>
                </div>
              </div>

              {activity.organization_name && (
                <div className="mb-2 flex items-center text-sm text-gray-600">
                  <Building2 className="h-4 w-4 mr-1 text-gray-500" />
                  <span>{activity.organization_name}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs text-gray-500">
                <div>Baseline: {activity.baseline || 'N/A'}</div>
                <div>Annual: {activity.annual_target || 0}</div>
                <div>Q1: {activity.q1_target || 0}</div>
                <div>Q2: {activity.q2_target || 0}</div>
                <div>Q3: {activity.q3_target || 0}</div>
                <div>Q4: {activity.q4_target || 0}</div>
                <div>Sub-activities: {subActivities.length}</div>
                <div>Type: {activity.target_type || 'cumulative'}</div>
              </div>

              {/* Budget Summary */}
              {totalBudget > 0 && (
                <div className="mt-3 p-2 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-gray-600">Budget:</span>
                    </div>
                    <div className="flex space-x-3">
                      <span className="text-gray-700">Required: ${totalBudget.toLocaleString()}</span>
                      <span className="text-blue-600">Available: ${totalFunding.toLocaleString()}</span>
                      {fundingGap > 0 && (
                        <span className="text-red-600">Gap: ${fundingGap.toLocaleString()}</span>
                      )}
                      {fundingGap === 0 && totalBudget > 0 && (
                        <span className="text-green-600">Fully Funded</span>
                      )}
                    </div>
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
                      className="text-xs text-orange-600 hover:text-orange-800 flex items-center"
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

      {/* Add activity button */}
      {isUserPlanner && (
        <div className="mt-4 text-center">
          <button 
            onClick={() => onEditActivity({} as MainActivity)}
            disabled={remainingWeight <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {filteredActivities.length === 0 ? 'Create First Main Activity' : 
             remainingWeight <= 0 ? `No Weight Available (${remainingWeight.toFixed(1)}%)` :
             'Create New Main Activity'}
          </button>
          
          {remainingWeight <= 0 && totalActivitiesWeight < maxAllowedWeight && (
            <p className="mt-2 text-xs text-amber-600">
              Cannot add more activities. Reached weight limit of {maxAllowedWeight}%.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MainActivityList;