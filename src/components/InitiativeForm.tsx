import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Loader, ArrowLeft, AlertCircle, Info } from 'lucide-react';
import { initiatives, initiativeFeeds, auth } from '../lib/api';

interface InitiativeFormProps {
  parentId: string;
  parentType: 'objective' | 'program';
  parentWeight: number;
  selectedObjectiveData?: any;
 // The objective data with custom weights
  currentTotal: number;
  onSubmit: (data: any) => Promise<void>;
  onCancel: () => void;
  initialData?: any;
}

const InitiativeForm: React.FC<InitiativeFormProps> = ({
  parentId,
  parentType,
  parentWeight,
  selectedObjectiveData,
 
  currentTotal,
  onSubmit,
  onCancel,
  initialData
}) => {
  const { t } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFeedId, setSelectedFeedId] = useState<string>('');
  const [initiativeMode, setInitiativeMode] = useState<'custom' | 'predefined'>('custom');
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);
  const [availableFeeds, setAvailableFeeds] = useState<any[]>([]);
  const [existingInitiatives, setExistingInitiatives] = useState<any[]>([]);
  const [useInitiativeFeed, setUseInitiativeFeed] = useState<boolean>(
    initialData?.initiative_feed ? true : false
  );
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  
  // Use parentWeight directly - this should be the custom weight from Planning.tsx
  const effectiveParentWeight = parentWeight;
  
  console.log('InitiativeForm initialized with:', {
    parentId,
    parentType,
    parentWeight,
    effectiveParentWeight,
    selectedObjectiveData: selectedObjectiveData ? {
      id: selectedObjectiveData.id,
      title: selectedObjectiveData.title,
      weight: selectedObjectiveData.weight,
      planner_weight: selectedObjectiveData.planner_weight,
      effective_weight: selectedObjectiveData.effective_weight
    } : 'not provided'
  });
  
  console.log('InitiativeForm received:', {
    parentWeight,
    parentType,
    parentId,
    selectedObjectiveData: selectedObjectiveData ? 'provided' : 'not provided',
    effectiveParentWeight,
    customWeight: selectedObjectiveData?.effective_weight || selectedObjectiveData?.planner_weight
  });

  const { register, handleSubmit, watch, setValue, reset, control, formState: { errors } } = useForm<any>({
    defaultValues: {
      name: initialData?.name || '',
      weight: initialData?.weight || '',
      initiative_feed: initialData?.initiative_feed || ''
    }
  });

  // Watch form fields
  const watchedName = watch('name') || '';
  const selectedInitiativeFeed = watch('initiative_feed');
  const watchedWeight = watch('weight');

  // Get user organization ID and ensure it's available
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
          console.log('InitiativeForm: User organization ID set to:', authData.userOrganizations[0].organization);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      }
    };
    
    fetchUserData();
  }, []);


  // WORKING AUTO-FILL LOGIC FROM PREVIOUS CODE
  // When a feed is selected, update the name field
  useEffect(() => {
    if (useInitiativeFeed && selectedInitiativeFeed && availableFeeds.length > 0) {
      const selectedFeed = availableFeeds.find((feed: any) => 
        feed.id.toString() === selectedInitiativeFeed.toString());
      
      if (selectedFeed) {
        console.log('Auto-filling name with:', selectedFeed.name);
        setValue('name', selectedFeed.name);
      }
    }
  }, [selectedInitiativeFeed, availableFeeds, useInitiativeFeed, setValue]);

  // Fetch existing initiatives for weight calculation - FILTER BY USER ORGANIZATION
  useEffect(() => {
    const fetchExistingInitiatives = async () => {
      if (!parentId) return;
      
      try {
        console.log(`InitiativeForm: Fetching existing initiatives for ${parentType} ${parentId}`);
        console.log(`InitiativeForm: User organization ID: ${userOrgId}`);
        
        let response;
        if (parentType === 'objective') {
          response = await initiatives.getByObjective(parentId);
        } else if (parentType === 'program') {
          response = await initiatives.getByProgram(parentId);
        } else {
          return;
        }
        
        const initiativesData = response?.data || [];
        console.log(`InitiativeForm: Raw initiatives from API (${initiativesData.length}):`, 
          initiativesData.map(i => ({
            id: i.id,
            name: i.name,
            weight: i.weight,
            organization: i.organization,
            is_default: i.is_default
          }))
        );
        
        // CRITICAL FIX: Filter initiatives to only include:
        // 1. Default initiatives (available to all)
        // 2. Initiatives created by the current user's organization
        const filteredInitiatives = initiativesData.filter(initiative => {
          const isDefault = initiative.is_default;
          const belongsToUserOrg = initiative.organization === userOrgId || !initiative.organization;
          
          const shouldInclude = isDefault || belongsToUserOrg;
          
          console.log(`Initiative "${initiative.name}": isDefault=${isDefault}, org=${initiative.organization}, userOrg=${userOrgId}, belongsToUserOrg=${belongsToUserOrg}, shouldInclude=${shouldInclude}`);
          
          return shouldInclude;
        });
        
        console.log('InitiativeForm: Total initiatives from API:', initiativesData.length);
        console.log('InitiativeForm: Filtered initiatives for user org:', filteredInitiatives.length);
        console.log('InitiativeForm: Filtered initiatives details:', 
          filteredInitiatives.map(i => ({
            id: i.id,
            name: i.name,
            weight: i.weight,
            organization: i.organization,
            is_default: i.is_default
          }))
        );
        
        setExistingInitiatives(filteredInitiatives);
      } catch (error) {
        console.error('Error fetching existing initiatives:', error);
        setExistingInitiatives([]);
      }
    };
    
    // Only fetch when we have userOrgId
    if (userOrgId !== null) {
      fetchExistingInitiatives();
    }
  }, [parentId, parentType, userOrgId]);

  // Calculate weight constraints
  const calculateWeights = () => {
    console.log('InitiativeForm: calculateWeights called with:', {
      parentWeight,
      selectedObjectiveData: selectedObjectiveData ? {
        id: selectedObjectiveData.id,
        title: selectedObjectiveData.title,
        weight: selectedObjectiveData.weight,
        planner_weight: selectedObjectiveData.planner_weight,
        effective_weight: selectedObjectiveData.effective_weight
      } : 'not provided',
      existingInitiatives: existingInitiatives.length
    });
    
    // Filter out the current initiative if editing
    const otherInitiatives = existingInitiatives.filter(init => 
      !initialData || init.id !== initialData.id
    );
    
    // Calculate total weight of other initiatives
    const otherInitiativesWeight = otherInitiatives.reduce((sum, init) => 
      sum + (Number(init.weight) || 0), 0
    );
    
    // Use the parentWeight prop directly (this is the custom weight from Planning.tsx)
    const remainingWeight = parentWeight - otherInitiativesWeight;
    const maxWeight = Math.max(0, remainingWeight);
    
    console.log('InitiativeForm: Weight calculation:', {
      parentWeight,
      otherInitiativesWeight,
      remainingWeight,
      maxWeight,
      currentWeight: Number(watchedWeight) || 0,
      totalWithCurrent: otherInitiativesWeight + (Number(watchedWeight) || 0)
    });
    
    return {
      otherInitiativesWeight,
      remainingWeight,
      maxWeight,
      totalWithCurrent: otherInitiativesWeight + (Number(watchedWeight) || 0),
      parentWeight: parentWeight
    };
  };

  const weights = calculateWeights();

  // Load initiative feeds based on parent type
  useEffect(() => {
    const loadFeeds = async () => {
      try {
        setIsLoadingFeeds(true);
        setError(null);
        
        let response;
        if (parentType === 'objective') {
          response = await initiativeFeeds.getByObjective(parentId);
        } else {
          response = await initiativeFeeds.getAll();
        }
        
        setAvailableFeeds(response?.data || []);
      } catch (error) {
        console.error('Error loading initiative feeds:', error);
        setError('Failed to load predefined initiatives');
        setAvailableFeeds([]);
      } finally {
        setIsLoadingFeeds(false);
      }
    };
    
    if (initiativeMode === 'predefined' && parentId) {
      loadFeeds();
    } else {
      setAvailableFeeds([]);
    }
  }, [initiativeMode, parentId, parentType]);

  // Auto-fill name when predefined initiative is selected
  useEffect(() => {
    if (initiativeMode === 'predefined' && selectedInitiativeFeed && availableFeeds.length > 0) {
      const selectedFeed = availableFeeds.find(feed => feed.id === selectedInitiativeFeed);
      if (selectedFeed) {
        console.log('Auto-filling name with:', selectedFeed.name);
        setValue('name', selectedFeed.name);
        setSelectedFeedId(selectedInitiativeFeed);
      }
    }
  }, [selectedInitiativeFeed, availableFeeds, initiativeMode, setValue]);

  const handleFormSubmit = async (data: any) => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      // Ensure we have user organization ID
      if (!userOrgId) {
        setError('User organization not found. Please refresh the page and try again.');
        setIsSubmitting(false);
        return;
      }
      
      // Validate that the weight doesn't exceed the remaining weight
      const currentWeight = Number(data.weight) || 0;
      if (currentWeight > weights.maxWeight) {
        setError(`Weight cannot exceed ${weights.maxWeight.toFixed(2)}%. Available weight: ${weights.remainingWeight.toFixed(2)}% (Custom parent weight: ${parentWeight}%)`);
        setIsSubmitting(false);
        return;
      }
      
      // For objectives, validate that total weight doesn't exceed parent weight
      if (parentType === 'objective' && weights.totalWithCurrent > parentWeight) {
        setError(`Total initiative weight (${weights.totalWithCurrent.toFixed(2)}%) cannot exceed custom objective weight (${parentWeight.toFixed(2)}%)`);
        setIsSubmitting(false);
        return;
      }
      
      // Prepare submission data
      const submissionData = {
        ...data,
        weight: Number(data.weight),
        [parentType === 'objective' ? 'strategic_objective' : 'program']: parentId,
        // Organization assignment - critical for filtering
        organization: userOrgId,
        organization_id: userOrgId,
        // Preserve is_default status for updates, set false for new initiatives
        is_default: initialData?.is_default || false,
        // Include initiative_feed if selected from predefined list
        initiative_feed: useInitiativeFeed && selectedInitiativeFeed ? selectedInitiativeFeed : null
      };

      console.log('InitiativeForm: Submitting initiative with data:', submissionData);
      console.log('InitiativeForm: Operation type:', initialData ? 'UPDATE' : 'CREATE');
      console.log('InitiativeForm: Organization assignment:', userOrgId);
      
      await onSubmit(submissionData);
      
      console.log('InitiativeForm: Successfully submitted initiative');
    } catch (error: any) {
      console.error('Error submitting initiative:', error);
      
      // Better error handling
      let errorMessage = 'Failed to save initiative';
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.weight) {
          errorMessage = Array.isArray(error.response.data.weight) 
            ? error.response.data.weight[0] 
            : error.response.data.weight;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize form with existing data
  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name || '',
        weight: initialData.weight || '',
        initiative_feed: initialData.initiative_feed || ''
      });
      
      if (initialData.initiative_feed) {
        setInitiativeMode('predefined');
        setSelectedFeedId(initialData.initiative_feed);
      }
    }
  }, [initialData, reset]);

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Weight Summary */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-blue-600">Parent Weight</p>
            <p className="font-semibold text-blue-800">{parentWeight.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-blue-600">Other Initiatives</p>
            <p className="font-semibold text-blue-800">{weights.otherInitiativesWeight.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-blue-600">Available</p>
            <p className={`font-semibold ${weights.remainingWeight > 0 ? 'text-green-600' : weights.remainingWeight < 0 ? 'text-red-600' : 'text-blue-800'}`}>
              {weights.remainingWeight.toFixed(2)}%
            </p>
          </div>
        </div>
        
        {parentType === 'objective' && (
          <p className="mt-2 text-xs text-blue-600">
            <strong>Important:</strong> For this objective with custom weight {parentWeight.toFixed(2)}%, 
            the total initiative weights must equal <strong>exactly {parentWeight.toFixed(2)}%</strong>.
          </p>
        )}
        
        {weights.remainingWeight < 0 && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
            <AlertCircle className="h-4 w-4 inline mr-1" />
            Total weight exceeds parent weight by {Math.abs(weights.remainingWeight).toFixed(2)}%
          </div>
        )}
        
        {watchedWeight && (
          <div className="mt-2 text-xs text-blue-600">
            <strong>Current calculation:</strong> Other initiatives ({weights.otherInitiativesWeight.toFixed(2)}%) + This initiative ({Number(watchedWeight).toFixed(2)}%) = {weights.totalWithCurrent.toFixed(2)}%
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Initiative Mode Toggle */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div>
          <button 
            type="button" 
            onClick={() => {
              setUseInitiativeFeed(!useInitiativeFeed);
              setInitiativeMode(useInitiativeFeed ? 'custom' : 'predefined');
              if (useInitiativeFeed) {
                setValue('name', '');
                setValue('initiative_feed', null);
              }
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {useInitiativeFeed 
              ? "Enter initiative name manually" 
              : "Select from predefined initiatives"}
          </button>
        </div>
        <h4 className="text-sm font-medium text-gray-700 mb-3">Initiative Type</h4>
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="initiativeMode"
              value="custom"
              checked={!useInitiativeFeed}
              onChange={() => {
                setUseInitiativeFeed(false);
                setInitiativeMode('custom');
                setValue('initiative_feed', null);
              }}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Custom Initiative</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="initiativeMode"
              value="predefined"
              checked={useInitiativeFeed}
              onChange={() => {
                setUseInitiativeFeed(true);
                setInitiativeMode('predefined');
                setValue('name', '');
              }}
              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Predefined Initiative</span>
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {initiativeMode === 'custom' 
            ? 'Create your own custom initiative with a unique name'
            : 'Select from predefined initiatives for this objective'
          }
        </p>
      </div>

      {/* Predefined Initiative Selection - Only show when predefined mode */}
      {useInitiativeFeed && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Predefined Initiative for this {parentType === 'objective' ? 'Objective' : 'Program'}
          </label>
          {isLoadingFeeds ? (
            <div className="flex items-center p-3 bg-gray-50 border border-gray-200 rounded-md">
              <Loader className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm text-gray-500">Loading predefined initiatives...</span>
            </div>
          ) : (
            <div>
              <select
                {...register('initiative_feed', { 
                  required: useInitiativeFeed ? 'Please select an initiative' : false 
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                disabled={isLoadingFeeds}
              >
                <option value="">Select a predefined initiative...</option>
                {availableFeeds.map(feed => (
                  <option key={feed.id} value={feed.id}>
                    {feed.name}
                    {feed.strategic_objective_title && ` (${feed.strategic_objective_title})`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {errors.initiative_feed && (
            <p className="mt-1 text-sm text-red-600">{errors.initiative_feed.message}</p>
          )}
          {useInitiativeFeed && !selectedInitiativeFeed && (
            <p className="mt-1 text-xs text-amber-600">
              Please select a predefined initiative from the dropdown above.
            </p>
          )}
        </div>
      )}

      {/* Initiative Name - Show differently for predefined vs custom */}
      {useInitiativeFeed ? (
        /* Show selected name as read-only when initiative feed is selected */
        selectedInitiativeFeed && watchedName && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initiative Name (from selected initiative)
            </label>
            <div className="mt-1 p-3 bg-gray-100 rounded-md border border-gray-300 text-gray-700">
              {watchedName}
            </div>
            <input type="hidden" {...register('name')} />
            <p className="mt-1 text-xs text-green-600">
              ✓ Name filled from predefined initiative
            </p>
          </div>
        )
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initiative Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            {...register('name', { 
              required: useInitiativeFeed ? false : 'Initiative name is required',
              minLength: { value: 3, message: 'Name must be at least 3 characters' }
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter your custom initiative name"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>
      )}

      {/* Weight Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Weight (%) <span className="text-red-500">*</span>
          <span className="text-blue-600 ml-2">(Maximum: {weights.maxWeight.toFixed(2)}%)</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          max={weights.maxWeight}
          {...register('weight', {
            required: 'Weight is required',
            min: { value: 0.01, message: 'Weight must be greater than 0' },
            max: { value: weights.maxWeight, message: `Weight cannot exceed ${weights.maxWeight.toFixed(2)}%` },
            valueAsNumber: true
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter weight percentage"
        />
        {errors.weight && (
          <p className="mt-1 text-sm text-red-600">{errors.weight.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Weight represents the importance of this initiative within the {parentType}
        </p>
        
        {/* Enhanced weight validation info */}
        <div className="mt-2 text-xs text-blue-600 bg-blue-50 p-2 rounded">
          <p><strong>Weight Distribution:</strong></p>
          <p>• Parent {parentType} weight: {parentWeight.toFixed(2)}% (Custom Weight)</p>
          <p>• Other initiatives: {weights.otherInitiativesWeight.toFixed(2)}%</p>
          <p>• Available for this initiative: {weights.maxWeight.toFixed(2)}%</p>
          {watchedWeight && (
            <p>• Total after adding this: {weights.totalWithCurrent.toFixed(2)}%</p>
          )}
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            isSubmitting || 
            !userOrgId ||
            !weights.maxWeight || 
            weights.maxWeight <= 0 || 
            !watchedWeight || 
            Number(watchedWeight) <= 0 ||
            Number(watchedWeight) > weights.maxWeight ||
            (parentType === 'objective' && weights.totalWithCurrent > parentWeight)
          }
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center">
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            initialData ? 'Update Initiative' : 'Create Initiative'
          )}
        </button>
      </div>
    </form>
  );
};

export default InitiativeForm;