import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { objectives, auth, api } from '../lib/api';
import { Target, AlertCircle, CheckCircle, ChevronRight, ChevronDown, BookOpen, ListTree, Folder, FolderOpen } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import type { StrategicObjective, Program, SubProgram } from '../types/organization';
import { cn } from '../lib/utils';

// Function to get the effective weight of an objective (planner_weight if set, otherwise weight)
const getEffectiveWeight = (objective: StrategicObjective): number => {
  // First check effective_weight, then planner_weight, then fall back to weight
  if (objective.effective_weight !== undefined) {
    return objective.effective_weight;
  } else if (objective.planner_weight !== undefined && objective.planner_weight !== null) {
    return objective.planner_weight;
  } else {
    return objective.weight;
  }
};

interface StrategicObjectivesListProps {
  onSelectObjective: (objective: StrategicObjective) => void;
  selectedObjectiveId?: string | number | null;
  onSelectProgram?: (program: Program) => void;
  onSelectSubProgram?: (subProgram: SubProgram) => void;
  selectedObjectives?: StrategicObjective[];
}

// CollapsibleNode component for tree structure
interface CollapsibleNodeProps {
  title: string;
  type: 'objective' | 'program' | 'subprogram';
  weight: number;
  plannerWeight?: number | null;
  isDefault?: boolean;
  isSelected?: boolean;
  onClick: () => void;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  description?: string;
}

const CollapsibleNode: React.FC<CollapsibleNodeProps> = ({
  title,
  type,
  weight,
  plannerWeight,
  isDefault = false,
  isSelected = false,
  onClick,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  description
}) => {
  const getIcon = () => {
    switch (type) {
      case 'objective':
        return <Target className="h-5 w-5 text-blue-600" />;
      case 'program':
        return <BookOpen className="h-5 w-5 text-green-600" />;
      case 'subprogram':
        return <ListTree className="h-5 w-5 text-purple-600" />;
    }
  };

  const getBgColor = () => {
    if (isSelected) return 'bg-blue-50 border-blue-500 border-2';
    
    switch (type) {
      case 'objective':
        return isDefault ? 'bg-white border-green-200' : 'bg-white border-blue-200';
      case 'program':
        return 'bg-gray-50 border-gray-200';
      case 'subprogram':
        return 'bg-gray-50 border-gray-200';
    }
  };

  // Set the padding based on the node type
  const getPadding = () => {
    switch (type) {
      case 'objective': return 'pl-4';
      case 'program': return 'pl-8';
      case 'subprogram': return 'pl-12';
    }
  };

  // Get effective weight (planner_weight if set, otherwise weight)
  const effectiveWeight = plannerWeight !== undefined && plannerWeight !== null ? plannerWeight : weight;

  return (
    <div 
      className={cn(
        `p-3 my-2 rounded-lg border cursor-pointer transition-colors`,
        getBgColor(),
        hasChildren ? 'hover:border-blue-300' : 'hover:border-gray-300'
      )}
    >
      <div className="flex justify-between items-start" onClick={onClick}>
        <div className={`flex items-start ${getPadding()}`}>
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleExpand) onToggleExpand();
              }}
              className="p-1 rounded-full hover:bg-gray-100 mr-2 -ml-6"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-600" />
              )}
            </button>
          )}
          <div className="flex-shrink-0 mr-3">
            {getIcon()}
          </div>
          <div>
            <div className="font-medium text-gray-900 flex items-center">
              {title}
              {isDefault && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Default
                </span>
              )}
              {plannerWeight !== undefined && plannerWeight !== null && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  Custom Weight
                </span>
              )}
            </div>
            {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 bg-blue-100 rounded-full text-blue-800 text-sm font-medium">
            {effectiveWeight.toFixed(1)}%
          </span>
          {plannerWeight !== undefined && plannerWeight !== null && (
            <span className="text-xs text-gray-500">(Original: {weight.toFixed(1)}%)</span>
          )}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleExpand) onToggleExpand();
              }}
              className="p-1 rounded-full hover:bg-gray-100"
            >
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-gray-600" />
              ) : (
                <Folder className="h-4 w-4 text-gray-600" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const StrategicObjectivesList: React.FC<StrategicObjectivesListProps> = ({
  onSelectObjective,
  selectedObjectiveId,
  onSelectProgram,
  onSelectSubProgram,
  selectedObjectives = []
}) => {
  const { t } = useLanguage();
  const [loadingObjectives, setLoadingObjectives] = useState<boolean>(false);
  const [objectivesError, setObjectivesError] = useState<string | null>(null);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);

  // State to track expanded objectives and programs
  const [expandedObjectives, setExpandedObjectives] = useState<Record<string, boolean>>({});
  const [expandedPrograms, setExpandedPrograms] = useState<Record<string, boolean>>({});
  
  // State to track calculated weight totals
  const [calculatedTotals, setCalculatedTotals] = useState(() => {
    const totalWeight = selectedObjectives.reduce((sum, obj) => sum + getEffectiveWeight(obj), 0);
    return {
      totalWeight,
      remainingWeight: 0,
      isValid: false
    };
  });
  
  // Fetch all objectives
  const { data: objectivesData, isLoading } = useQuery({
    queryKey: ['objectives'],
    queryFn: () => objectives.getAll(),
    onSuccess: (data) => {
      console.log("Fetched fresh objectives data:", data);
    }
  });

  const { data: weightSummary } = useQuery({
    queryKey: ['objectives', 'weight-summary'],
    queryFn: async () => {
      console.log("Fetching weight summary");
      return objectives.getWeightSummary();
    },
  });

  // Fetch current user's organization ID
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
          console.log("User organization ID:", authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
  }, []);

  // Calculate total weight and remaining weight based on selected objectives
  useEffect(() => {
    if (Array.isArray(selectedObjectives) && selectedObjectives.length > 0) {
      // Calculate total using effective weights (selected by planner)
      const totalEffectiveWeight = selectedObjectives.reduce((total, obj) => {
        // Get the effective weight using our helper function
        const effectiveWeight = obj.effective_weight || getEffectiveWeight(obj);
        console.log(`Objective ${obj.id} (${obj.title}): effectiveWeight=${effectiveWeight}, planner_weight=${obj.planner_weight}, weight=${obj.weight}`);
        return total + effectiveWeight;
      }, 0);
      
      // Calculate remaining (target is 100%)
      const remainingWeight = 100 - totalEffectiveWeight;
      
      // Check if weight is valid (100%)
      const isValid = Math.abs(totalEffectiveWeight - 100) < 0.01;
      
      setCalculatedTotals({
        totalWeight: totalEffectiveWeight,
        remainingWeight: remainingWeight,
        isValid: isValid
      });
    } else {
      // Reset if no objectives selected
      setCalculatedTotals({
        totalWeight: 0,
        remainingWeight: 100,
        isValid: false
      });
    }
  }, [selectedObjectives]);

  // Refresh objectives data with latest planner weights when selected objectives change
  useEffect(() => {
    if (Array.isArray(selectedObjectives) && selectedObjectives.length > 0) {
      // Log the selected objectives to see what weights they have
      console.log('Selected objectives before refresh:', selectedObjectives.map(obj => ({
        id: obj.id,
        title: obj.title, 
        weight: obj.weight,
        planner_weight: obj.planner_weight,
        effective_weight: obj.effective_weight || getEffectiveWeight(obj)
      })));
      
      // Optional: Refresh the objectives data to get latest planner weights
      const refreshObjectiveData = async () => {
        try {
          setLoadingObjectives(true);
          setObjectivesError(null);
          
          // Get fresh data for each selected objective
          const updatedObjectives = await Promise.all(
            selectedObjectives.map(async (obj) => {
              try {
                // Get fresh data for this objective
                const response = await api.get(`/strategic-objectives/${obj.id}/`);
                const freshData = response.data;
                
                // Preserve the effective_weight value that was passed in
                const preservedEffectiveWeight = obj.effective_weight || getEffectiveWeight(obj);
                
                console.log(`Refreshed objective ${obj.id}:`, {
                  title: freshData.title,
                  weight: freshData.weight,
                  planner_weight: freshData.planner_weight,
                  preserved_effective_weight: preservedEffectiveWeight
                });
                
                // Return the updated object with preserved effective weight
                return {
                  ...freshData,
                  effective_weight: preservedEffectiveWeight
                };
              } catch (error) {
                console.error(`Failed to refresh objective ${obj.id}:`, error);
                // Return the original object if refresh failed
                return obj;
              }
            })
          );
          
          console.log('Updated objectives after refresh:', updatedObjectives);
        } catch (error) {
          console.error('Failed to refresh objectives data:', error);
          setObjectivesError('Failed to refresh objectives data');
        } finally {
          setLoadingObjectives(false);
        }
      };
      
      refreshObjectiveData();
    }
  }, []);

  const toggleObjectiveExpand = (objectiveId: string) => {
    setExpandedObjectives(prev => ({
      ...prev,
      [objectiveId]: !prev[objectiveId]
    }));
  };

  const toggleProgramExpand = (programId: string) => {
    setExpandedPrograms(prev => ({
      ...prev,
      [programId]: !prev[programId]
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">{t('common.loading')}</div>
        <span className="ml-2 animate-pulse">Loading objective data...</span>
      </div>
    );
  }

  if (!objectivesData?.data || objectivesData.data.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-200">
        <Target className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Strategic Objectives</h3>
        <p className="text-gray-500">No strategic objectives have been defined yet.</p>
      </div>
    );
  }

  // If selectedObjectives is provided, only display those objectives
  const displayObjectives = selectedObjectives.length > 0 
    ? objectivesData.data.filter((obj: StrategicObjective) => 
        selectedObjectives.some(selected => selected.id === obj.id))
    : objectivesData.data;
    
  console.log("StrategicObjectivesList - displayObjectives:", displayObjectives.length);
  console.log("StrategicObjectivesList - selectedObjectives:", selectedObjectives);
  console.log("StrategicObjectivesList - calculatedTotals:", calculatedTotals);

  // Group objectives by default and custom
  const defaultObjectives = displayObjectives.filter(obj => obj.is_default);
  const customObjectives = displayObjectives.filter(obj => !obj.is_default);

  // Use the calculated totals if we have selected objectives, otherwise use API data
  const totalWeight = selectedObjectives.length > 0 
    ? calculatedTotals.totalWeight 
    : (weightSummary?.data?.total_weight || 0);
    
  const remainingWeight = selectedObjectives.length > 0
    ? calculatedTotals.remainingWeight
    : (weightSummary?.data?.remaining_weight || 0);
    
  const is_valid = selectedObjectives.length > 0
    ? calculatedTotals.isValid
    : (weightSummary?.data?.is_valid || false);

  const isObjectiveSelected = (objective: StrategicObjective) => 
    selectedObjectives.some(obj => obj.id === objective.id);

  return (
    <div className="space-y-6">
      {/* Weight Summary */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-1">Total Weight</div>
            <div className="text-2xl font-bold text-gray-900">{totalWeight}%</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500 mb-1">
              {remainingWeight >= 0 ? "Remaining" : "Over-allocated"}
            </div>
            <div className={`text-2xl font-bold ${remainingWeight === 0 ? 'text-green-600' : 'text-amber-600'}`}>
              {Math.abs(remainingWeight).toFixed(1)}%
            </div>
          </div>
        </div>

        {remainingWeight > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <p className="text-sm text-amber-700">
              Total weight must equal 100%. Currently at {totalWeight.toFixed(1)}%
              (Need {remainingWeight.toFixed(1)}% more)
            </p>
          </div>
        )}

        {remainingWeight < 0 && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm text-red-700">
              Total weight exceeds 100% by {Math.abs(remainingWeight).toFixed(1)}%.
              Current total: {totalWeight.toFixed(1)}%
            </p>
          </div>
        )}

        {is_valid && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="text-sm text-green-700">
              Weight distribution is balanced at 100%
            </p>
          </div>
        )}
      </div>

      {/* Tree View */}
      <div className="space-y-2">
        {/* Default Objectives Section - Only if we have some */}
        {defaultObjectives.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-gray-700 flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Default
              </span>
              Default Objectives
            </h3>

            <div className="space-y-1">
              {defaultObjectives.map(objective => {
                const isExpanded = expandedObjectives[objective.id] || false;
                const hasPrograms = objective.programs && objective.programs.length > 0;
                
                return (
                  <div key={objective.id} className="relative">
                    <CollapsibleNode
                      title={objective.title}
                      type="objective"
                      weight={objective.weight}
                      plannerWeight={objective.planner_weight}
                      isDefault={true}
                      isSelected={objective.id === selectedObjectiveId || isObjectiveSelected(objective)}
                      onClick={() => onSelectObjective(objective)}
                      hasChildren={hasPrograms}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleObjectiveExpand(objective.id.toString())}
                      description={objective.description}
                    />

                    {/* Render programs if expanded */}
                    {isExpanded && hasPrograms && (
                      <div className="ml-6 border-l-2 border-gray-200 pl-2">
                        {objective.programs.map(program => {
                          const isProgramExpanded = expandedPrograms[program.id] || false;
                          const hasSubprograms = false; // No subprograms in the model anymore
                          
                          // Get effective weight for objective - use the parent objective's effective weight
                          const objectiveEffectiveWeight = objective.planner_weight !== undefined && objective.planner_weight !== null
                            ? objective.planner_weight
                            : objective.weight;
                            
                          return (
                            <div key={program.id} className="relative">
                              <CollapsibleNode
                                title={program.name}
                                type="program"
                                weight={objectiveEffectiveWeight}
                                isDefault={program.is_default}
                                onClick={() => {
                                  if (onSelectProgram) onSelectProgram(program);
                                }}
                                hasChildren={hasSubprograms}
                                isExpanded={isProgramExpanded}
                                onToggleExpand={() => toggleProgramExpand(program.id.toString())}
                                description={program.description}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Custom Objectives Section - Only if we have some */}
        {customObjectives.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-gray-700 flex items-center mt-6">
              <span className="inline-flex items-center px-2.5 py-0.5 mr-2 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Custom
              </span>
              Custom Objectives
            </h3>
            
            <div className="space-y-1">
              {customObjectives.map(objective => {
                const isExpanded = expandedObjectives[objective.id] || false;
                const hasPrograms = objective.programs && objective.programs.length > 0;
                
                return (
                  <div key={objective.id} className="relative">
                    <CollapsibleNode
                      title={objective.title}
                      type="objective"
                      weight={objective.weight}
                      plannerWeight={objective.planner_weight}
                      isDefault={false}
                      isSelected={objective.id === selectedObjectiveId || isObjectiveSelected(objective)}
                      onClick={() => onSelectObjective(objective)}
                      hasChildren={hasPrograms}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleObjectiveExpand(objective.id.toString())}
                      description={objective.description}
                    />

                    {/* Render programs if expanded */}
                    {isExpanded && hasPrograms && (
                      <div className="ml-6 border-l-2 border-blue-200 pl-2">
                        {objective.programs.map(program => {
                          const isProgramExpanded = expandedPrograms[program.id] || false;
                          const hasSubprograms = false; // No subprograms in the model anymore
                          
                          return (
                            <div key={program.id} className="relative">
                              <CollapsibleNode
                                title={program.name}
                                type="program"
                                weight={objective.weight} // Programs inherit weight from parent objective
                                isDefault={program.is_default}
                                onClick={() => {
                                  if (onSelectProgram) onSelectProgram(program);
                                }}
                                hasChildren={hasSubprograms}
                                isExpanded={isProgramExpanded}
                                onToggleExpand={() => toggleProgramExpand(program.id.toString())}
                                description={program.description}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StrategicObjectivesList;