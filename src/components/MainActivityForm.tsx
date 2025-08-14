import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Loader, Calendar, AlertCircle, Info, CheckCircle } from 'lucide-react';
import type { MainActivity, TargetType } from '../types/plan';
import { MONTHS, QUARTERS, Month, Quarter, TARGET_TYPES } from '../types/plan';
import { auth, mainActivities, api } from '../lib/api';

interface MainActivityFormProps {
  initiativeId: string;
  currentTotal: number;
  onSubmit: (data: Partial<MainActivity>) => Promise<void>;
  initialData?: MainActivity | null;
  onCancel: () => void;
}

const MainActivityForm: React.FC<MainActivityFormProps> = ({
  initiativeId,
  currentTotal,
  onSubmit,
  initialData,
  onCancel
}) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initiativeWeight, setInitiativeWeight] = useState(0);
  const [existingActivitiesWeight, setExistingActivitiesWeight] = useState(0);
  const [periodType, setPeriodType] = useState<'months' | 'quarters'>(
    initialData?.selected_quarters?.length ? 'quarters' : 'months'
  );
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [isLoadingWeights, setIsLoadingWeights] = useState(true);

  // Form setup
  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<Partial<MainActivity>>({
    defaultValues: {
      initiative: initiativeId,
      name: initialData?.name || '',
      weight: initialData?.weight || 0,
      selected_months: initialData?.selected_months || [],
      selected_quarters: initialData?.selected_quarters || [],
      baseline: initialData?.baseline || '',
      target_type: initialData?.target_type || 'cumulative',
      q1_target: initialData?.q1_target || 0,
      q2_target: initialData?.q2_target || 0,
      q3_target: initialData?.q3_target || 0,
      q4_target: initialData?.q4_target || 0,
      annual_target: initialData?.annual_target || 0
    }
  });

  // CRITICAL: Load weight data exactly as backend calculates it
  useEffect(() => {
    const loadWeightData = async () => {
      try {
        setIsLoadingWeights(true);
        setSubmitError(null);
        
        // Get user organization
        const userData = await auth.getCurrentUser();
        if (!userData.isAuthenticated) {
          setSubmitError('Authentication required');
          return;
        }
        
        const orgId = userData.userOrganizations?.[0]?.organization;
        if (!orgId) {
          setSubmitError('No organization assigned');
          return;
        }
        setUserOrgId(orgId);

        // Get initiative weight
        const initiativeResponse = await api.get(`/strategic-initiatives/${initiativeId}/`);
        const initiative = initiativeResponse.data;
        if (!initiative?.weight) {
          setSubmitError('Initiative weight not found');
          return;
        }
        
        const initWeight = parseFloat(initiative.weight);
        setInitiativeWeight(initWeight);

        // Get existing activities for weight calculation
        const activitiesResponse = await api.get(`/main-activities/?initiative=${initiativeId}`);
        const activities = activitiesResponse.data?.results || activitiesResponse.data || [];
        
        // Filter by user organization and exclude current activity if editing
        const relevantActivities = activities.filter(activity => {
          const belongsToUserOrg = !activity.organization || activity.organization === orgId;
          const isNotCurrentActivity = !initialData || activity.id !== initialData.id;
          return belongsToUserOrg && isNotCurrentActivity;
        });
        
        const totalExistingWeight = relevantActivities.reduce((sum, activity) => 
          sum + parseFloat(activity.weight || 0), 0
        );
        
        setExistingActivitiesWeight(totalExistingWeight);
        
        console.log('Weight calculation loaded:', {
          initiativeWeight: initWeight,
          maxAllowed: initWeight * 0.65,
          existingWeight: totalExistingWeight,
          availableWeight: (initWeight * 0.65) - totalExistingWeight,
          isEditing: !!initialData
        });
        
      } catch (error) {
        console.error('Failed to load weight data:', error);
        setSubmitError('Failed to load weight calculation data');
      } finally {
        setIsLoadingWeights(false);
      }
    };
    
    loadWeightData();
  }, [initiativeId, initialData]);

  // Weight calculations
  const maxAllowedTotal = parseFloat((initiativeWeight * 0.65).toFixed(2));
  const availableWeight = parseFloat((maxAllowedTotal - existingActivitiesWeight).toFixed(2));
  const maxWeight = Math.max(0, availableWeight);

  // Watch form values
  const selectedMonths = watch('selected_months') || [];
  const selectedQuarters = watch('selected_quarters') || [];
  const hasPeriodSelected = selectedMonths.length > 0 || selectedQuarters.length > 0;
  
  const targetType = watch('target_type') as TargetType;
  const baseline = watch('baseline') || '';
  const q1Target = Number(watch('q1_target')) || 0;
  const q2Target = Number(watch('q2_target')) || 0;
  const q3Target = Number(watch('q3_target')) || 0;
  const q4Target = Number(watch('q4_target')) || 0;
  const annualTarget = Number(watch('annual_target')) || 0;
  const currentWeight = Number(watch('weight')) || 0;

  // Calculate display targets
  const sixMonthTarget = targetType === 'cumulative' ? q1Target + q2Target : q2Target;
  const nineMonthTarget = targetType === 'cumulative' ? q1Target + q2Target + q3Target : q3Target;
  const calculatedYearlyTarget = targetType === 'cumulative' 
    ? q1Target + q2Target + q3Target + q4Target 
    : targetType === 'constant' 
      ? (q1Target === q2Target && q2Target === q3Target && q3Target === q4Target && q1Target === annualTarget ? annualTarget : 0)
      : q4Target;

  // Form submission
  const handleFormSubmit = async (data: Partial<MainActivity>) => {
    if (isLoadingWeights) {
      setSubmitError('Please wait for weight data to load');
      return;
    }

    if (currentWeight > maxWeight) {
      setSubmitError(`Weight ${currentWeight}% exceeds available weight ${maxWeight}%`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Clean data for submission
      const activityData = {
        name: String(data.name || '').trim(),
        initiative: initiativeId,
        weight: parseFloat(String(data.weight || 0)),
        baseline: String(data.baseline || '').trim(),
        target_type: String(data.target_type || 'cumulative'),
        q1_target: parseFloat(String(data.q1_target || 0)),
        q2_target: parseFloat(String(data.q2_target || 0)),
        q3_target: parseFloat(String(data.q3_target || 0)),
        q4_target: parseFloat(String(data.q4_target || 0)),
        annual_target: parseFloat(String(data.annual_target || 0)),
        selected_months: periodType === 'months' ? (data.selected_months || []) : [],
        selected_quarters: periodType === 'quarters' ? (data.selected_quarters || []) : [],
        organization: userOrgId
      };

      console.log('Submitting activity:', activityData);

      let result;
      if (initialData?.id) {
        result = await mainActivities.update(initialData.id, activityData);
      } else {
        result = await mainActivities.create(activityData);
      }
      
      console.log('Activity saved successfully:', result);
      
      // CRITICAL: Immediately refresh the activities list
      queryClient.invalidateQueries({ queryKey: ['main-activities', initiativeId] });
      queryClient.refetchQueries({ queryKey: ['main-activities', initiativeId] });
      
      await onSubmit(result.data || result);
      
    } catch (error: any) {
      console.error('Form submission error:', error);
      
      let errorMessage = 'Failed to save activity';
      
      if (error.response?.data) {
        if (Array.isArray(error.response.data)) {
          errorMessage = error.response.data.join(', ');
        } else if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.non_field_errors) {
          const errors = error.response.data.non_field_errors;
          errorMessage = Array.isArray(errors) ? errors.join(', ') : String(errors);
        } else {
          const firstField = Object.keys(error.response.data)[0];
          const firstError = error.response.data[firstField];
          errorMessage = Array.isArray(firstError) ? firstError.join(', ') : String(firstError);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePeriodType = () => {
    if (periodType === 'months') {
      setValue('selected_months', []);
      setPeriodType('quarters');
    } else {
      setValue('selected_quarters', []);
      setPeriodType('months');
    }
  };

  if (isLoadingWeights) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading weight calculation...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Weight Information */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="text-sm font-medium text-blue-700 mb-3 flex items-center">
          <Info className="h-4 w-4 mr-2" />
          Weight Distribution (65% Rule)
        </h4>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="text-center">
            <div className="text-blue-600 font-medium">Initiative Weight</div>
            <div className="text-lg font-bold text-gray-900">{initiativeWeight}%</div>
          </div>
          <div className="text-center">
            <div className="text-blue-600 font-medium">Max Allowed (65%)</div>
            <div className="text-lg font-bold text-blue-600">{maxAllowedTotal}%</div>
          </div>
          <div className="text-center">
            <div className="text-blue-600 font-medium">Other Activities</div>
            <div className="text-lg font-bold text-gray-700">{existingActivitiesWeight.toFixed(2)}%</div>
          </div>
          <div className="text-center">
            <div className="text-blue-600 font-medium">Available</div>
            <div className={`text-lg font-bold ${availableWeight > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {availableWeight.toFixed(2)}%
            </div>
          </div>
        </div>
        
        {availableWeight <= 0 && (
          <div className="mt-3 p-3 bg-red-100 border border-red-300 rounded">
            <AlertCircle className="h-4 w-4 inline mr-2 text-red-600" />
            <span className="text-red-700 text-sm">
              No weight available! Activities already use {existingActivitiesWeight.toFixed(2)}% of allowed {maxAllowedTotal}%
            </span>
          </div>
        )}
        
        {availableWeight > 0 && (
          <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded">
            <CheckCircle className="h-4 w-4 inline mr-2 text-green-600" />
            <span className="text-green-700 text-sm">
              You can use up to {availableWeight.toFixed(2)}% for this activity
            </span>
          </div>
        )}
      </div>

      {/* Error Display */}
      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Error saving activity:</p>
              <p className="text-sm text-red-600 mt-1 whitespace-pre-wrap">{submitError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Activity Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Activity Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          {...register('name', { 
            required: 'Activity name is required',
            minLength: { value: 2, message: 'Name must be at least 2 characters' }
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter activity name"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Weight */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Weight (%) <span className="text-red-500">*</span>
          <span className="text-blue-600 ml-2">(Available: {maxWeight.toFixed(2)}%)</span>
        </label>
        <div className="mt-1 relative rounded-md shadow-sm">
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={maxWeight}
            {...register('weight', {
              required: 'Weight is required',
              min: { value: 0.01, message: 'Weight must be greater than 0' },
              max: { value: maxWeight, message: `Weight cannot exceed ${maxWeight.toFixed(2)}%` },
              valueAsNumber: true
            })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="Enter weight value"
            disabled={availableWeight <= 0}
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">%</span>
          </div>
        </div>
        {errors.weight && (
          <p className="mt-1 text-sm text-red-600">{errors.weight.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Rule: Total activities ≤ 65% of initiative weight ({initiativeWeight}%)
        </p>
        {currentWeight > 0 && (
          <p className="mt-1 text-xs text-blue-600">
            After adding: {(existingActivitiesWeight + currentWeight).toFixed(2)}% / {maxAllowedTotal}%
          </p>
        )}
      </div>

      {/* Baseline */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Baseline <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          {...register('baseline', { required: 'Baseline is required' })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter current value or starting point"
        />
        {errors.baseline && (
          <p className="mt-1 text-sm text-red-600">{errors.baseline.message}</p>
        )}
      </div>

      {/* Period Selection */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-gray-700">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              Period Selection <span className="text-red-500">*</span>
            </span>
          </label>
          <button
            type="button"
            onClick={togglePeriodType}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 rounded-md"
          >
            Switch to {periodType === 'months' ? 'Quarters' : 'Months'}
          </button>
        </div>

        {periodType === 'months' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MONTHS.map((month) => (
              <label
                key={month.value}
                className={`relative flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedMonths.includes(month.value) 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-400'
                }`}
              >
                <Controller
                  name="selected_months"
                  control={control}
                  defaultValue={[]}
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      value={month.value}
                      checked={field.value?.includes(month.value)}
                      onChange={(e) => {
                        const value = e.target.value as Month;
                        const currentValues = field.value || [];
                        field.onChange(
                          e.target.checked
                            ? [...currentValues, value]
                            : currentValues.filter((v) => v !== value)
                        );
                      }}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  )}
                />
                <span className="ml-3 text-sm font-medium text-gray-900">
                  {month.label}
                  <span className="block text-xs text-gray-500">
                    {month.quarter}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {QUARTERS.map((quarter) => (
              <label
                key={quarter.value}
                className={`relative flex items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedQuarters.includes(quarter.value) 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-400'
                }`}
              >
                <Controller
                  name="selected_quarters"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="checkbox"
                      value={quarter.value}
                      checked={field.value?.includes(quarter.value)}
                      onChange={(e) => {
                        const value = e.target.value as Quarter;
                        const currentValues = field.value || [];
                        field.onChange(
                          e.target.checked
                            ? [...currentValues, value]
                            : currentValues.filter((v) => v !== value)
                        );
                      }}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  )}
                />
                <span className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">
                    {quarter.label}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {quarter.months.join(', ')}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {!hasPeriodSelected && (
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-md border border-amber-200 flex items-center">
            <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
            <span>Please select at least one {periodType === 'months' ? 'month' : 'quarter'}</span>
          </p>
        )}
      </div>

      {/* Target Type Selection */}
      <div className="border-t border-gray-200 pt-4">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Type
          </label>
          <select
            {...register('target_type')}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {TARGET_TYPES.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 flex items-center">
            <Info className="h-4 w-4 mr-1 text-blue-500" />
            {TARGET_TYPES.find(t => t.value === targetType)?.description}
          </p>
        </div>

        <h3 className="text-lg font-medium text-gray-900 mb-4">Targets</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Annual Target <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              {...register('annual_target', {
                required: 'Annual target is required',
                valueAsNumber: true
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Enter annual target value"
            />
            {errors.annual_target && (
              <p className="mt-1 text-sm text-red-600">{errors.annual_target.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Q1 Target (Jul-Sep) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              {...register('q1_target', {
                required: 'Q1 target is required',
                valueAsNumber: true
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Q1 target value"
            />
            {errors.q1_target && (
              <p className="mt-1 text-sm text-red-600">{errors.q1_target.message}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Q2 Target (Oct-Dec) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              {...register('q2_target', {
                required: 'Q2 target is required',
                valueAsNumber: true
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Q2 target value"
            />
            {errors.q2_target && (
              <p className="mt-1 text-sm text-red-600">{errors.q2_target.message}</p>
            )}
          </div>
          
          <div className="bg-blue-50 p-3 rounded-md flex flex-col justify-center">
            <label className="block text-sm font-medium text-blue-700 mb-1">
              6 Month Target {targetType === 'cumulative' ? '(Q1+Q2)' : '(Q2)'}
            </label>
            <div className="mt-1 text-lg font-medium text-blue-800">
              {sixMonthTarget}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Q3 Target (Jan-Mar) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              {...register('q3_target', {
                required: 'Q3 target is required',
                valueAsNumber: true
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Q3 target value"
            />
            {errors.q3_target && (
              <p className="mt-1 text-sm text-red-600">{errors.q3_target.message}</p>
            )}
          </div>
          
          <div className="bg-blue-50 p-3 rounded-md flex flex-col justify-center">
            <label className="block text-sm font-medium text-blue-700 mb-1">
              9 Month Target {targetType === 'cumulative' ? '(Q1+Q2+Q3)' : '(Q3)'}
            </label>
            <div className="mt-1 text-lg font-medium text-blue-800">
              {nineMonthTarget}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Q4 Target (Apr-Jun) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              {...register('q4_target', {
                required: 'Q4 target is required',
                valueAsNumber: true
              })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Q4 target value"
            />
            {errors.q4_target && (
              <p className="mt-1 text-sm text-red-600">{errors.q4_target.message}</p>
            )}
          </div>
          
          <div className={`p-3 rounded-md ${
            Math.abs(calculatedYearlyTarget - annualTarget) < 0.01 ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <label className={`block text-sm font-medium mb-1 ${
              Math.abs(calculatedYearlyTarget - annualTarget) < 0.01 ? 'text-green-700' : 'text-red-700'
            }`}>
              Calculated Annual
            </label>
            <div className={`mt-1 text-lg font-medium ${
              Math.abs(calculatedYearlyTarget - annualTarget) < 0.01 ? 'text-green-800' : 'text-red-800'
            }`}>
              {calculatedYearlyTarget}
            </div>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || availableWeight <= 0 || currentWeight > maxWeight || !hasPeriodSelected}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <span className="flex items-center">
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            initialData ? 'Update Activity' : 'Create Activity'
          )}
        </button>
      </div>
    </form>
  );
};

export default MainActivityForm;