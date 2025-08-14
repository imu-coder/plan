import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Loader, Calendar, AlertCircle, Info, CheckCircle } from 'lucide-react';
import type { MainActivity, TargetType } from '../types/plan';
import { MONTHS, QUARTERS, Month, Quarter, TARGET_TYPES } from '../types/plan';
import { mainActivities, auth, api } from '../lib/api';
import axios from 'axios';
import Cookies from 'js-cookie';

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

  // Enhanced error state
  const setError = (message: string) => {
    setSubmitError(message);
    console.error('MainActivityForm Error:', message);
  };

  // Get user organization ID
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          setUserOrgId(authData.userOrganizations[0].organization);
          setIsFormReady(true);
          console.log('MainActivityForm: User organization ID set to:', authData.userOrganizations[0].organization);
        } else {
          setError('User organization not found. Please refresh the page.');
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load user data. Please refresh the page.');
      }
    };
    
    fetchUserData();
  }, []);

  // Fetch initiative data to get its weight
  useEffect(() => {
    const fetchInitiativeData = async () => {
      try {
        const response = await fetch(`/api/strategic-initiatives/${initiativeId}/`);
        if (!response.ok) throw new Error('Failed to fetch initiative');
        const data = await response.json();
        if (data && data.weight) {
          const weight = parseFloat(data.weight);
          if (!isNaN(weight) && weight > 0) {
            setInitiativeWeight(weight);
          }
        }
      } catch (error) {
        console.error('Error fetching initiative:', error);
      }
    };
    
    if (initiativeId) {
      fetchInitiativeData();
    }
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

  // Calculate expected activities weight and max allowed weight
  const safeInitiativeWeight = initiativeWeight || 35;
  const expectedActivitiesWeight = parseFloat((safeInitiativeWeight * 0.65).toFixed(2));

  // Convert and validate all weight values
  const safeCurrentTotal = typeof currentTotal === 'number' && !isNaN(currentTotal) ? currentTotal : 0;
  const safeInitialWeight = initialData && typeof initialData.weight === 'number' && !isNaN(initialData.weight) 
    ? initialData.weight : 0;
  
  // Calculate max weight (prevent negative values)
  const adjustedCurrentTotal = initialData ? safeCurrentTotal - safeInitialWeight : safeCurrentTotal;
  const maxWeight = Math.max(0, expectedActivitiesWeight - adjustedCurrentTotal);
  const remainingWeight = parseFloat((expectedActivitiesWeight - adjustedCurrentTotal).toFixed(2));

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

  // Calculate targets for display
  const sixMonthTarget = targetType === 'cumulative' ? q1Target + q2Target : q2Target;
  const nineMonthTarget = targetType === 'cumulative' ? q1Target + q2Target + q3Target : q3Target;
  const calculatedYearlyTarget = targetType === 'cumulative' 
    ? q1Target + q2Target + q3Target + q4Target 
    : targetType === 'constant' 
      ? (q1Target === q2Target && q2Target === q3Target && q3Target === q4Target && q1Target === annualTarget ? annualTarget : 0)
      : q4Target;

  // Validate targets function
  const validateTargets = () => {
    const baselineValue = baseline ? Number(baseline) : null;

    if (targetType === 'cumulative') {
      const quarterly_sum = q1Target + q2Target + q3Target + q4Target;
      if (quarterly_sum !== annualTarget) {
        return `For cumulative targets, sum of quarterly targets (${quarterly_sum}) must equal annual target (${annualTarget})`;
      }
    } else if (targetType === 'increasing') {
      // Q1 must equal baseline
      if (baselineValue !== null && !(q1Target >= baselineValue)) {
        return(`For increasing targets, Q1 target (${q1Target}) must equal or greaterthan baseline (${baselineValue})`);
        
      }
      if (!(q1Target <= q2Target && q2Target <= q3Target && q3Target <= q4Target)) {
        return 'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)';
      }
      if (q4Target !== annualTarget) {
        return `For increasing targets, Q4 target (${q4Target}) must equal annual target (${annualTarget})`;
      }
    } else if (targetType === 'decreasing') {
      // Q1 must equal baseline
      if (baselineValue !== null && !(q1Target <= baselineValue)) {
        return(`For decreasing targets, Q1 target (${q1Target}) must equal or lessthan baseline (${baselineValue})`);
      }
      if (!(q1Target >= q2Target && q2Target >= q3Target && q3Target >= q4Target)) {
        return 'For decreasing targets, quarterly targets must be in descending order (Q1 ≥ Q2 ≥ Q3 ≥ Q4)';
      }
      if (q4Target !== annualTarget) {
        return `For decreasing targets, Q4 target (${q4Target}) must equal annual target (${annualTarget})`;
      }
    } else if (targetType === 'constant') {
      if (!(q1Target === q2Target && q2Target === q3Target && q3Target === q4Target && q1Target === annualTarget)) {
        return `For constant targets, all quarterly targets must equal annual target (Q1=Q2=Q3=Q4=${annualTarget})`;
      }
    }
    return null;
  };

  // Check if form is valid
  const getValidationErrors = () => {
    const errors: string[] = [];
    
    // Check required fields
    if (!currentName.trim()) {
      errors.push('Activity name is required');
    }
    
    if (!currentWeight || currentWeight <= 0) {
      errors.push('Weight must be greater than 0');
    }
    
    if (currentWeight > maxWeight) {
      errors.push(`Weight cannot exceed ${maxWeight.toFixed(2)}%. Available: ${remainingWeight.toFixed(2)}%`);
    }
    
    if (!hasPeriodSelected) {
      errors.push('Please select at least one period (month or quarter)');
    }
    
    // Target validation
    const targetError = validateTargets();
    if (targetError) {
      errors.push(targetError);
    }
    
    return errors;
  };
  
  const validationErrors = getValidationErrors();
  const isFormValid = () => {
    return validationErrors.length === 0 && calculatedYearlyTarget === annualTarget;
  };

  const handleFormSubmit = async (data: Partial<MainActivity>) => {
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      console.log('MainActivityForm: Starting form submission...');
      console.log('Form data received:', data);
      
      // Ensure we have user organization ID
      if (!userOrgId) {
        setSubmitError('User organization not found. Please refresh the page and try again.');
        setIsSubmitting(false);
        return;
      }
      
      console.log('User organization ID:', userOrgId);

      // Validate required fields
      if (!data.name?.trim()) {
        setSubmitError('Activity name is required');
        setIsSubmitting(false);
        return;
      }

      if (!data.weight || Number(data.weight) <= 0) {
        setSubmitError('Weight must be greater than 0');
        setIsSubmitting(false);
        return;
      }

      if (!data.baseline?.trim()) {
        setSubmitError('Baseline is required');
        setIsSubmitting(false);
        return;
      }

      if (!data.annual_target || Number(data.annual_target) <= 0) {
        setSubmitError('Annual target is required and must be greater than 0');
        setIsSubmitting(false);
        return;
      }
      
      // Ensure CSRF token is available
      try {
        await auth.getCurrentUser();
        const csrfToken = Cookies.get('csrftoken');
        if (!csrfToken) {
          console.warn('No CSRF token found, attempting to get one...');
          await axios.get('/api/auth/csrf/', { withCredentials: true });
        }
      } catch (csrfError) {
        console.error('CSRF token error:', csrfError);
        setError('Authentication error. Please refresh the page and try again.');
        setIsSubmitting(false);
        return;
      }

      // Validate period selection
      const hasMonths = data.selected_months && data.selected_months.length > 0;
      const hasQuarters = data.selected_quarters && data.selected_quarters.length > 0;
      
      if (!hasMonths && !hasQuarters) {
        setSubmitError('Please select at least one period (month or quarter)');
        setIsSubmitting(false);
        return;
      }

      // Check other validation errors before submission
      const validationErrors = getValidationErrors();
      if (validationErrors.length > 0) {
        setSubmitError(validationErrors[0]);
        setIsSubmitting(false);
        return;
      }
      
      // Validate targets match target type
      const targetError = validateTargets();
      if (targetError) {
        setSubmitError(targetError);
        setIsSubmitting(false);
        return;
      }

      // Prepare activity data with proper type conversion
      const activityData = {
        name: data.name?.trim(),
        baseline: data.baseline?.trim(),
        weight: parseFloat(String(data.weight || 0)),
        target_type: data.target_type || 'cumulative',
        q1_target: parseFloat(String(data.q1_target || 0)),
        q2_target: parseFloat(String(data.q2_target || 0)),
        q3_target: parseFloat(String(data.q3_target || 0)),
        q4_target: parseFloat(String(data.q4_target || 0)),
        annual_target: parseFloat(String(data.annual_target || 0)),
        initiative: initiativeId,
        organization: userOrgId,
        organization_id: userOrgId,
        // Period selection based on type
        selected_months: periodType === 'months' ? data.selected_months : [],
        selected_quarters: periodType === 'quarters' ? data.selected_quarters : [],
      };
      
      // Additional validation for production
      if (!activityData.name || activityData.name.length < 3) {
        setError('Activity name must be at least 3 characters long');
        setIsSubmitting(false);
        return;
      }
      
      if (activityData.weight <= 0 || activityData.weight > 100) {
        setError('Weight must be between 0.01 and 100');
        setIsSubmitting(false);
        return;
      }
      
      if (activityData.annual_target <= 0) {
        setError('Annual target must be greater than 0');
        setIsSubmitting(false);
        return;
      }

      console.log('MainActivityForm: Submitting activity data:', {
        operation: initialData ? 'UPDATE' : 'CREATE',
        activityId: initialData?.id,
        name: activityData.name,
        weight: activityData.weight,
        organization: activityData.organization,
        initiative: activityData.initiative,
        target_type: activityData.target_type,
        baseline: activityData.baseline,
        annual_target: activityData.annual_target
      });
      
      await onSubmit(activityData);
      
      console.log('MainActivityForm: Successfully submitted activity');
    } catch (error: any) {
      console.error('Error submitting form:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: error.config
      });
      
      // Enhanced error handling for production
      let errorMessage = 'Failed to save activity.';
      
      if (error.response) {
        const { status, data } = error.response;
        
        if (status === 500) {
          // Server error - provide helpful message
          if (typeof data === 'string' && data.includes('<!DOCTYPE html>')) {
            // HTML error page
            if (data.includes('ValidationError')) {
              errorMessage = 'Validation error on server. Please check your input values.';
            } else if (data.includes('IntegrityError')) {
              errorMessage = 'Data integrity error. This activity name might already exist.';
            } else {
              errorMessage = 'Server error occurred. Please try again or contact support.';
            }
          } else {
            errorMessage = 'Server error occurred. Please try again.';
          }
        } else if (status === 400) {
          // Bad request - validation error
          if (typeof data === 'object' && data !== null) {
            if (data.detail) {
              errorMessage = data.detail;
            } else if (data.non_field_errors) {
              errorMessage = Array.isArray(data.non_field_errors) 
                ? data.non_field_errors[0] 
                : data.non_field_errors;
            } else if (data.name) {
              errorMessage = Array.isArray(data.name) ? data.name[0] : data.name;
            } else if (data.weight) {
              const weightError = Array.isArray(data.weight) ? data.weight[0] : data.weight;
              errorMessage = `Weight error: ${weightError}`;
            } else {
              // Get first error from any field
              const firstError = Object.values(data)[0];
              if (Array.isArray(firstError)) {
                errorMessage = firstError[0];
              } else if (typeof firstError === 'string') {
                errorMessage = firstError;
              }
            }
          } else if (typeof data === 'string') {
            errorMessage = data;
          }
        } else if (status === 403) {
          errorMessage = 'Permission denied. You may not have the required permissions.';
        } else if (status === 404) {
          errorMessage = 'Initiative not found. Please refresh the page and try again.';
        } else {
          errorMessage = `Server error (${status}). Please try again.`;
        }
      } else if (error.request) {
        // Network error
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Enhanced validation function
  const validateTargets = () => {
    try {
      const baselineValue = baseline ? parseFloat(baseline) : null;

      if (targetType === 'cumulative') {
        const quarterly_sum = q1Target + q2Target + q3Target + q4Target;
        if (Math.abs(quarterly_sum - annualTarget) > 0.01) {
          return `For cumulative targets, sum of quarterly targets (${quarterly_sum}) must equal annual target (${annualTarget})`;
        }
      } else if (targetType === 'increasing') {
        // Q1 must be greater than or equal to baseline
        if (baselineValue !== null && q1Target < baselineValue) {
          return `For increasing targets, Q1 target (${q1Target}) must be greater than or equal to baseline (${baselineValue})`;
        }
        if (!(q1Target <= q2Target && q2Target <= q3Target && q3Target <= q4Target)) {
          return 'For increasing targets, quarterly targets must be in ascending order (Q1 ≤ Q2 ≤ Q3 ≤ Q4)';
        }
        if (Math.abs(q4Target - annualTarget) > 0.01) {
          return `For increasing targets, Q4 target (${q4Target}) must equal annual target (${annualTarget})`;
        }
      } else if (targetType === 'decreasing') {
        // Q1 must be less than or equal to baseline
        if (baselineValue !== null && q1Target > baselineValue) {
          return `For decreasing targets, Q1 target (${q1Target}) must be less than or equal to baseline (${baselineValue})`;
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
    } catch (error) {
      console.error('Error in validateTargets:', error);
      return 'Error validating targets. Please check your input values.';
    }
  };

  // Enhanced form validation
  const getValidationErrors = () => {
    const errors: string[] = [];
    
    try {
      // Check required fields
      if (!currentName || !currentName.trim()) {
        errors.push('Activity name is required');
      } else if (currentName.trim().length < 3) {
        errors.push('Activity name must be at least 3 characters');
      }
      
      if (!currentWeight || currentWeight <= 0) {
        errors.push('Weight must be greater than 0');
      } else if (currentWeight > 100) {
        errors.push('Weight cannot exceed 100%');
      } else if (currentWeight > maxWeight) {
        errors.push(`Weight cannot exceed ${maxWeight.toFixed(2)}%. Available: ${remainingWeight.toFixed(2)}%`);
      }
      
      if (!baseline || !baseline.trim()) {
        errors.push('Baseline is required');
      }
      
      if (!annualTarget || annualTarget <= 0) {
        errors.push('Annual target must be greater than 0');
      }
      
      if (!hasPeriodSelected) {
        errors.push('Please select at least one period (month or quarter)');
      }
      
      // Target validation
      const targetError = validateTargets();
      if (targetError) {
        errors.push(targetError);
      }
      
      return errors;
    } catch (error) {
      console.error('Error in getValidationErrors:', error);
      return ['Error validating form. Please check your input values.'];
    }
  };

  // Check if form is valid
  const isFormValid = () => {
    try {
      const errors = getValidationErrors();
      return errors.length === 0 && 
             Math.abs(calculatedYearlyTarget - annualTarget) < 0.01 &&
             userOrgId !== null &&
             isFormReady;
    } catch (error) {
      console.error('Error in isFormValid:', error);
      return false;
    }
  };

  const togglePeriodType = () => {
    try {
      if (periodType === 'months') {
        setValue('selected_months', []);
        setPeriodType('quarters');
      } else {
        setValue('selected_quarters', []);
        setPeriodType('months');
      }
      setSubmitError(null);
    } catch (error) {
      console.error('Error toggling period type:', error);
    }
  };

  // Show loading state until form is ready
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
      {/* Instructions based on target type */}
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
              <p><strong>Increasing Target:</strong> Q1 must equal or greater than baseline, quarterly values must increase (Q1≤Q2≤Q3≤Q4) and Q4 must equal the annual target.</p>
              <p className="ml-4">Example: If baseline=25 and annual target=100, you might set Q1=25, Q2=50, Q3=75, Q4=100.</p>
            </>
          )}
            
          {targetType === 'decreasing' && (
            <>
              <p><strong>Decreasing Target:</strong> Q1 must equal or less than baseline, quarterly values must decrease (Q1≥Q2≥Q3≥Q4) and Q4 must equal the annual target.</p>
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
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600">{submitError}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('planning.activityName')}
        </label>
        <p className="text-xs text-gray-500 mb-1">Enter a descriptive name for this activity</p>
        <input
          type="text"
          {...register('name', { 
            required: 'Activity name is required',
            minLength: { value: 3, message: 'Name must be at least 3 characters' }
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter activity name"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('planning.weight')} <span className="text-blue-600">(Maximum: {maxWeight.toFixed(2)}%)</span>
        </label>
        <p className="text-xs text-gray-500 mb-1">The weight of this activity as a percentage of the initiative</p>
        <div className="mt-1 relative rounded-md shadow-sm">
          <input
            type="number"
            min="0"
            step="0.01"
            max={maxWeight}
            {...register('weight', {
              required: 'Weight is required',
              min: { value: 0.01, message: 'Weight must be greater than 0' },
              max: { value: maxWeight, message: `Weight cannot exceed ${maxWeight.toFixed(2)}` },
              valueAsNumber: true
            })}
            className={`block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
              errors.weight ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Enter weight value"
          />
        </div>
        {errors.weight && (
          <p className="mt-1 text-sm text-red-600 flex items-center">
            <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
            {errors.weight.message}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-600">
          <span className="flex items-center">
            <Info className="h-3.5 w-3.5 mr-1 text-blue-500 flex-shrink-0" />
            Activities must have a combined weight of exactly {expectedActivitiesWeight.toFixed(2)}% (65% of initiative weight {safeInitiativeWeight.toFixed(2)}%).
          </span> 
        </p>
        {remainingWeight > 0 ? (
          <p className="mt-1 text-xs text-blue-600 font-medium">
            Current total: {adjustedCurrentTotal.toFixed(2)}% | 
            Available: {remainingWeight.toFixed(2)}% |
            Your maximum: {maxWeight.toFixed(2)}%
          </p>
        ) : remainingWeight === 0 ? (
          <p className="mt-1 text-xs text-green-600 font-medium">
            ✓ Target reached: {adjustedCurrentTotal.toFixed(2)}% = {expectedActivitiesWeight.toFixed(2)}% (No more weight available)
          </p>
        ) : (
          <p className="mt-1 text-xs text-red-600 font-medium">
            ⚠ Over target: {adjustedCurrentTotal.toFixed(2)}% &gt; {expectedActivitiesWeight.toFixed(2)}% (Reduce existing activities)
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          {t('planning.baseline')} <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-1">Enter the current or starting point value (required)</p>
        <input
          type="text"
          {...register('baseline', { 
            required: 'Baseline is required',
            minLength: { value: 1, message: 'Baseline cannot be empty' }
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter current value or starting point"
        />
        {errors.baseline && (
          <p className="mt-1 text-sm text-red-600">{errors.baseline.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-600">
          Baseline represents the current or initial value before the activity begins
        </p>
      </div>

      <div className="space-y-4 border-t border-gray-200 pt-4">
        <div className="flex justify-between items-center">
          <label className="block text-sm font-medium text-gray-700">
            <span className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              {t('planning.period')}
            </span>
            <span className="text-xs font-normal text-gray-500 block mt-1">
              Select the time periods when this activity will be performed
            </span>
          </label>
          <button
            type="button"
            onClick={togglePeriodType}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
          >
            Switch to {periodType === 'months' ? 'Quarters' : 'Months'}
          </button>
        </div>

        {periodType === 'months' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MONTHS.map((month) => (
              <label
                key={month.value}
                className={`relative flex items-center p-3 rounded-lg border ${
                  selectedMonths.includes(month.value) 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-400'
                } cursor-pointer transition-colors`}
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
                <span className="ml-3 text-sm font-medium text-gray-900 flex flex-col">
                  {month.label}
                  <span className="text-xs text-gray-500">
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
                className={`relative flex items-center p-4 rounded-lg border ${
                  selectedQuarters.includes(quarter.value) 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-blue-400'
                } cursor-pointer transition-colors`}
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
                <span className="ml-3 flex flex-col">
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
            <span>Please select at least one {periodType === 'months' ? 'month' : 'quarter'} when this activity will be performed</span>
          </p>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Type
          </label>
          <p className="text-xs text-gray-500 mb-1">Select how targets should be calculated across quarters</p>
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

        <h3 className="text-lg font-medium text-gray-900 mb-4">{t('planning.targets')}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.annualTarget')}
            </label>
            <p className="text-xs text-gray-500 mb-1">The target to reach by the end of the fiscal year</p>
            <input
              type="number"
              step="0.01"
              {...register('annual_target', {
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.annual_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter annual target value"
            />
            {errors.annual_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                Annual target is required
              </p>
            )}
            <p className="mt-1 text-xs text-gray-600">
              The final target to be achieved by the end of the year
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.q1Target')}
            </label>
            <p className="text-xs text-gray-500 mb-1">Target for July - September</p>
            <input
              type="number"
              step="0.01"
              {...register('q1_target', {
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q1_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q1 target value"
            />
            {errors.q1_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q1_target.message || 'Q1 target is required'}
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.q2Target')}
            </label>
            <p className="text-xs text-gray-500 mb-1">Target for October - December</p>
            <input
              type="number"
              step="0.01"
              {...register('q2_target', {
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q2_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q2 target value"
            />
            {errors.q2_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q2_target.message || 'Q2 target is required'}
              </p>
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
              {targetType === 'cumulative' 
                ? 'Sum of Q1 and Q2 targets' 
                : 'Equal to Q2 target'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.q3Target')}
            </label>
            <input
              type="number"
              step="0.01"
              {...register('q3_target', {
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q3_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q3 target value"
            />
            {errors.q3_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q3_target.message || 'Q3 target is required'}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-600">
              Target for January - March
            </p>
          </div>
          
          <div className="bg-blue-50 p-3 rounded-md flex flex-col justify-center">
            <label className="block text-sm font-medium text-blue-700 mb-1">
              9 Month Target {targetType === 'cumulative' ? '(Q1+Q2+Q3)' : '(Q3)'}
            </label>
            <div className="mt-1 text-lg font-medium text-blue-800">
              {nineMonthTarget}
            </div>
            <p className="mt-1 text-xs text-blue-600">
              {targetType === 'cumulative' 
                ? 'Sum of Q1, Q2, and Q3 targets' 
                : 'Equal to Q3 target'}
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.q4Target')}
            </label>
            <input
              type="number"
              step="0.01"
              {...register('q4_target', {
                required: true,
                min: 0,
                valueAsNumber: true
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q4_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q4 target value"
            />
            {errors.q4_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q4_target.message || 'Q4 target is required'}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-600">
              Target for April - June
              {targetType !== 'cumulative' && ' - Must equal annual target'}
            </p>
          </div>
          
          <div className={`p-3 rounded-md ${
            calculatedYearlyTarget === annualTarget ? 'bg-green-50' : 'bg-red-50'
          }`}>
            <label className={`block text-sm font-medium mb-1 ${
              calculatedYearlyTarget === annualTarget ? 'text-green-700' : 'text-red-700'
            }`}>
              Calculated Annual Target
            </label>
            <div className={`mt-1 text-lg font-medium ${
              calculatedYearlyTarget === annualTarget ? 'text-green-800' : 'text-red-800'
            }`}>
              {calculatedYearlyTarget}
            </div>
            {calculatedYearlyTarget !== annualTarget && (
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

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isFormValid()}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <span className="flex items-center">
              <Loader className="h-4 w-4 mr-2 animate-spin" />
              {t('common.saving')}
            </span>
          ) : (
            initialData ? t('common.update') : t('common.create')
          )}
        </button>
      </div>
    </form>
  );
};

export default MainActivityForm;
