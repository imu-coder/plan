import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mainActivities, subActivities, activityBudgets } from '../lib/api';
import { BarChart3, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, Building2, Info, DollarSign, Eye, Plus, Settings, Activity, Calculator } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { MainActivity, SubActivity, ActivityType } from '../types/plan';
import { auth } from '../lib/api';
import { isPlanner } from '../types/user';
import TrainingCostingTool from './TrainingCostingTool';
import MeetingWorkshopCostingTool from './MeetingWorkshopCostingTool';
import PrintingCostingTool from './PrintingCostingTool';
import ProcurementCostingTool from './ProcurementCostingTool';
import SupervisionCostingTool from './SupervisionCostingTool';
import ActivityBudgetForm from './ActivityBudgetForm';

interface MainActivityListProps {
  initiativeId: string;
  initiativeWeight: number;
  onEditActivity: (activity: MainActivity) => void;
  onSelectActivity?: (activity: MainActivity) => void;
  onAddBudget?: (activity: MainActivity) => void;
  onViewBudget?: (activity: MainActivity) => void;
  onEditBudget?: (activity: MainActivity) => void;
  isNewPlan?: boolean;
  planKey?: string;
  isUserPlanner: boolean;
  userOrgId: number | null;
  onDeleteBudget?: (activityId: string) => void;
}

const MainActivityList: React.FC<MainActivityListProps> = ({ 
  initiativeId,
  initiativeWeight,
  onEditActivity,
  onSelectActivity,
  onAddBudget,
  onViewBudget,
  onEditBudget,
  isNewPlan = false,
  planKey = 'default',
  isUserPlanner,
  userOrgId,
  onDeleteBudget
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedActivityType, setSelectedActivityType] = useState<ActivityType | null>(null);
  const [showCostingTool, setShowCostingTool] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [selectedSubActivity, setSelectedSubActivity] = useState<any>(null);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [costingToolData, setCostingToolData] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingSubActivity, setEditingSubActivity] = useState<any>(null);

  // Fetch current user role and organization
  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: auth.getCurrentUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch all main activities for the given initiative
  const { data: activitiesList, isLoading, refetch } = useQuery({
    queryKey: ['main-activities', initiativeId, planKey, refreshKey],
    queryFn: async () => {
      if (!initiativeId) {
        console.log('Missing initiativeId, cannot fetch main activities');
        return { data: [] };
      }
      
      console.log(`Fetching main activities for initiative ${initiativeId}`);
      const response = await mainActivities.getByInitiative(initiativeId);
      console.log('Fetched main activities:', response.data);
      return response;
    },
    enabled: !!initiativeId,
    staleTime: 0,
    cacheTime: 0,
  });

  // Delete activity mutation
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => mainActivities.delete(activityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId, planKey] });
    }
  });

  // Delete sub-activity mutation
  const deleteSubActivityMutation = useMutation({
    mutationFn: (subActivityId: string) => subActivities.delete(subActivityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId, planKey] });
      forceRefresh();
    }
  });

  // Force refresh function
  const forceRefresh = () => {
    setRefreshKey(prev => prev + 1);
    refetch();
  };

  // Calculate budget for each activity
  const calculateActivityBudget = (activity: any) => {
    let budgetRequired = 0;
    let government = 0;
    let partners = 0;
    let sdg = 0;
    let other = 0;
    
    console.log('Calculating budget for activity:', activity.name);
    console.log('Sub-activities:', activity.sub_activities?.length || 0);
    console.log('Legacy budget:', activity.budget ? 'exists' : 'none');

    try {
      // Calculate budget from sub-activities if they exist
      if (activity.sub_activities && activity.sub_activities.length > 0) {
        console.log('Using sub-activities for budget calculation');
        activity.sub_activities.forEach((subActivity: any) => {
          console.log('Processing sub-activity:', subActivity.name || 'Unnamed', subActivity);
            
          // Use direct fields from SubActivity model
          const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
            ? Number(subActivity.estimated_cost_with_tool || 0)
            : Number(subActivity.estimated_cost_without_tool || 0);
            
          const subGov = Number(subActivity.government_treasury || 0);
          const subPartners = Number(subActivity.partners_funding || 0);
          const subSdg = Number(subActivity.sdg_funding || 0);
          const subOther = Number(subActivity.other_funding || 0);
            
          console.log('Sub-activity budget details:', {
            name: subActivity.name,
            cost: subCost,
            government: subGov,
            partners: subPartners,
            sdg: subSdg,
            other: subOther
          });
            
          budgetRequired += subCost;
          government += subGov;
          partners += subPartners;
          sdg += subSdg;
          other += subOther;
        });
      } else if (activity.budget) {
        console.log('Using legacy budget for calculation');
        // Use legacy budget if no sub-activities
        budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL' 
          ? Number(activity.budget.estimated_cost_with_tool || 0)
          : Number(activity.budget.estimated_cost_without_tool || 0);
        
        government = Number(activity.budget.government_treasury || 0);
        partners = Number(activity.budget.partners_funding || 0);
        sdg = Number(activity.budget.sdg_funding || 0);
        other = Number(activity.budget.other_funding || 0);
      }

      const totalAvailable = government + partners + sdg + other;
      const gap = Math.max(0, budgetRequired - totalAvailable);
      
      console.log('Final budget calculation:', {
        budgetRequired,
        totalAvailable,
        government,
        partners,
        sdg,
        other,
        gap
      });
    } catch (error) {
      console.error('Error calculating activity budget:', error);
    }

    return {
      budgetRequired,
      totalAvailable: government + partners + sdg + other,
      government,
      partners,
      sdg,
      other,
      gap: Math.max(0, budgetRequired - (government + partners + sdg + other))
    };
  };

  // Calculate modal budget data
  const modalBudgetData = selectedActivity ? calculateActivityBudget(selectedActivity) : {
    budgetRequired: 0,
    government: 0,
    partners: 0,
    sdg: 0,
    other: 0,
    totalAvailable: 0,
    gap: 0
  };
  
  // Add effect to refresh modal data when sub-activities change
  useEffect(() => {
    if (selectedActivity) {
      // Refetch the specific activity data to get updated sub-activities
      const refreshActivityData = async () => {
        try {
          console.log('Refreshing activity data for modal');
          await refetch();
        } catch (error) {
          console.error('Failed to refresh activity data:', error);
        }
      };
      
      refreshActivityData();
    }
  }, [selectedActivity?.sub_activities?.length, refetch]);

  const handleSelectActivity = (activity: any) => {
    console.log('Selected activity:', activity);
    setSelectedActivity(activity);
    setShowModal(true);
    setIsViewOnly(!isUserPlanner);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedActivity(null);
    setSelectedActivityType(null);
    setShowCostingTool(false);
    setShowBudgetForm(false);
    setSelectedSubActivity(null);
    setCostingToolData(null);
    setEditingSubActivity(null);
  };

  const handleCreateSubActivity = (activityType: ActivityType, activity: any) => {
    console.log('Creating sub-activity of type:', activityType);
    setSelectedActivity(activity);
    setSelectedActivityType(activityType);
    setShowCostingTool(true); // Show costing tool first
    setShowBudgetForm(false);
    setEditingSubActivity(null);
  };

  const handleCostingComplete = (costingData: any) => {
    console.log('Costing tool completed with data:', costingData);
    setCostingToolData(costingData);
    setShowCostingTool(false);
    setShowBudgetForm(true); // Now show budget form
  };

  const handleCostingCancel = () => {
    setShowCostingTool(false);
    setSelectedActivityType(null);
    setCostingToolData(null);
    setEditingSubActivity(null);
  };

  const handleSubActivitySaved = async (subActivityData: any) => {
    try {
      console.log('Saving sub-activity with data:', subActivityData);
      const response = await subActivities.create(subActivityData);
      console.log('Sub-activity created response:', response);
      
      // Force refresh data
      forceRefresh();
      await refetch();
      
      // Invalidate queries to force fresh data
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      
      setShowBudgetForm(false);
      setSelectedActivityType(null);
      setCostingToolData(null);
      setEditingSubActivity(null);
      
      // Close modal and reopen with fresh data
      setTimeout(() => {
        refetch().then(() => {
      // Force immediate data refresh
          // Find the updated activity and reopen modal
          const refreshedActivity = activitiesList?.data?.find(act => act.id === selectedActivity.id);
          if (refreshedActivity) {
            setSelectedActivity(refreshedActivity);
            setShowModal(true);
          }
        });
      }, 500);
    } catch (error) {
      console.error('Failed to save sub-activity:', error);
      // Wait a moment for data to be saved, then refresh modal
      setTimeout(async () => {
        try {
          const refreshedData = await refetch();
          const updatedActivity = refreshedData.data?.data?.find(act => act.id === selectedActivity.id);
          
          if (updatedActivity) {
            console.log('Modal updated with fresh data - sub-activities count:', updatedActivity.sub_activities?.length || 0);
            setSelectedActivity(updatedActivity);
          }
        } catch (error) {
          console.error('Error refreshing modal data:', error);
        }
      }, 500);
    }
  };

  const handleDeleteSubActivity = async (subActivityId: string) => {
    if (window.confirm('Are you sure you want to delete this sub-activity? This action cannot be undone.')) {
      try {
        await deleteSubActivityMutation.mutateAsync(subActivityId);
        
        // Refresh modal data
        setTimeout(() => {
          // Wait for deletion to complete, then refresh modal
          setTimeout(async () => {
            try {
              const refreshedData = await refetch();
              const updatedActivity = refreshedData.data?.data?.find(act => act.id === selectedActivity.id);
              
              if (updatedActivity) {
                setSelectedActivity(updatedActivity);
              }
            } catch (error) {
              console.error('Error refreshing after deletion:', error);
            }
          }, 500);
        }, 500);
      } catch (error) {
        console.error('Failed to delete sub-activity:', error);
      }
    }
  };

  const handleDeleteActivity = (activityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this main activity? This will also delete all sub-activities and budgets. This action cannot be undone.')) {
      deleteActivityMutation.mutate(activityId);
    }
  };

  if (isLoading && initiativeId) {
    return <div className="text-center p-4">{t('common.loading')}</div>;
  }

  if (!activitiesList?.data) {
    return null;
  }

  console.log('Main activities data:', activitiesList.data);

  // Filter activities based on user organization
  const filteredActivities = (activitiesList.data || []).filter(activity => 
    !activity.organization || activity.organization === userOrgId
  );
  
  console.log('MainActivityList: Weight calculation debug:', {
    totalActivities: activitiesList.data?.length || 0,
    filteredActivities: filteredActivities.length,
    userOrgId,
    initiativeWeight
  });
  
  const total_activities_weight = filteredActivities.reduce((sum, activity) => 
    sum + (Number(activity.weight) || 0), 0
  );
  
  const expected_activities_weight = parseFloat((initiativeWeight * 0.65).toFixed(2));
  const remaining_weight = expected_activities_weight - total_activities_weight;
  
  console.log('MainActivityList: Final weight calculation:', {
    initiativeWeight,
    expected_activities_weight,
    total_activities_weight,
    remaining_weight,
    filteredActivitiesCount: filteredActivities.length
  });
  
  const is_valid = Math.abs(total_activities_weight - expected_activities_weight) < 0.01;

  // If there are no activities yet, show empty state
  if (filteredActivities.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              {t('planning.weightDistribution')}
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
              <p className="text-2xl font-semibold text-blue-600">{expected_activities_weight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-semibold text-green-600">{expected_activities_weight}%</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 flex items-center">
              <Info className="h-4 w-4 mr-2" />
              <strong>Important:</strong> Main activities must have a combined weight of exactly {expected_activities_weight}% 
              (65% of initiative weight {initiativeWeight}%).
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h3 className="text-sm font-medium text-gray-700">Main Activities</h3>
        </div>

        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
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
            {t('planning.weightDistribution')}
          </h3>
          <BarChart3 className="h-5 w-5 text-gray-400" />
        </div>
        
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-500">Initiative Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{initiativeWeight}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Current Total</p>
            <p className="text-2xl font-semibold text-green-600">{total_activities_weight.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Remaining</p>
            <p className={`text-2xl font-semibold ${is_valid ? 'text-green-600' : remaining_weight < 0 ? 'text-red-600' : 'text-amber-600'}`}>
              {remaining_weight.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            <strong>Target:</strong> Main activities must total exactly {expected_activities_weight}% 
            (65% of initiative weight {initiativeWeight}%).
          </p>
        </div>

        {remaining_weight < 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Over target by {Math.abs(remaining_weight).toFixed(1)}%. Please reduce existing activity weights.</p>
          </div>
        )}

        {is_valid && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">Weight distribution is perfect at {expected_activities_weight}%</p>
          </div>
        )}

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
      </div>

      {/* Main Activities List */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700 flex items-center">
          <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Activities ({filteredActivities.length})
          </span>
          Main Activities
        </h3>
        
        {filteredActivities.map((activity) => {
          const { budgetRequired, totalAvailable, gap } = calculateActivityBudget(activity);
          
          return (
            <div
              key={activity.id}
              onClick={() => handleSelectActivity(activity)}
              className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-green-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <h4 className="font-medium text-gray-900">{activity.name}</h4>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-green-600">
                    {activity.weight}%
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 text-xs text-gray-500">
                <div>Baseline: {activity.baseline || 'N/A'}</div>
                <div>Annual Target: {activity.annual_target || 0}</div>
                <div>Q1: {activity.q1_target || 0}</div>
                <div>Q2: {activity.q2_target || 0}</div>
                <div>Q3: {activity.q3_target || 0}</div>
                <div>Q4: {activity.q4_target || 0}</div>
              </div>
              
              {/* Budget Summary */}
              <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <DollarSign className="h-4 w-4 text-green-600 mr-1" />
                    <span className="text-sm font-medium text-gray-700">Budget Summary</span>
                  </div>
                  <div className="text-sm font-medium text-green-600">
                    Total: ${budgetRequired.toLocaleString()}
                  </div>
                </div>

                {/* Show sub-activities count if available */}
                {activity.sub_activities && activity.sub_activities.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Sub-Activities ({activity.sub_activities.length})</span>
                      <span className="text-xs text-blue-600">Funding: ${totalAvailable.toLocaleString()}</span>
                    </div>
                    
                    <div className="space-y-1">
                      {activity.sub_activities.slice(0, 3).map((subActivity: any) => {
                        // Calculate sub-activity budget using direct SubActivity fields
                        const subBudget = subActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(subActivity.estimated_cost_with_tool || 0)
                          : Number(subActivity.estimated_cost_without_tool || 0);
                        
                        const subTotalFunding = Number(subActivity.government_treasury || 0) +
                                              Number(subActivity.partners_funding || 0) +
                                              Number(subActivity.sdg_funding || 0) +
                                              Number(subActivity.other_funding || 0);
                        
                        return (
                          <div key={subActivity.id} className="flex justify-between items-center text-xs bg-white p-2 rounded border">
                            <div className="flex items-center">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                                {subActivity.activity_type}
                              </span>
                              <span className="text-gray-700 truncate max-w-32" title={subActivity.name}>
                                {subActivity.name}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="font-medium text-green-600">
                                ${subBudget.toLocaleString()}
                              </span>
                              <span className="text-blue-600 text-xs">
                                (F: ${subTotalFunding.toLocaleString()})
                              </span>
                              {isUserPlanner && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSubActivity(subActivity.id);
                                  }}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      {activity.sub_activities.length > 3 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{activity.sub_activities.length - 3} more sub-activities
                        </div>
                      )}
                    </div>
                    
                    {/* Summary Stats */}
                    <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <div>Budget Required: ${budgetRequired.toLocaleString()}</div>
                      <div>Funding Available: ${totalAvailable.toLocaleString()}</div>
                      <div className="col-span-2">
                        <span className={`font-medium ${gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          Gap: ${gap.toLocaleString()}
                          {gap <= 0 && ' (Fully Funded)'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 bg-gray-50 rounded border-2 border-dashed border-gray-200">
                    <div className="text-xs text-gray-500 italic mb-2">No sub-activities configured</div>
                    {isUserPlanner && (
                      <div className="grid grid-cols-2 gap-1">
                        {(['Training', 'Meeting', 'Workshop', 'Supervision'] as ActivityType[]).map((type) => (
                          <button
                            key={type}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateSubActivity(type, activity);
                            }}
                            className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 flex items-center justify-center"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {type}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex justify-end mt-2">
                {isUserPlanner ? (
                  <div className="flex space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditActivity(activity);
                      }}
                      className="text-xs text-green-600 hover:text-green-800 flex items-center px-2 py-1 bg-green-50 rounded"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </button>
                    
                    <button
                      onClick={(e) => handleDeleteActivity(activity.id, e)}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center px-2 py-1 bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 flex items-center px-2 py-1 bg-gray-50 rounded">
                    <Lock className="h-3 w-3 mr-1" />
                    Read Only
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
            disabled={remaining_weight <= 0.01}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {filteredActivities.length === 0 ? 'Create First Main Activity' : 
             remaining_weight <= 0.01 ? `No Weight Available (${remaining_weight.toFixed(1)}%)` :
             'Create New Main Activity'}
          </button>
          
          {remaining_weight <= 0.01 && total_activities_weight < expected_activities_weight && (
            <p className="mt-2 text-xs text-amber-600">
              Cannot add more activities. Total weight must equal exactly {expected_activities_weight.toFixed(2)}%.
            </p>
          )}
        </div>
      )}

      {/* Activity Detail Modal */}
      {showModal && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedActivity.name}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {/* Activity Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Weight</label>
                    <p className="text-lg font-semibold text-green-600">{selectedActivity.weight}%</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Baseline</label>
                    <p className="text-sm text-gray-900">{selectedActivity.baseline || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Annual Target</label>
                    <p className="text-sm text-gray-900">{selectedActivity.annual_target || 0}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">Organization</label>
                    <p className="text-sm text-gray-900">{selectedActivity.organization_name || 'Not specified'}</p>
                  </div>
                </div>

                {/* Quarterly Targets */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Quarterly Targets</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-lg font-semibold text-blue-600">{selectedActivity.q1_target || 0}</div>
                      <div className="text-xs text-gray-500">Q1</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-lg font-semibold text-green-600">{selectedActivity.q2_target || 0}</div>
                      <div className="text-xs text-gray-500">Q2</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-50 rounded-lg">
                      <div className="text-lg font-semibold text-yellow-600">{selectedActivity.q3_target || 0}</div>
                      <div className="text-xs text-gray-500">Q3</div>
                    </div>
                    <div className="text-center p-3 bg-red-50 rounded-lg">
                      <div className="text-lg font-semibold text-red-600">{selectedActivity.q4_target || 0}</div>
                      <div className="text-xs text-gray-500">Q4</div>
                    </div>
                  </div>
                </div>

                {/* Budget Information */}
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="text-sm font-medium text-blue-700 mb-3 flex items-center">
                      <DollarSign className="h-4 w-4 mr-2" />
                      Activity Budget Summary
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-blue-600">Total Budget:</span>
                        <div className="font-bold text-blue-800 text-lg">
                          ${modalBudgetData.budgetRequired.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-blue-600">Available Funding:</span>
                        <div className="font-bold text-green-600 text-lg">
                          ${modalBudgetData.totalAvailable.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-3 border-t border-blue-200">
                      <h5 className="text-xs font-medium text-blue-700 mb-2">Funding Sources:</h5>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-blue-600">Government:</span>
                          <span className="font-medium">${modalBudgetData.government.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Partners:</span>
                          <span className="font-medium">${modalBudgetData.partners.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">SDG:</span>
                          <span className="font-medium">${modalBudgetData.sdg.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-blue-600">Other:</span>
                          <span className="font-medium">${modalBudgetData.other.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      {modalBudgetData.gap > 0 ? (
                        <div className="flex justify-between items-center">
                          <span className="text-red-600 font-medium">Funding Gap:</span>
                          <span className="font-bold text-red-600 text-lg">${modalBudgetData.gap.toLocaleString()}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-green-600 font-medium">Status:</span>
                          <span className="font-bold text-green-600">Fully Funded</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sub-Activities Management */}
                  {!isViewOnly && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Add Sub-Activity</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {(['Training', 'Meeting', 'Workshop', 'Supervision', 'Procurement', 'Printing', 'Other'] as ActivityType[]).map((type) => (
                          <button
                            key={type}
                            onClick={() => handleCreateSubActivity(type, selectedActivity)}
                            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 flex items-center justify-center transition-colors"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-Activities List */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Sub-Activities ({selectedActivity.sub_activities?.length || 0})</h4>
                    
                    {(!selectedActivity.sub_activities || selectedActivity.sub_activities.length === 0) ? (
                      <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm">No sub-activities created yet</p>
                        <p className="text-xs text-gray-400 mt-1">Create sub-activities to break down this main activity</p>
                      </div>
                    ) : (
                      selectedActivity.sub_activities.map((subActivity: any) => {
                        // Calculate sub-activity budget details using new fields
                        const subBudgetRequired = subActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(subActivity.estimated_cost_with_tool || 0)
                          : Number(subActivity.estimated_cost_without_tool || 0);
                        
                        // Use direct funding fields from SubActivity model
                        const subGovernment = Number(subActivity.government_treasury || 0);
                        const subPartners = Number(subActivity.partners_funding || 0);
                        const subSdg = Number(subActivity.sdg_funding || 0);
                        const subOther = Number(subActivity.other_funding || 0);
                        const subTotalFunding = subGovernment + subPartners + subSdg + subOther;
                        const subGap = Math.max(0, subBudgetRequired - subTotalFunding);
                        
                        return (
                          <div key={subActivity.id} className="bg-white p-4 rounded-lg border border-gray-200">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <div className="flex items-center mb-2">
                                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                                    {subActivity.activity_type}
                                  </span>
                                  <h5 className="font-medium text-gray-900">{subActivity.name}</h5>
                                </div>
                                {subActivity.description && (
                                  <p className="text-sm text-gray-600">{subActivity.description}</p>
                                )}
                              </div>
                              
                              {!isViewOnly && (
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleDeleteSubActivity(subActivity.id)}
                                    className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-200">
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Budget Required</div>
                                <div className="font-semibold text-gray-900">${subBudgetRequired.toLocaleString()}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-500 mb-1">Available Funding</div>
                                <div className="font-semibold text-green-600">${subTotalFunding.toLocaleString()}</div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                              <div className="text-center">
                                <div className="text-gray-500">Gov</div>
                                <div className="font-medium">${subGovernment.toLocaleString()}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">Partners</div>
                                <div className="font-medium">${subPartners.toLocaleString()}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">SDG</div>
                                <div className="font-medium">${subSdg.toLocaleString()}</div>
                              </div>
                              <div className="text-center">
                                <div className="text-gray-500">Other</div>
                                <div className="font-medium">${subOther.toLocaleString()}</div>
                              </div>
                            </div>
                            
                            {subGap > 0 && (
                              <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                                Gap: ${subGap.toLocaleString()}
                              </div>
                            )}
                            
                            <div className="flex justify-end space-x-2 mt-3">
                              <button
                                onClick={() => {
                                  setSelectedSubActivity(subActivity);
                                  setSelectedActivityType(subActivity.activity_type);
                                  setEditingSubActivity(subActivity);
                                  setShowBudgetForm(true);
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center px-2 py-1 bg-blue-50 rounded"
                              >
                                <Calculator className="h-3 w-3 mr-1" />
                                Edit
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Costing Tool Modal */}
      {showCostingTool && selectedActivityType && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Calculator className="h-5 w-5 mr-2 text-blue-600" />
                {selectedActivityType} Cost Calculator
              </h3>
            </div>
            <div className="p-6 overflow-y-auto max-h-[80vh]">
              {selectedActivityType === 'Training' && (
                <TrainingCostingTool
                  onCalculate={handleCostingComplete}
                  onCancel={handleCostingCancel}
                  initialData={editingSubActivity && costingToolData ? costingToolData : undefined}
                />
              )}
              {selectedActivityType === 'Meeting' && (
                <MeetingWorkshopCostingTool
                  onCalculate={handleCostingComplete}
                  onCancel={handleCostingCancel}
                  initialData={editingSubActivity && costingToolData ? costingToolData : undefined}
                />
              )}
              {selectedActivityType === 'Workshop' && (
                <MeetingWorkshopCostingTool
                  onCalculate={handleCostingComplete}
                  onCancel={handleCostingCancel}
                  initialData={editingSubActivity && costingToolData ? costingToolData : undefined}
                />
              )}
              {selectedActivityType === 'Printing' && (
                <PrintingCostingTool
                  onCalculate={handleCostingComplete}
                  onCancel={handleCostingCancel}
                  initialData={editingSubActivity && costingToolData ? costingToolData : undefined}
                />
              )}
              {selectedActivityType === 'Procurement' && (
                <ProcurementCostingTool
                  onCalculate={handleCostingComplete}
                  onCancel={handleCostingCancel}
                  initialData={editingSubActivity && costingToolData ? costingToolData : undefined}
                />
              )}
              {selectedActivityType === 'Supervision' && (
                <SupervisionCostingTool
                  onCalculate={handleCostingComplete}
                  onCancel={handleCostingCancel}
                  initialData={editingSubActivity && costingToolData ? costingToolData : undefined}
                />
              )}
              {selectedActivityType === 'Other' && (
                <div className="text-center p-8">
                  <Info className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">Manual Cost Entry</h4>
                  <p className="text-gray-600 mb-4">For other activity types, you can enter costs manually in the budget form.</p>
                  <button
                    onClick={() => handleCostingComplete({ totalBudget: 0, estimated_cost: 0 })}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Continue to Budget Form
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      {showBudgetForm && selectedActivityType && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Budget Sources for {selectedActivityType} Activity</h3>
            </div>
            <div className="p-6 overflow-y-auto max-h-[80vh]">
              <ActivityBudgetForm
                activity={selectedActivity}
                budgetCalculationType="WITH_TOOL"
                activityType={selectedActivityType}
                onSubmit={handleSubActivitySaved}
                initialData={editingSubActivity || costingToolData}
                onCancel={() => {
                  setShowBudgetForm(false);
                  setSelectedActivityType(null);
                  setCostingToolData(null);
                  setEditingSubActivity(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainActivityList;