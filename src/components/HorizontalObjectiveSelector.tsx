import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { objectives, auth } from '../lib/api';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { AlertCircle, CheckCircle, Target, Plus, Minus, RefreshCw, Info, ArrowRight } from 'lucide-react';
import type { StrategicObjective } from '../types/organization';

// Helper function to safely get effective weight
const getEffectiveWeight = (objective: StrategicObjective): number => {
  if (objective.effective_weight !== undefined) {
    return objective.effective_weight;
  } else if (objective.planner_weight !== undefined && objective.planner_weight !== null) {
    return objective.planner_weight;
  } else {
    return objective.weight;
  }
};

interface HorizontalObjectiveSelectorProps {
  onObjectivesSelected: (objectives: StrategicObjective[]) => void;
  onProceed: () => void;
  initialObjectives?: StrategicObjective[];
}

const HorizontalObjectiveSelector: React.FC<HorizontalObjectiveSelectorProps> = ({
  onObjectivesSelected,
  onProceed,
  initialObjectives = []
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  // All state hooks at top level
  const [selectedObjectives, setSelectedObjectives] = useState<StrategicObjective[]>(initialObjectives);
  const [objectiveWeights, setObjectiveWeights] = useState<Record<string, number>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [totalWeight, setTotalWeight] = useState(0);
  const [isSavingWeights, setIsSavingWeights] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(initialObjectives.length === 0);
  const [lastSentData, setLastSentData] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  // Fetch all objectives with proper error handling
  const { data: objectivesResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['objectives', 'selector'],
    queryFn: async () => {
      try {
        const response = await objectives.getAll();
        console.log('HorizontalObjectiveSelector: API response:', response);
        return response;
      } catch (error) {
        console.error('Error fetching objectives:', error);
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Safely extract objectives data from API response
  const objectivesData = useMemo(() => {
    if (!objectivesResponse) return [];
    
    // Handle different API response formats
    if (Array.isArray(objectivesResponse)) {
      return objectivesResponse;
    }
    
    if (objectivesResponse.data && Array.isArray(objectivesResponse.data)) {
      return objectivesResponse.data;
    }
    
    if (objectivesResponse.results && Array.isArray(objectivesResponse.results)) {
      return objectivesResponse.results;
    }
    
    console.warn('HorizontalObjectiveSelector: Unexpected API response format:', objectivesResponse);
    return [];
  }, [objectivesResponse]);

  // Memoized unselected objectives calculation
  const unselectedObjectives = useMemo(() => {
    if (!Array.isArray(objectivesData)) {
      console.warn('HorizontalObjectiveSelector: objectivesData is not an array:', objectivesData);
      return [];
    }
    
    return objectivesData.filter(obj => 
      obj && obj.id && !selectedObjectives.some(selected => selected && selected.id === obj.id)
    );
  }, [objectivesData, selectedObjectives]);

  // Memoized form validation
  const isFormValid = useMemo(() => {
    return selectedObjectives.length > 0 && Math.abs(totalWeight - 100) < 0.01;
  }, [selectedObjectives.length, totalWeight]);

  // Mutation for updating objectives
  const updateObjectiveMutation = useMutation({
    mutationFn: async (objectiveData: Partial<StrategicObjective>) => {
      console.log('updateObjectiveMutation called with:', objectiveData);
      
      if (!objectiveData.id) {
        console.error('Missing objective ID in mutation data:', objectiveData);
        throw new Error("Missing objective ID");
      }
      
      const objectiveId = objectiveData.id.toString();
      console.log('Updating objective with ID:', objectiveId);
      
      // Create a clean data object without the ID (API doesn't expect ID in body)
      const updateData = { ...objectiveData };
      delete updateData.id;
      
      // Call the actual API to update the objective
      console.log('Calling API to update objective:', objectiveId, 'with data:', updateData);
      const response = await objectives.update(objectiveId, updateData);
      console.log('Objective update response:', response);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['objectives'] });
    },
    onError: (error, variables, context) => {
      console.error('Failed to update objective:', error);
      setSaveError(`Failed to update objective: ${error.message}`);
    }
  });

  // Initialize weights from initial objectives
  useEffect(() => {
    if (initialObjectives.length > 0 && !hasInitialized) {
      const initialWeights: Record<string, number> = {};
      
      initialObjectives.forEach(obj => {
        if (obj && obj.id) {
          const effectiveWeight = getEffectiveWeight(obj);
          initialWeights[obj.id] = effectiveWeight;
        }
      });
      
      setObjectiveWeights(initialWeights);
      setSelectedObjectives(initialObjectives);
      setHasInitialized(true);
    }
  }, [initialObjectives, hasInitialized]);

  // Calculate total weight
  useEffect(() => {
    let total = 0;
    
    selectedObjectives.forEach(obj => {
      if (obj && (obj.id || obj.id === 0)) {
        const id = obj.id.toString();
        const weight = objectiveWeights[id] !== undefined ? 
                      objectiveWeights[id] : 
                      getEffectiveWeight(obj);
        total += Number(weight) || 0;
      }
    });
    
    setTotalWeight(total);
  }, [objectiveWeights, selectedObjectives]);
  
  // Validation and parent callback
  useEffect(() => {
    if (!hasInitialized) return;

    if (selectedObjectives.length === 0) {
      setValidationError(null);
      if (lastSentData !== '[]') {
        setLastSentData('[]');
        onObjectivesSelected([]);
      }
      return;
    }

    if (Math.abs(totalWeight - 100) < 0.01) {
      setValidationError(null);
      
      const objectivesWithWeights = selectedObjectives.map(obj => {
        if (!obj || (!obj.id && obj.id !== 0)) {
          console.warn('Skipping objective without valid ID in callback:', obj);
          return null;
        }
        
        const id = obj.id.toString();
        const userSetWeight = objectiveWeights[id];
        const originalEffectiveWeight = getEffectiveWeight(obj);
        const effectiveWeight = userSetWeight !== undefined ? userSetWeight : originalEffectiveWeight;
        
        return {
          ...obj,
          weight: obj.is_default ? obj.weight : effectiveWeight, // Keep original weight for defaults
          planner_weight: obj.is_default ? effectiveWeight : null, // Set planner_weight for defaults
          effective_weight: effectiveWeight
        };
      }).filter(Boolean); // Remove null entries
      
      console.log('Passing objectives with weights to parent:', objectivesWithWeights.map(obj => ({
        id: obj.id,
        title: obj.title,
        weight: obj.weight,
        planner_weight: obj.planner_weight,
        effective_weight: obj.effective_weight,
        is_default: obj.is_default
      })));
      
      const currentDataString = JSON.stringify(objectivesWithWeights.map(obj => ({
        id: obj.id,
        effective_weight: obj.effective_weight,
        planner_weight: obj.planner_weight,
        is_default: obj.is_default
      })));
      
      if (currentDataString !== lastSentData) {
        setLastSentData(currentDataString);
        onObjectivesSelected(objectivesWithWeights);
      }
    } else {
      setValidationError(`Total weight must be 100%. Current: ${totalWeight.toFixed(2)}%`);
    }
  }, [totalWeight, selectedObjectives, objectiveWeights, hasInitialized, lastSentData, onObjectivesSelected]);

  // Memoized handlers
  const handleSelectObjective = useCallback((objective: StrategicObjective) => {
    if (!objective || (!objective.id && objective.id !== 0)) {
      console.warn('Cannot select objective without valid ID:', objective);
      return;
    }
    
    const objectiveId = objective.id.toString();
    const isSelected = selectedObjectives.some(obj => obj && obj.id && obj.id.toString() === objectiveId);
    if (isSelected) return;
    
    const updatedObjectives = [...selectedObjectives, objective];
    setSelectedObjectives(updatedObjectives);

    const effectiveWeight = getEffectiveWeight(objective);
    setObjectiveWeights(prev => ({
      ...prev,
      [objectiveId]: effectiveWeight
    }));
  }, [selectedObjectives]);

  const handleRemoveObjective = useCallback((objectiveId: number | string) => {
    const id = objectiveId.toString();
    const updatedObjectives = selectedObjectives.filter(obj => obj && obj.id && obj.id.toString() !== id);
    setSelectedObjectives(updatedObjectives);
    
    setObjectiveWeights(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, [selectedObjectives]);

  const handleWeightChange = useCallback((objectiveId: number | string, weight: number) => {
    const id = objectiveId.toString();
    setObjectiveWeights(prev => ({
      ...prev,
      [id]: weight
    }));
  }, []);

  const handleAutoDistribute = useCallback(() => {
    if (selectedObjectives.length === 0) return;
    
    const equalWeight = 100 / selectedObjectives.length;
    const updatedWeights: Record<string, number> = {};
    
    selectedObjectives.forEach(obj => {
      if (obj && (obj.id || obj.id === 0)) {
        const id = obj.id.toString();
        updatedWeights[id] = equalWeight;
      }
    });
    
    setObjectiveWeights(updatedWeights);
  }, [selectedObjectives]);

  const handleRetryLoading = useCallback(() => {
    refetch();
  }, [refetch]);

  // Production-optimized save and proceed function
  const handleSaveAndProceed = useCallback(async () => {
    if (selectedObjectives.length === 0 || Math.abs(totalWeight - 100) >= 0.01) {
      setValidationError("Please select objectives with a total weight of exactly 100% before proceeding");
      return;
    }
    
    setIsSavingWeights(true);
    setValidationError(null);
    setSaveError(null);
    setSaveProgress({ current: 0, total: selectedObjectives.length, message: 'Preparing to save...' });
    
    try {
      console.log('HorizontalObjectiveSelector: Starting save process');
      
      const saveOperations = [];
      
      selectedObjectives.forEach(obj => {
        if (!obj || !obj.id) {
          console.error('Skipping objective without ID:', obj);
          return;
        }
        
        const newWeight = objectiveWeights[obj.id];
        if (newWeight === undefined) {
          console.error('Skipping objective without weight:', obj.id, obj.title);
          return;
        }
        
        console.log('Processing objective for save:', { id: obj.id, title: obj.title, newWeight });
        
        if (obj.is_default) {
          saveOperations.push({
            type: 'update',
            id: obj.id,
            data: {
              id: obj.id, // Ensure ID is included
              planner_weight: newWeight,
              title: obj.title,
              description: obj.description,
              weight: obj.weight,
              is_default: obj.is_default,
            },
            name: obj.title
          });
        } else {
          saveOperations.push({
            type: 'update',
            id: obj.id,
            data: {
              id: obj.id, // Ensure ID is included
              weight: newWeight,
              planner_weight: null,
              title: obj.title,
              description: obj.description,
              is_default: obj.is_default
            },
            name: obj.title
          });
        }
      });
      
      console.log('Save operations prepared:', saveOperations.length, 'operations');
      
      if (saveOperations.length === 0) {
        setValidationError('No valid objectives to save');
        setIsSavingWeights(false);
        setSaveProgress(null);
        return;
      }
      
      // Execute updates in batches
      const BATCH_SIZE = 3;
      let completedOperations = 0;
      
      for (let i = 0; i < saveOperations.length; i += BATCH_SIZE) {
        const batch = saveOperations.slice(i, i + BATCH_SIZE);
        
        setSaveProgress({
          current: completedOperations,
          total: saveOperations.length,
          message: `Saving objectives ${completedOperations + 1}-${Math.min(completedOperations + BATCH_SIZE, saveOperations.length)} of ${saveOperations.length}...`
        });
        
        const batchPromises = batch.map(async (operation) => {
          try {
            console.log('Saving objective:', operation.id, operation.name, operation.data);
            
            if (!operation.id || !operation.data) {
              throw new Error('Invalid operation data');
            }
            
            return await updateObjectiveMutation.mutateAsync(operation.data);
          } catch (error) {
            console.error(`Failed to save objective ${operation.name} (ID: ${operation.id}):`, error);
            throw new Error(`Failed to save "${operation.name}": ${error.message}`);
          }
        });
        
        await Promise.all(batchPromises);
        completedOperations += batch.length;
      }
      
      setSaveProgress({
        current: saveOperations.length,
        total: saveOperations.length,
        message: 'Finalizing changes...'
      });
      
      await queryClient.invalidateQueries({ queryKey: ['objectives'] });
      
      console.log('HorizontalObjectiveSelector: All objectives saved, proceeding');
      setSaveProgress(null);
      onProceed();
      
    } catch (error: any) {
      console.error('Failed to save objective weights:', error);
      setSaveError(error.message || 'Failed to save objective weights. Please try again.');
    } finally {
      setIsSavingWeights(false);
      setSaveProgress(null);
    }
  }, [selectedObjectives, totalWeight, objectiveWeights, onProceed, updateObjectiveMutation, queryClient]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-600">Loading objectives...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
          <span className="text-red-800">Failed to load objectives</span>
        </div>
        <button
          onClick={handleRetryLoading}
          className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  // No data state
  if (!Array.isArray(objectivesData) || objectivesData.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
          <span className="text-yellow-800">No objectives available</span>
        </div>
        <button
          onClick={handleRetryLoading}
          className="mt-2 px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Display During Save */}
      {saveProgress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-blue-800 font-medium">Saving Objectives...</span>
            <span className="text-blue-700 text-sm">
              {saveProgress.current}/{saveProgress.total}
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-blue-700 text-sm">{saveProgress.message}</p>
        </div>
      )}

      {/* Save Error Display */}
      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <div>
              <h4 className="text-red-800 font-medium">Save Failed</h4>
              <p className="text-red-700 text-sm mt-1">{saveError}</p>
            </div>
          </div>
          <button
            onClick={() => setSaveError(null)}
            className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Weight Summary and Controls */}
      {selectedObjectives.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Info className="h-5 w-5 text-blue-600 mr-2" />
              <span className="text-blue-800 font-medium">
                Total Weight: {totalWeight.toFixed(2)}% / 100%
              </span>
            </div>
            {Math.abs(totalWeight - 100) < 0.01 ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-orange-600" />
            )}
          </div>
          
          {validationError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-red-800 text-sm">{validationError}</span>
              </div>
            </div>
          )}
          
          <div className="flex space-x-3">
            <button
              onClick={handleAutoDistribute}
              disabled={isSavingWeights}
              className="w-full px-4 py-2 text-sm bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              Auto-distribute weights equally
            </button>
            
            <button
              onClick={handleSaveAndProceed}
              disabled={!isFormValid || selectedObjectives.length === 0 || isSavingWeights}
              className="w-full px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSavingWeights ? (
                <>
                  <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2"></div>
                  Saving Weights...
                </>
              ) : (
                <>
                  Proceed to Planning
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Selected Objectives Section */}
      {selectedObjectives.length > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <h3 className="text-md font-medium text-gray-800 mb-4">
            Selected Objectives ({selectedObjectives.length})
          </h3>
          
          <div className="space-y-3">
            {selectedObjectives.map(obj => {
              if (!obj || !obj.id) return null;
              
              if (!obj || (!obj.id && obj.id !== 0)) {
                console.warn('Rendering objective without valid ID:', obj);
                return null;
              }
              
              const id = obj.id.toString();
              const effectiveWeight = objectiveWeights[id] !== undefined ? 
                                     objectiveWeights[id] : 
                                     getEffectiveWeight(obj);
              
              return (
                <div key={id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center flex-1">
                      <Target className="h-5 w-5 text-blue-600 mr-2 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{obj.title}</h4>
                        <p className="text-sm text-gray-500 mt-1">{obj.description}</p>
                        {obj.is_default && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-2">
                            Default (Original: {obj.weight}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveObjective(id)}
                      disabled={isSavingWeights}
                      className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full ml-2 disabled:opacity-50"
                      aria-label="Remove objective"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Weight (%)
                    </label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          const currentWeight = effectiveWeight;
                          const newWeight = Math.max(0, parseFloat((currentWeight - 1).toFixed(1)));
                          handleWeightChange(id, newWeight);
                        }}
                        disabled={isSavingWeights}
                        className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={effectiveWeight}
                        onChange={(e) => handleWeightChange(id, Number(e.target.value))}
                        disabled={isSavingWeights}
                        className="block w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-center disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const currentWeight = effectiveWeight;
                          const newWeight = Math.min(100, parseFloat((currentWeight + 1).toFixed(1)));
                          handleWeightChange(id, newWeight);
                        }}
                        disabled={isSavingWeights}
                        className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Objectives Section */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <h3 className="text-md font-medium text-gray-800 mb-4">Available Strategic Objectives</h3>
        
        {unselectedObjectives.length === 0 ? (
          <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-500">
              {selectedObjectives.length > 0 
                ? "All objectives have been selected" 
                : "No objectives available for selection"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unselectedObjectives.map((objective: StrategicObjective) => {
              if (!objective || (!objective.id && objective.id !== 0)) {
                console.warn('Skipping unselected objective without valid ID:', objective);
                return null;
              }
              
              const id = objective.id.toString();
              
              const effectiveWeight = objective.planner_weight !== undefined && objective.planner_weight !== null
                ? objective.planner_weight
                : objective.weight;
                
              return (
                <div 
                  key={id}
                  onClick={() => !isSavingWeights && handleSelectObjective(objective)}
                  className={`bg-white p-4 rounded-lg border border-gray-200 hover:border-blue-300 cursor-pointer transition-colors ${
                    isSavingWeights ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <div className="flex items-center mb-2">
                    <Target className="h-5 w-5 text-blue-600 mr-2" />
                    <h4 className="font-medium text-gray-900">{objective.title}</h4>
                  </div>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{objective.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                      {objective.is_default ? 'Default' : 'Custom'} Weight: {effectiveWeight}%
                      {objective.planner_weight !== undefined && objective.planner_weight !== null && 
                        ` (Original: ${objective.weight}%)`
                      }
                    </span>
                    <span className="text-blue-600 text-sm flex items-center">
                      <Plus className="h-4 w-4 mr-1" /> Add
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Empty state */}
      {selectedObjectives.length === 0 && (
        <div className="text-center p-6 bg-gray-50 border-2 border-dashed border-gray-200 rounded-lg">
          <Target className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">No objectives selected yet. Please select at least one objective from below.</p>
        </div>
      )}
    </div>
  );
};

export default HorizontalObjectiveSelector;