import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, auth, subActivities } from '../lib/api';
import { Activity, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, DollarSign, Building2, Info, Loader, Eye, X, Calculator } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity } from '../types/organization';
import { isPlanner } from '../types/user';
import ActivityBudgetForm from './ActivityBudgetForm';
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

const ACTIVITY_TYPES = [
  { value: 'Training', label: 'Training', icon: '📚', description: 'Training activities and capacity building' },
  { value: 'Meeting', label: 'Meeting', icon: '👥', description: 'Meetings and workshops' },
  { value: 'Workshop', label: 'Workshop', icon: '🔧', description: 'Workshops and working sessions' },
  { value: 'Printing', label: 'Printing', icon: '🖨️', description: 'Printing and documentation' },
  { value: 'Procurement', label: 'Procurement', icon: '📦', description: 'Procurement and purchasing' },
  { value: 'Supervision', label: 'Supervision', icon: '👁️', description: 'Supervision and monitoring' },
  { value: 'Other', label: 'Other', icon: '⚙️', description: 'Other activities' }
];

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
  const [activitiesCount, setActivitiesCount] = useState(0);
  
  // Modal states
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  const [showActivityTypeModal, setShowActivityTypeModal] = useState(false);
  const [showCostingModal, setShowCostingModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedActivityType, setSelectedActivityType] = useState<string>('');
  const [selectedSubActivity, setSelectedSubActivity] = useState<any>(null);
  const [costingToolData, setCostingToolData] = useState<any>(null);

  // Get user data on mount
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

  // Fetch main activities with proper caching and refresh
  const { data: activitiesList, isLoading, error, refetch } = useQuery({
    queryKey: ['main-activities', initiativeId],
    queryFn: async () => {
      if (!initiativeId) {
        console.log('No initiativeId provided, returning empty data');
        return { data: [] };
      }
      
      console.log(`Fetching main activities for initiative ${initiativeId}`);
      try {
        const response = await mainActivities.getByInitiative(initiativeId);
        const activities = response?.data || [];
        console.log(`Successfully fetched ${activities.length} main activities`);
        
        // Update activities count for immediate display detection
        setActivitiesCount(activities.length);
        
        return response;
      } catch (error) {
        console.error('Error fetching main activities:', error);
        throw error;
      }
    },
    enabled: !!initiativeId,
    staleTime: 1000, // Cache for 1 second
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 2
  });

  // Force refetch when external changes occur
  useEffect(() => {
    if (refreshKey > 0) {
      console.log('External refresh triggered, refetching activities');
      refetch();
    }
  }, [refreshKey, refetch]);

  // Create sub-activity mutation with immediate cache update
  const createSubActivityMutation = useMutation({
    mutationFn: (subActivityData: any) => subActivities.create(subActivityData),
    onMutate: async () => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['main-activities', initiativeId] });
    },
    onSuccess: () => {
      console.log('Sub-activity created successfully, updating cache');
      // Invalidate and refetch the main activities
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      // Force immediate refetch
      refetch();
      closeAllModals();
    },
    onError: (error) => {
      console.error('Failed to create sub-activity:', error);
      // Refetch to ensure we have the latest data
      refetch();
    }
  });

  // Update sub-activity mutation with immediate cache update
  const updateSubActivityMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => subActivities.update(id, data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['main-activities', initiativeId] });
    },
    onSuccess: () => {
      console.log('Sub-activity updated successfully, updating cache');
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      refetch();
      closeAllModals();
    },
    onError: (error) => {
      console.error('Failed to update sub-activity:', error);
      refetch();
    }
  });

  // Delete activity mutation with immediate cache update
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => mainActivities.delete(activityId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['main-activities', initiativeId] });
    },
    onSuccess: () => {
      console.log('Activity deleted successfully, updating cache');
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      refetch();
    },
    onError: (error) => {
      console.error('Failed to delete activity:', error);
      refetch();
    }
  });

  // Manual refresh function
  const handleManualRefresh = () => {
    console.log('Manual refresh triggered');
    refetch();
  };

  // Safe data access with detailed logging
  const activitiesData = activitiesList?.data;
  console.log('MainActivityList render - Raw data:', {
    activitiesList: activitiesList ? 'exists' : 'null',
    activitiesData: activitiesData ? `${Array.isArray(activitiesData) ? activitiesData.length : 'not array'} items` : 'null',
    userOrgId,
    initiativeId
  });

  // Ensure we have valid array data
  const safeActivitiesData = Array.isArray(activitiesData) ? activitiesData : [];

  // Filter activities based on user organization with detailed logging
  const filteredActivities = safeActivitiesData.filter(activity => {
    if (!activity) {
      console.log('Skipping null/undefined activity');
      return false;
    }
    
    const belongsToUserOrg = !activity.organization || activity.organization === userOrgId;
    
    console.log(`Activity "${activity.name}": organization=${activity.organization}, userOrg=${userOrgId}, belongs=${belongsToUserOrg}`);
    
    return belongsToUserOrg;
  });

  console.log(`MainActivityList: Showing ${filteredActivities.length} of ${safeActivitiesData.length} activities for user org ${userOrgId}`);

  // Close all modals
  const closeAllModals = () => {
    setShowActivityTypeModal(false);
    setShowCostingModal(false);
    setShowBudgetModal(false);
    setShowViewModal(false);
    setSelectedActivity(null);
    setSelectedSubActivity(null);
    setSelectedActivityType('');
    setCostingToolData(null);
  };

  // Handle add sub-activity click - Step 1: Show activity types
  const handleAddSubActivity = (activity: MainActivity) => {
    console.log('Adding sub-activity to:', activity.name);
    setSelectedActivity(activity);
    setSelectedSubActivity(null); // Clear any existing sub-activity
    setShowActivityTypeModal(true);
  };

  // Handle activity type selection - Step 2: Show costing modal
  const handleActivityTypeSelect = (activityType: string) => {
    console.log('Activity type selected:', activityType);
    setSelectedActivityType(activityType);
    setShowActivityTypeModal(false);
    
    // For 'Other' type, skip costing tool and go directly to budget form
    if (activityType === 'Other') {
      setCostingToolData({
        totalBudget: 0,
        estimated_cost_with_tool: 0,
        activity_type: activityType
      });
      setShowBudgetModal(true);
    } else {
      setShowCostingModal(true);
    }
  };

  // Handle costing calculation - Step 3: Show budget form
  const handleCostingCalculation = (costingData: any) => {
    console.log('Costing calculation completed:', costingData);
    setCostingToolData({
      ...costingData,
      activity_type: selectedActivityType
    });
    setShowCostingModal(false);
    setShowBudgetModal(true);
  };

  // Handle budget form submission - Step 4: Save sub-activity
  const handleBudgetSubmit = async (budgetData: any) => {
    try {
      console.log('Submitting budget data for sub-activity');
      
      const subActivityData = {
        main_activity: selectedActivity?.id,
        name: budgetData.name || `${selectedActivityType} Activity`,
        activity_type: selectedActivityType,
        description: budgetData.description || '',
        budget_calculation_type: costingToolData ? 'WITH_TOOL' : 'WITHOUT_TOOL',
        estimated_cost_with_tool: costingToolData?.totalBudget || 0,
        estimated_cost_without_tool: budgetData.estimated_cost_without_tool || 0,
        government_treasury: budgetData.government_treasury || 0,
        sdg_funding: budgetData.sdg_funding || 0,
        partners_funding: budgetData.partners_funding || 0,
        other_funding: budgetData.other_funding || 0,
        training_details: costingToolData?.training_details || budgetData.training_details,
        meeting_workshop_details: costingToolData?.meeting_workshop_details || budgetData.meeting_workshop_details,
        procurement_details: costingToolData?.procurement_details || budgetData.procurement_details,
        printing_details: costingToolData?.printing_details || budgetData.printing_details,
        supervision_details: costingToolData?.supervision_details || budgetData.supervision_details,
        partners_details: budgetData.partners_details
      };

      console.log('Creating sub-activity with data:', subActivityData);
      
      if (selectedSubActivity) {
        await updateSubActivityMutation.mutateAsync({
          id: selectedSubActivity.id,
          data: subActivityData
        });
      } else {
        await createSubActivityMutation.mutateAsync(subActivityData);
      }
    } catch (error) {
      console.error('Error saving sub-activity:', error);
      throw error;
    }
  };

  // Handle view sub-activity - Show view modal
  const handleViewSubActivity = (activity: MainActivity, subActivity: any, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Viewing sub-activity:', subActivity.name);
    setSelectedActivity(activity);
    setSelectedSubActivity(subActivity);
    setShowViewModal(true);
  };

  // Handle edit sub-activity - Start edit flow
  const handleEditSubActivity = (activity: MainActivity, subActivity: any) => {
    console.log('Editing sub-activity:', subActivity.name);
    setSelectedActivity(activity);
    setSelectedSubActivity(subActivity);
    setSelectedActivityType(subActivity.activity_type || 'Other');
    
    // If it has costing tool data, show costing modal first
    if (subActivity.budget_calculation_type === 'WITH_TOOL') {
      setCostingToolData({
        totalBudget: subActivity.estimated_cost_with_tool,
        activity_type: subActivity.activity_type,
        training_details: subActivity.training_details,
        meeting_workshop_details: subActivity.meeting_workshop_details,
        procurement_details: subActivity.procurement_details,
        printing_details: subActivity.printing_details,
        supervision_details: subActivity.supervision_details
      });
      setShowCostingModal(true);
    } else {
      // Go directly to budget form for manual entries
      setShowBudgetModal(true);
    }
  };

  // Handle main activity deletion
  const handleDeleteActivity = (activityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this activity? This will also delete all sub-activities. This action cannot be undone.')) {
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

  // Check if activities data is valid
  if (!Array.isArray(safeActivitiesData)) {
    console.warn('MainActivityList: Activities data is not an array:', activitiesData);
  }

  // Filter activities based on user organization with better logging
  const filteredActivities = safeActivitiesData.filter(activity => {
    if (!activity) {
      console.log('MainActivityList: Skipping null/undefined activity');
      return false;
    }
    
    // More permissive filtering - show if no organization set OR belongs to user org
    const hasNoOrg = !activity.organization;
    const belongsToUserOrg = activity.organization === userOrgId;
    const shouldShow = hasNoOrg || belongsToUserOrg;
    
    console.log(`MainActivityList: Activity "${activity.name}": org=${activity.organization}, userOrg=${userOrgId}, hasNoOrg=${hasNoOrg}, belongsToUserOrg=${belongsToUserOrg}, shouldShow=${shouldShow}`);
    
    return shouldShow;
  });

  console.log(`MainActivityList: Final result - showing ${filteredActivities.length} of ${safeActivitiesData.length} activities for initiative ${initiativeId}`);

  // Calculate weight totals
  const totalActivitiesWeight = filteredActivities.reduce((sum, activity) => 
    sum + (Number(activity.weight) || 0), 0
  );
  
  const maxAllowedWeight = parseFloat((initiativeWeight * 0.65).toFixed(2));
  const remainingWeight = parseFloat((maxAllowedWeight - totalActivitiesWeight).toFixed(2));
  const isWeightValid = totalActivitiesWeight <= maxAllowedWeight;

  // Render costing tool based on activity type
  const renderCostingTool = () => {
    const costingProps = {
      onCalculate: handleCostingCalculation,
      onCancel: () => setShowCostingModal(false),
      initialData: selectedSubActivity
    };

    switch (selectedActivityType) {
      case 'Training':
        return <TrainingCostingTool {...costingProps} />;
      case 'Meeting':
      case 'Workshop':
        return <MeetingWorkshopCostingTool {...costingProps} />;
      case 'Printing':
        return <PrintingCostingTool {...costingProps} />;
      case 'Procurement':
        return <ProcurementCostingTool {...costingProps} />;
      case 'Supervision':
        return <SupervisionCostingTool {...costingProps} />;
      default:
        return null;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader className="h-5 w-5 animate-spin mr-2" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center p-8 text-red-500 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-4" />
        <p className="text-lg mb-2">Error loading activities</p>
        <p className="text-sm">Failed to load main activities. Please try again.</p>
        <button
          onClick={handleManualRefresh}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Empty state
  if (filteredActivities.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Activity Weight Distribution (65% Rule)
            </h3>
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-gray-400" />
              <button
                onClick={handleManualRefresh}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
                title="Refresh activities"
              >
                <Loader className="h-4 w-4" />
              </button>
            </div>
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

        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
          <Activity className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Main Activities Found</h3>
          <p className="text-gray-500 mb-4">
            No main activities have been created yet for this initiative.
          </p>
          <div className="flex justify-center space-x-3">
            <button
              onClick={handleManualRefresh}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center"
            >
              <Loader className="h-4 w-4 mr-2" />
              Check Again
            </button>
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Weight Distribution Card */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Activity Weight Distribution (65% Rule)
          </h3>
          <div className="flex items-center space-x-2">
            <Activity className="h-5 w-5 text-gray-400" />
            <button
              onClick={handleManualRefresh}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              title="Refresh activities"
            >
              <Loader className="h-4 w-4" />
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
            (65% of initiative weight {initiativeWeight}%). Currently showing {filteredActivities.length} activities.
          </p>
        </div>

        {!isWeightValid && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Activities weight exceeds maximum allowed by {Math.abs(remainingWeight).toFixed(1)}%</p>
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
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
            >
              Validate Activities Weight ({totalActivitiesWeight.toFixed(1)}% / {maxAllowedWeight}%)
            </button>
          </div>
        )}
      </div>

      {/* Main Activities List */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            Activities ({filteredActivities.length})
          </span>
          Main Activities
        </h3>
        
        {filteredActivities.map((activity) => {
          const subActivitiesList = activity.sub_activities || [];
          
          // Calculate budget summary from sub-activities
          const totalBudget = subActivitiesList.reduce((sum, sub) => {
            const cost = sub.budget_calculation_type === 'WITH_TOOL' 
              ? Number(sub.estimated_cost_with_tool || 0)
              : Number(sub.estimated_cost_without_tool || 0);
            return sum + cost;
          }, 0);
          
          const totalFunding = subActivitiesList.reduce((sum, sub) => {
            return sum + Number(sub.government_treasury || 0) + 
                       Number(sub.sdg_funding || 0) + 
                       Number(sub.partners_funding || 0) + 
                       Number(sub.other_funding || 0);
          }, 0);
          
          const fundingGap = Math.max(0, totalBudget - totalFunding);

          return (
            <div
              key={activity.id}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200"
            >
              {/* Main Activity Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <Activity className="h-5 w-5 text-orange-600 mr-2" />
                  <div>
                    <h4 className="font-medium text-gray-900">{activity.name}</h4>
                    <div className="flex items-center mt-1 space-x-3">
                      <span className="text-sm font-medium text-orange-600">{activity.weight}%</span>
                      {activity.organization_name && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Building2 className="h-3 w-3 mr-1" />
                          <span>{activity.organization_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Main Activity Edit/Delete Buttons - OUTSIDE sub-activity container */}
                {isUserPlanner && (
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditActivity(activity);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center px-2 py-1 border border-blue-200 rounded"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit Activity
                    </button>
                    <button
                      onClick={(e) => handleDeleteActivity(activity.id, e)}
                      disabled={deleteActivityMutation.isPending}
                      className="text-sm text-red-600 hover:text-red-800 flex items-center px-2 py-1 border border-red-200 rounded disabled:opacity-50"
                    >
                      {deleteActivityMutation.isPending ? (
                        <Loader className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      Delete Activity
                    </button>
                  </div>
                )}
              </div>

              {/* Activity Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 text-xs text-gray-500">
                <div>Baseline: {activity.baseline || 'N/A'}</div>
                <div>Annual: {activity.annual_target || 0}</div>
                <div>Q1: {activity.q1_target || 0}</div>
                <div>Q2: {activity.q2_target || 0}</div>
                <div>Q3: {activity.q3_target || 0}</div>
                <div>Q4: {activity.q4_target || 0}</div>
                <div>Type: {activity.target_type || 'cumulative'}</div>
                <div>Sub-activities: {subActivitiesList.length}</div>
              </div>

              {/* Budget Summary */}
              {totalBudget > 0 && (
                <div className="mb-3 p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                      <span className="text-gray-600">Total Budget:</span>
                    </div>
                    <div className="flex space-x-4">
                      <span className="text-gray-700">Required: ${totalBudget.toLocaleString()}</span>
                      <span className="text-blue-600">Available: ${totalFunding.toLocaleString()}</span>
                      {fundingGap > 0 ? (
                        <span className="text-red-600">Gap: ${fundingGap.toLocaleString()}</span>
                      ) : totalBudget > 0 ? (
                        <span className="text-green-600">Fully Funded</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-activities Section */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-medium text-gray-600">
                    Sub-activities ({subActivitiesList.length})
                  </h5>
                  {isUserPlanner && (
                    <button
                      onClick={() => handleAddSubActivity(activity)}
                      className="text-sm text-green-600 hover:text-green-800 flex items-center px-2 py-1 border border-green-200 rounded"
                    >
                      <PlusCircle className="h-4 w-4 mr-1" />
                      Add Sub-activity
                    </button>
                  )}
                </div>

                {subActivitiesList.length === 0 ? (
                  <div className="text-center p-4 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                    <p className="text-sm text-gray-500">No sub-activities created yet</p>
                    {isUserPlanner && (
                      <button
                        onClick={() => handleAddSubActivity(activity)}
                        className="mt-2 text-sm text-green-600 hover:text-green-800"
                      >
                        Click here to add the first sub-activity
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {subActivitiesList.map((subActivity) => (
                      <div
                        key={subActivity.id}
                        onClick={(e) => handleViewSubActivity(activity, subActivity, e)}
                        className="p-3 bg-white border border-gray-200 rounded hover:border-blue-300 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{subActivity.name}</span>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs bg-blue-100 px-2 py-0.5 rounded text-blue-800">
                                  {subActivity.activity_type}
                                </span>
                                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                                  {subActivity.budget_calculation_type === 'WITH_TOOL' ? 'Tool' : 'Manual'}
                                </span>
                              </div>
                            </div>
                            
                            {subActivity.description && (
                              <p className="text-xs text-gray-500 mt-1">{subActivity.description}</p>
                            )}
                            
                            <div className="flex items-center justify-between mt-2">
                              <div className="text-xs text-gray-600">
                                Budget: ${subActivity.budget_calculation_type === 'WITH_TOOL' 
                                  ? Number(subActivity.estimated_cost_with_tool || 0).toLocaleString()
                                  : Number(subActivity.estimated_cost_without_tool || 0).toLocaleString()
                                }
                              </div>
                              
                              <div className="flex space-x-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewSubActivity(activity, subActivity, e);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View
                                </button>
                                {isUserPlanner && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditSubActivity(activity, subActivity);
                                    }}
                                    className="text-xs text-green-600 hover:text-green-800 flex items-center"
                                  >
                                    <Edit className="h-3 w-3 mr-1" />
                                    Edit
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add main activity button */}
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
        </div>
      )}

      {/* Activity Type Selection Modal */}
      {showActivityTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Select Activity Type - {selectedActivity?.name}
                </h3>
                <button
                  onClick={closeAllModals}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {ACTIVITY_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => handleActivityTypeSelect(type.value)}
                    className="p-4 text-left border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center mb-2">
                      <span className="text-2xl mr-3">{type.icon}</span>
                      <h4 className="font-medium text-gray-900">{type.label}</h4>
                    </div>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Costing Tool Modal */}
      {showCostingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <Calculator className="h-5 w-5 mr-2 text-blue-600" />
                  {selectedActivityType} Cost Calculator - {selectedActivity?.name}
                </h3>
                <button
                  onClick={closeAllModals}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              {renderCostingTool()}
            </div>
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      {showBudgetModal && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {selectedSubActivity ? 'Edit' : 'Add'} Sub-Activity Budget - {selectedActivity.name}
              </h3>
              
              <ActivityBudgetForm
                activity={selectedActivity}
                budgetCalculationType={costingToolData ? 'WITH_TOOL' : 'WITHOUT_TOOL'}
                activityType={selectedActivityType || null}
                onSubmit={handleBudgetSubmit}
                initialData={selectedSubActivity}
                costingToolData={costingToolData}
                onCancel={closeAllModals}
                isSubmitting={createSubActivityMutation.isPending || updateSubActivityMutation.isPending}
              />
            </div>
          </div>
        </div>
      )}

      {/* View Sub-Activity Modal */}
      {showViewModal && selectedSubActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Sub-Activity Details - {selectedSubActivity.name}
                </h3>
                <button
                  onClick={closeAllModals}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Activity Type</label>
                    <p className="text-gray-900">{selectedSubActivity.activity_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Calculation Method</label>
                    <p className="text-gray-900">
                      {selectedSubActivity.budget_calculation_type === 'WITH_TOOL' ? 'Using Costing Tool' : 'Manual Entry'}
                    </p>
                  </div>
                </div>

                {selectedSubActivity.description && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Description</label>
                    <p className="text-gray-900">{selectedSubActivity.description}</p>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-md font-medium text-gray-900 mb-3">Budget Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Estimated Cost</label>
                      <p className="text-lg font-semibold text-green-600">
                        ${selectedSubActivity.budget_calculation_type === 'WITH_TOOL' 
                          ? Number(selectedSubActivity.estimated_cost_with_tool || 0).toLocaleString()
                          : Number(selectedSubActivity.estimated_cost_without_tool || 0).toLocaleString()
                        }
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Total Funding</label>
                      <p className="text-lg font-semibold text-blue-600">
                        ${(
                          Number(selectedSubActivity.government_treasury || 0) +
                          Number(selectedSubActivity.sdg_funding || 0) +
                          Number(selectedSubActivity.partners_funding || 0) +
                          Number(selectedSubActivity.other_funding || 0)
                        ).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Government Treasury:</span>
                      <span>${Number(selectedSubActivity.government_treasury || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">SDG Funding:</span>
                      <span>${Number(selectedSubActivity.sdg_funding || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Partners Funding:</span>
                      <span>${Number(selectedSubActivity.partners_funding || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Other Funding:</span>
                      <span>${Number(selectedSubActivity.other_funding || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={closeAllModals}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close
                  </button>
                  {isUserPlanner && (
                    <button
                      onClick={() => {
                        setShowViewModal(false);
                        handleEditSubActivity(selectedActivity!, selectedSubActivity);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                    >
                      Edit Sub-Activity
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainActivityList;