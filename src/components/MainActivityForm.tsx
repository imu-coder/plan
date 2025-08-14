import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Loader, Calendar, AlertCircle, Info, CheckCircle } from 'lucide-react';
import type { MainActivity, TargetType } from '../types/plan';
import { MONTHS, QUARTERS, Month, Quarter, TARGET_TYPES } from '../types/plan';
import { auth, api } from '../lib/api';
import Cookies from 'js-cookie';
import axios from 'axios';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initiativeWeight, setInitiativeWeight] = useState(100);
  const [periodType, setPeriodType] = useState<'months' | 'quarters'>(
    initialData?.selected_quarters?.length ? 'quarters' : 'months'
  );
  const [userOrgId, setUserOrgId] = useState<number | null>(null);
  const [isFormReady, setIsFormReady] = useState(false);

  // Get user organization ID
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await auth.getCurrentUser();
        if (!userData.isAuthenticated) {
          setSubmitError('User not authenticated. Please login again.');
          return;
        }
        
        if (userData.userOrganizations && userData.userOrganizations.length > 0) {
          const orgId = userData.userOrganizations[0].organization;
          setUserOrgId(orgId);
          setIsFormReady(true);
        } else {
          setSubmitError('No organization assigned to user.');
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setSubmitError('Failed to load user data.');
      }
    };
    
    fetchUserData();
  }, []);

  // Fetch initiative weight
  useEffect(() => {
    const fetchInitiativeData = async () => {
      if (!initiativeId) return;
      
      try {
        const response = await api.get(`/strategic-initiatives/${initiativeId}/`);
        if (response.data?.weight) {
          const weight = Number(response.data.weight);
          if (!isNaN(weight) && weight > 0) {
            setInitiativeWeight(weight);
          }
        }
      } catch (error) {
        console.error('Error fetching initiative:', error);
        setInitiativeWeight(35); // fallback
      }
    };
    
    fetchInitiativeData();
  }, [initiativeId]);

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

  // Calculate weights
  const expectedActivitiesWeight = parseFloat((initiativeWeight * 0.65).toFixed(2));
  const safeCurrentTotal = typeof currentTotal === 'number' ? currentTotal : 0;
  const safeInitialWeight = initialData?.weight || 0;
  const adjustedCurrentTotal = initialData ? safeCurrentTotal - safeInitialWeight : safeCurrentTotal;
  const maxWeight = Math.max(0, expectedActivitiesWeight - adjustedCurrentTotal);

  // Watch form fields
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
  const currentName = watch('name') || '';

  // Validate targets based on target type
  const validateTargets = () => {
    const baselineValue = baseline ? parseFloat(baseline) : null;

    if (targetType === 'cumulative') {
      const quarterly_sum = q1Target + q2Target + q3Target + q4Target;
      if (Math.abs(quarterly_sum - annualTarget) > 0.01) {
        return `For cumulative targets, sum of quarterly targets (${quarterly_sum}) must equal annual target (${annualTarget})`;
      }
    } else if (targetType === 'increasing') {
      if (baselineValue !== null && q1Target < baselineValue) {
        return `For increasing targets, Q1 target (${q1Target}) must be >= baseline (${baselineValue})`;
      }
      if (!(q1Target <= q2Target && q2Target <= q3Target && q3Target <= q4Target)) {
        return 'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)';
      }
      if (Math.abs(q4Target - annualTarget) > 0.01) {
        return `For increasing targets, Q4 target (${q4Target}) must equal annual target (${annualTarget})`;
      }
    } else if (targetType === 'decreasing') {
      if (baselineValue !== null && q1Target > baselineValue) {
        return `For decreasing targets, Q1 target (${q1Target}) must be <= baseline (${baselineValue})`;
      }
      if (!(q1Target >= q2Target && q2Target >= q3Target && q3Target >= q4Target)) {
        return 'For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)';
      }
      if (Math.abs(q4Target - annualTarget) > 0.01) {
        return `For decreasing targets, Q4 target (${q4Target}) must equal annual target (${annualTarget})`;
      }
    } else if (targetType === 'constant') {
      if (!(Math.abs(q1Target - annualTarget) < 0.01 && 
            Math.abs(q2Target - annualTarget) < 0.01 && 
            Math.abs(q3Target - annualTarget) < 0.01 && 
            Math.abs(q4Target - annualTarget) < 0.01)) {
        return `For constant targets, all quarterly targets must equal annual target (Q1=Q2=Q3=Q4=${annualTarget})`;
      }
    }
    
    return null;
  };

  // Calculate targets for display
  const sixMonthTarget = targetType === 'cumulative' ? q1Target + q2Target : q2Target;
  const nineMonthTarget = targetType === 'cumulative' ? q1Target + q2Target + q3Target : q3Target;
  const calculatedYearlyTarget = targetType === 'cumulative' 
    ? q1Target + q2Target + q3Target + q4Target 
    : targetType === 'constant' 
      ? (q1Target === q2Target && q2Target === q3Target && q3Target === q4Target && q1Target === annualTarget ? annualTarget : 0)
      : q4Target;

  // Form validation
  const getValidationErrors = () => {
    const errors: string[] = [];
    
    if (!currentName.trim()) {
      errors.push('Activity name is required');
    }
    
    if (!currentWeight || currentWeight <= 0) {
      errors.push('Weight must be greater than 0');
    }
    
    if (currentWeight > maxWeight) {
      errors.push(`Weight cannot exceed ${maxWeight.toFixed(2)}%`);
    }
    
    if (!hasPeriodSelected) {
      errors.push('Please select at least one period');
    }
    
    const targetError = validateTargets();
    if (targetError) {
      errors.push(targetError);
    }
    
    return errors;
  };
  
  const validationErrors = getValidationErrors();
  const isFormValid = validationErrors.length === 0 && Math.abs(calculatedYearlyTarget - annualTarget) < 0.01;

  // PRODUCTION-SAFE FORM SUBMISSION
  const handleFormSubmit = async (data: Partial<MainActivity>) => {
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      // Validate required data
      if (!userOrgId) {
        throw new Error('User organization not found');
      }

      if (!data.name?.trim()) {
        throw new Error('Activity name is required');
      }

      if (!data.weight || data.weight <= 0) {
        throw new Error('Weight must be greater than 0');
      }

      if (!initiativeId) {
        throw new Error('Initiative ID is required');
      }

      // Ensure fresh authentication
      await auth.getCurrentUser();

      // Get fresh CSRF token
      await axios.get('/api/auth/csrf/', { withCredentials: true });

      // Prepare clean data for Django
      const cleanData = {
        name: String(data.name).trim(),
        initiative: initiativeId,
        weight: Number(data.weight),
        baseline: String(data.baseline || '').trim(),
        target_type: String(data.target_type || 'cumulative'),
        q1_target: Number(data.q1_target || 0),
        q2_target: Number(data.q2_target || 0),
        q3_target: Number(data.q3_target || 0),
        q4_target: Number(data.q4_target || 0),
        annual_target: Number(data.annual_target || 0),
        selected_months: periodType === 'months' ? (Array.isArray(data.selected_months) ? data.selected_months : []) : [],
        selected_quarters: periodType === 'quarters' ? (Array.isArray(data.selected_quarters) ? data.selected_quarters : []) : [],
        organization: userOrgId
      };

      // Make API call
      let response;
      if (initialData?.id) {
        response = await api.put(`/main-activities/${initialData.id}/`, cleanData);
      } else {
        response = await api.post('/main-activities/', cleanData);
      }
      
      // Call parent with the response data
      await onSubmit(response.data);
      
    } catch (error: any) {
      console.error('Form submission error:', error);
      let errorMessage = 'Failed to save activity';
      
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response.data.non_field_errors) {
          errorMessage = Array.isArray(error.response.data.non_field_errors) 
            ? error.response.data.non_field_errors[0] 
            : error.response.data.non_field_errors;
        } else {
          // Get first field error
          const firstField = Object.keys(error.response.data)[0];
          const firstError = error.response.data[firstField];
          errorMessage = Array.isArray(firstError) ? firstError[0] : firstError;
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
    setSubmitError(null);
  };

  if (!isFormReady) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading form...</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Target Type Guidelines */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h4 className="text-sm font-medium text-blue-700 mb-2 flex items-center">
          <Info className="h-4 w-4 mr-1 text-blue-500" />
          Target Type Guidelines
        </h4>
        
        <div className="mt-2 text-xs text-blue-600 space-y-2">
          {targetType === 'cumulative' && (
            <>
              <p><strong>Cumulative Target:</strong> Sum of quarterly targets equals annual target (Q1+Q2+Q3+Q4=annual target).</p>
              <p className="ml-4">Example: If you set Q1=20, Q2=30, Q3=25, Q4=25, annual target will be 100.</p>
            </>
          )}
          
          {targetType === 'increasing' && (
            <>
              <p><strong>Increasing Target:</strong> Q1 must equal or exceed baseline, quarterly values must increase (Q1≤Q2≤Q3≤Q4) and Q4 must equal the annual target.</p>
              <p className="ml-4">Example: If baseline=25 and annual target=100, you might set Q1=25, Q2=50, Q3=75, Q4=100.</p>
            </>
          )}
          
          {targetType === 'decreasing' && (
            <>
              <p><strong>Decreasing Target:</strong> Q1 must be less than or equal to baseline, quarterly values must decrease (Q1≥Q2≥Q3≥Q4) and Q4 must equal the annual target.</p>
              <p className="ml-4">Example: If baseline=100 and annual target=25, you might set Q1=100, Q2=75, Q3=50, Q4=25.</p>
            </>
          )}

          {targetType === 'constant' && (
            <>
              <p><strong>Constant Target:</strong> All quarterly values must equal the annual target (Q1=Q2=Q3=Q4=annual target).</p>
              <p className="ml-4">Example: If annual target=50, you must set Q1=50, Q2=50, Q3=50, Q4=50.</p>
            </>
          )}
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Please fix the following issues:</p>
              <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Submit Errors */}
      {submitError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error saving activity:</p>
            <p className="text-sm text-red-600 mt-1">{submitError}</p>
          </div>
        </div>
      )}

      {/* Form is valid indicator */}
      {isFormValid && !submitError && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <p className="text-sm text-green-700">Form is ready for submission</p>
        </div>
      )}

      {/* Activity Name */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Activity Name <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-1">Enter a descriptive name for this activity</p>
        <input
          type="text"
          {...register('name', { 
            required: 'Activity name is required',
            minLength: { value: 2, message: 'Name must be at least 2 characters' },
            maxLength: { value: 255, message: 'Name cannot exceed 255 characters' }
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
          <span className="text-blue-600">(Maximum: {maxWeight.toFixed(2)}%)</span>
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
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">%</span>
          </div>
        </div>
        {errors.weight && (
          <p className="mt-1 text-sm text-red-600">{errors.weight.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Activities must total {expectedActivitiesWeight}% (65% of initiative weight {initiativeWeight}%)
        </p>
      </div>

      {/* Baseline */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Baseline <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          {...register('baseline', { 
            required: 'Baseline is required',
            maxLength: { value: 255, message: 'Baseline cannot exceed 255 characters' }
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter current value or starting point"
        />
        {errors.baseline && (
          <p className="mt-1 text-sm text-red-600">{errors.baseline.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          The starting point against which progress will be measured
        </p>
      </div>

      {/* Period Selection */}
      <div className="space-y-4 border-t border-gray-200 pt-4">
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-gray-700">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              Period Selection <span className="text-red-500">*</span>
            </span>
            <span className="text-xs font-normal text-gray-500 block mt-1">
              Select when this activity will be implemented
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
          <p className="text-xs text-gray-500 mb-1">How targets are calculated across quarters</p>
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
            <p className="text-xs text-gray-500 mb-1">The target to reach by end of fiscal year</p>
            <input
              type="number"
              step="0.01"
              min="0.01"
              {...register('annual_target', {
                required: 'Annual target is required',
                min: { value: 0.01, message: 'Annual target must be greater than 0' },
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
            <p className="text-xs text-gray-500 mb-1">Target for July - September</p>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q1_target', {
                required: 'Q1 target is required',
                min: { value: 0, message: 'Q1 target cannot be negative' },
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
            <p className="text-xs text-gray-500 mb-1">Target for October - December</p>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q2_target', {
                required: 'Q2 target is required',
                min: { value: 0, message: 'Q2 target cannot be negative' },
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
            <p className="mt-1 text-xs text-blue-600">
              {targetType === 'cumulative' ? 'Sum of Q1 and Q2 targets' : 'Equal to Q2 target'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Q3 Target (Jan-Mar) <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-1">Target for January - March</p>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q3_target', {
                required: 'Q3 target is required',
                min: { value: 0, message: 'Q3 target cannot be negative' },
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
            <p className="mt-1 text-xs text-blue-600">
              {targetType === 'cumulative' ? 'Sum of Q1, Q2, and Q3 targets' : 'Equal to Q3 target'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Q4 Target (Apr-Jun) <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-1">Target for April - June</p>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q4_target', {
                required: 'Q4 target is required',
                min: { value: 0, message: 'Q4 target cannot be negative' },
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
              Calculated Annual Target
            </label>
            <div className={`mt-1 text-lg font-medium ${
              Math.abs(calculatedYearlyTarget - annualTarget) < 0.01 ? 'text-green-800' : 'text-red-800'
            }`}>
              {calculatedYearlyTarget}
            </div>
            {Math.abs(calculatedYearlyTarget - annualTarget) >= 0.01 && (
              <p className="text-xs text-red-600 mt-1">
                {targetType === 'cumulative' 
                  ? 'Sum of quarterly targets must equal annual target'
                  : targetType === 'constant'
                  ? 'All quarterly targets must equal annual target'
                  : 'Q4 target must equal annual target'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
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
          disabled={isSubmitting || !isFormValid || !userOrgId || !isFormReady}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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