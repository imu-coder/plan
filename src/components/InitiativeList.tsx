import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { initiatives, auth, organizations } from '../lib/api';
import { BarChart3, AlertCircle, CheckCircle, Edit, Trash2, Lock, PlusCircle, Building2, Info, RefreshCw, Loader } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { StrategicInitiative } from '../types/organization';
import { isPlanner } from '../types/user';

interface InitiativeListProps {
  parentId: string;
  parentType: 'objective' | 'program' | 'subprogram';
  parentWeight: number;
  selectedObjectiveData?: any;
  onEditInitiative: (initiative: StrategicInitiative) => void;
  onSelectInitiative?: (initiative: StrategicInitiative) => void;
  isNewPlan?: boolean;
  planKey?: string;
  isUserPlanner: boolean;
  userOrgId: number | null;
  refreshKey?: number;
}

const InitiativeList: React.FC<InitiativeListProps> = ({ 
  parentId,
  parentType,
  parentWeight,
  selectedObjectiveData,
  onEditInitiative,
  onSelectInitiative,
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
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  
  console.log('InitiativeList initialized with:', {
    parentId,
    parentType,
    parentWeight,
    userOrgId,
    isUserPlanner,
    refreshKey
  });

  // Fetch organizations mapping
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        
        const orgData = response?.data || response?.results || response || [];
        if (Array.isArray(orgData)) {
          orgData.forEach((org: any) => {
            if (org?.id) {
              orgMap[String(org.id)] = org.name;
            }
          });
        }
        
        setOrganizationsMap(orgMap);
        console.log('InitiativeList: Organizations map created:', Object.keys(orgMap).length, 'organizations');
      } catch (error) {
        console.error('InitiativeList: Failed to fetch organizations:', error);
      }
    };
    
    fetchOrganizations();
  }, []);

  // Listen for external refresh key changes
  useEffect(() => {
    if (refreshKey !== lastRefreshKey) {
      console.log('InitiativeList: External refresh key changed, refreshing data');
      setLastRefreshKey(refreshKey);
      setRefreshTrigger(prev => prev + 1);
    }
  }, [refreshKey, lastRefreshKey]);

  // Production-safe API call for initiatives
  const fetchInitiativesSafely = async () => {
    if (!parentId) {
      console.log('InitiativeList: Missing parentId, cannot fetch initiatives');
      return { data: [] };
    }

    console.log(`InitiativeList: Fetching initiatives for ${parentType} ${parentId} (user org: ${userOrgId})`);
    
    try {
      let response;
      
      // Strategy 1: Use dedicated methods
      switch (parentType) {
        case 'objective':
          console.log('InitiativeList: Strategy 1 - Using getByObjective');
          response = await initiatives.getByObjective(parentId);
          break;
        case 'program':
          console.log('InitiativeList: Strategy 1 - Using getByProgram');
          response = await initiatives.getByProgram(parentId);
          break;
        default:
          throw new Error(`Unsupported parent type: ${parentType}`);
      }
      
      if (response?.data && Array.isArray(response.data)) {
        console.log(`InitiativeList: Strategy 1 succeeded - ${response.data.length} initiatives found`);
        return response;
      } else {
        throw new Error('Invalid response format from dedicated method');
      }
    } catch (error) {
      console.error(`InitiativeList: Strategy 1 failed:`, error);
      
      try {
        // Strategy 2: Direct API call
        console.log('InitiativeList: Strategy 2 - Direct API call');
        const apiResponse = await fetch(`/api/strategic-initiatives/?${parentType === 'objective' ? 'strategic_objective' : 'program'}=${parentId}`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          }
        });
        
        if (!apiResponse.ok) {
          throw new Error(`API call failed: ${apiResponse.status}`);
        }
        
        const data = await apiResponse.json();
        const initiativeData = data?.results || data?.data || data || [];
        
        console.log(`InitiativeList: Strategy 2 succeeded - ${initiativeData.length} initiatives found`);
        return { data: Array.isArray(initiativeData) ? initiativeData : [] };
        
      } catch (error2) {
        console.error(`InitiativeList: Strategy 2 failed:`, error2);
        
        // Strategy 3: Get all and filter
        try {
          console.log('InitiativeList: Strategy 3 - Get all and filter');
          const allResponse = await initiatives.getAll();
          const allInitiatives = allResponse?.data || allResponse?.results || allResponse || [];
          
          if (Array.isArray(allInitiatives)) {
            const filtered = allInitiatives.filter((initiative: any) => {
              const matches = parentType === 'objective' 
                ? String(initiative.strategic_objective) === String(parentId)
                : String(initiative.program) === String(parentId);
              return matches;
            });
            
            console.log(`InitiativeList: Strategy 3 succeeded - filtered ${filtered.length} from ${allInitiatives.length} total`);
            return { data: filtered };
          }
          
          throw new Error('No valid data from getAll');
        } catch (error3) {
          console.error(`InitiativeList: All strategies failed:`, { error, error2, error3 });
          throw new Error('Failed to fetch initiatives with all strategies');
        }
      }
    }
  };

  // Fetch initiatives query
  const { data: initiativesList, isLoading, refetch, error: fetchError } = useQuery({
    queryKey: ['initiatives', parentId, parentType, planKey, refreshTrigger, userOrgId],
    queryFn: fetchInitiativesSafely,
    enabled: !!parentId && !!userOrgId,
    staleTime: 0,
    cacheTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1000,
  });

  // Delete initiative mutation
  const deleteInitiativeMutation = useMutation({
    mutationFn: (initiativeId: string) => {
      console.log('InitiativeList: Deleting initiative:', initiativeId);
      return initiatives.delete(initiativeId);
    },
    onSuccess: () => {
      console.log('InitiativeList: Initiative deleted, refreshing list');
      queryClient.invalidateQueries({ queryKey: ['initiatives', parentId, parentType] });
      queryClient.invalidateQueries({ queryKey: ['objectives'] });
      setRefreshTrigger(prev => prev + 1);
    },
    onError: (error) => {
      console.error('InitiativeList: Failed to delete initiative:', error);
    }
  });

  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      console.log('InitiativeList: Manual refresh triggered');
      setRefreshTrigger(prev => prev + 1);
      await refetch();
    } catch (error) {
      console.error('InitiativeList: Manual refresh failed:', error);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  // CRITICAL: Filter initiatives to show only user's organization + defaults
  const filteredInitiatives = React.useMemo(() => {
    console.log('InitiativeList: Starting filtering - user org ID:', userOrgId);
    
    if (!initiativesList?.data || !Array.isArray(initiativesList.data)) {
      console.log('InitiativeList: No initiatives data to filter');
      return [];
    }

    console.log('InitiativeList: Raw initiatives from API:', initiativesList.data.length);
    
    // PRODUCTION FIX: Strict organization filtering
    const filtered = initiativesList.data.filter(initiative => {
      if (!initiative) {
        console.log('InitiativeList: Skipping null initiative');
        return false;
      }
      
      // Check if this is a default initiative (available to all organizations)
      const isDefault = Boolean(initiative.is_default === true);
      
      // Check if initiative has no organization (legacy data)
      const hasNoOrg = !initiative.organization || 
                       initiative.organization === null || 
                       initiative.organization === undefined ||
                       initiative.organization === '';
      
      // Check if initiative belongs to user's organization (strict matching)
      const belongsToUserOrg = userOrgId && 
                              initiative.organization && 
                              Number(initiative.organization) === Number(userOrgId);
      
      // CRITICAL: Only include if default, no org (legacy), or belongs to user's org
      const shouldInclude = isDefault || hasNoOrg || belongsToUserOrg;
      
      console.log(`InitiativeList: "${initiative.name}" - isDefault:${isDefault}, hasNoOrg:${hasNoOrg}, belongsToUserOrg:${belongsToUserOrg}, org:${initiative.organization}, userOrg:${userOrgId}, include:${shouldInclude}`);
      
      return shouldInclude;
    });
    
    console.log(`InitiativeList: Filtered ${initiativesList.data.length} total to ${filtered.length} for user org ${userOrgId}`);
    
    return filtered;
  }, [initiativesList?.data, userOrgId]);

  // Handle initiative deletion
  const handleDeleteInitiative = (initiativeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (window.confirm('Are you sure you want to delete this initiative? This will also delete all associated performance measures and main activities.')) {
      deleteInitiativeMutation.mutate(initiativeId);
    }
  };

  // Handle initiative validation
  const handleValidateInitiatives = () => {
    setValidationSuccess(null);
    setValidationError(null);
    
    const totalWeight = filteredInitiatives.reduce((sum, init) => sum + (Number(init.weight) || 0), 0);
    const isValid = parentType === 'objective' 
      ? Math.abs(totalWeight - parentWeight) < 0.01 
      : totalWeight <= parentWeight;

    if (isValid) {
      setValidationSuccess(`Initiative weights are valid (${totalWeight.toFixed(2)}%)`);
      setTimeout(() => setValidationSuccess(null), 3000);
    } else {
      if (parentType === 'objective') {
        setValidationError(`Initiative weights (${totalWeight.toFixed(2)}%) must equal objective weight (${parentWeight.toFixed(2)}%)`);
      } else {
        setValidationError(`Initiative weights (${totalWeight.toFixed(2)}%) cannot exceed ${parentType} weight (${parentWeight.toFixed(2)}%)`);
      }
      setTimeout(() => setValidationError(null), 5000);
    }
  };

  // Loading state
  if (isLoading && parentId) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <div>
          <span className="text-gray-600">Loading initiatives...</span>
          <p className="text-xs text-gray-500 mt-1">{parentType}: {parentId}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-800 font-medium">Failed to Load Initiatives</span>
          </div>
          <p className="text-red-700 text-sm mb-3">
            {fetchError.message || 'Unable to fetch initiatives from the server'}
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
                onClick={() => onEditInitiative({} as StrategicInitiative)}
                className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
              >
                <PlusCircle className="h-4 w-4 inline mr-1" />
                Create Initiative
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Calculate weight totals
  const totalInitiativesWeight = filteredInitiatives.reduce((sum, initiative) => 
    sum + (Number(initiative.weight) || 0), 0
  );
  
  const remainingWeight = parentWeight - totalInitiativesWeight;
  
  // Check if weight is valid
  const isWeightValid = parentType === 'objective' 
    ? Math.abs(totalInitiativesWeight - parentWeight) < 0.01 
    : totalInitiativesWeight <= parentWeight;

  // Empty state
  if (filteredInitiatives.length === 0) {
    return (
      <div className="space-y-4">
        {/* Weight Distribution Card */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Initiative Weight Distribution</h3>
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
          
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Parent Weight</p>
              <p className="text-2xl font-semibold text-gray-900">{parentWeight}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-2xl font-semibold text-green-600">{parentWeight}%</p>
            </div>
          </div>

          {parentType === 'objective' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-700 flex items-center">
                <Info className="h-4 w-4 mr-2" />
                <strong>Rule:</strong> For this objective with weight {parentWeight}%, 
                total initiative weights must equal <strong>exactly {parentWeight}%</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Empty State */}
        <div className="text-center p-8 bg-white rounded-lg border-2 border-dashed border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Initiatives Found</h3>
          <p className="text-gray-500 mb-4">
            No initiatives have been created yet for this {parentType}.
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
                onClick={() => onEditInitiative({} as StrategicInitiative)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Create Initiative
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main render with initiatives
  return (
    <div className="space-y-4">
      {/* Weight Distribution Summary */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">Initiative Weight Distribution</h3>
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
            <p className="text-sm text-gray-500">Parent Weight</p>
            <p className="text-2xl font-semibold text-gray-900">{parentWeight}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Current Total</p>
            <p className="text-2xl font-semibold text-blue-600">{totalInitiativesWeight.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Remaining</p>
            <p className={`text-2xl font-semibold ${isWeightValid ? 'text-green-600' : 'text-red-600'}`}>
              {remainingWeight.toFixed(1)}%
            </p>
          </div>
        </div>

        {parentType === 'objective' && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-700 flex items-center">
              <Info className="h-4 w-4 mr-2" />
              <strong>Rule:</strong> For objective with weight {parentWeight}%, 
              total initiative weights must equal exactly {parentWeight}%.
            </p>
          </div>
        )}

        {remainingWeight < 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">Over allocated by {Math.abs(remainingWeight).toFixed(1)}%. Please reduce initiative weights.</p>
          </div>
        )}

        {isWeightValid && totalInitiativesWeight > 0 && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm">Weight distribution is balanced ({totalInitiativesWeight.toFixed(1)}% = {parentWeight}%)</p>
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

        {isUserPlanner && (
          <div className="mt-4">
            <button
              onClick={handleValidateInitiatives}
              disabled={filteredInitiatives.length === 0}
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              Validate Initiative Weights
            </button>
          </div>
        )}
      </div>

      {/* Initiatives List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 flex items-center">
            <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Initiatives ({filteredInitiatives.length})
            </span>
            Strategic Initiatives
          </h3>
          {isUserPlanner && (
            <button 
              onClick={() => onEditInitiative({} as StrategicInitiative)}
              disabled={remainingWeight <= 0}
              className="inline-flex items-center px-3 py-1 text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Add Initiative
            </button>
          )}
        </div>
        
        {filteredInitiatives.map((initiative) => (
          <div
            key={initiative.id}
            onClick={() => onSelectInitiative && onSelectInitiative(initiative)}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-green-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <h4 className="font-medium text-gray-900">{initiative.name}</h4>
                {initiative.is_default && (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Default
                  </span>
                )}
                {!initiative.is_default && (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Custom
                  </span>
                )}
                {initiative.initiative_feed_name && (
                  <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    From: {initiative.initiative_feed_name}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-blue-600">
                  {initiative.weight}%
                </span>
              </div>
            </div>
            
            {/* Organization info */}
            {initiative.organization_name && (
              <div className="mb-2 flex items-center text-sm text-gray-600">
                <Building2 className="h-4 w-4 mr-1 text-gray-500" />
                <span>{initiative.organization_name}</span>
              </div>
            )}
            
            {/* Performance Measures and Main Activities Count */}
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-500">
              <div>Performance Measures: {initiative.performance_measures?.length || 0}</div>
              <div>Main Activities: {initiative.main_activities?.length || 0}</div>
              <div>Total Measures Weight: {initiative.total_measures_weight || 0}%</div>
              <div>Total Activities Weight: {initiative.total_activities_weight || 0}%</div>
            </div>
            
            <div className="flex justify-end mt-2">
              {isUserPlanner ? (
                <div className="flex space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditInitiative(initiative);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center"
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </button>
                  <button
                    onClick={(e) => handleDeleteInitiative(initiative.id, e)}
                    disabled={deleteInitiativeMutation.isPending}
                    className="text-xs text-red-600 hover:text-red-800 flex items-center disabled:opacity-50"
                  >
                    {deleteInitiativeMutation.isPending ? (
                      <Loader className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    {deleteInitiativeMutation.isPending ? 'Deleting...' : 'Delete'}
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
        ))}
      </div>

      {/* Add initiative button for planners */}
      {isUserPlanner && (
        <div className="mt-4 text-center">
          <button 
            onClick={() => onEditInitiative({} as StrategicInitiative)}
            disabled={remainingWeight <= 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusCircle className="h-4 w-4 mr-2" />
            {filteredInitiatives.length === 0 ? 'Create First Initiative' : 
             remainingWeight <= 0 ? `No Weight Available (${remainingWeight.toFixed(1)}%)` :
             'Create New Initiative'}
          </button>
          
          {remainingWeight <= 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Cannot add more initiatives. Total weight cannot exceed {parentWeight}%.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default InitiativeList;