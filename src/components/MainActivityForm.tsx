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
  const [authData, setAuthData] = useState<any>(null);

  // Get user organization ID and ensure authentication
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        console.log('MainActivityForm: Fetching user authentication data...');
        const userData = await auth.getCurrentUser();
        
        if (!userData.isAuthenticated) {
          setSubmitError('Authentication required. Please log in again.');
          return;
        }
        
        setAuthData(userData);
        
        if (userData.userOrganizations && userData.userOrganizations.length > 0) {
          const orgId = userData.userOrganizations[0].organization;
          setUserOrgId(orgId);
          setIsFormReady(true);
          console.log('MainActivityForm: User organization ID set to:', orgId);
        } else {
          setSubmitError('No organization assigned to user. Please contact administrator.');
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setSubmitError('Failed to load user data. Please refresh the page.');
      }
    };
    
    fetchUserData();
  }, []);

  // Fetch initiative data to get its weight
  useEffect(() => {
    const fetchInitiativeData = async () => {
      if (!initiativeId) return;
      
      try {
        console.log('MainActivityForm: Fetching initiative data for ID:', initiativeId);
        
        // Try multiple approaches to get initiative data
        let initiativeData = null;
        
        try {
          // First try direct API call
          const response = await api.get(`/strategic-initiatives/${initiativeId}/`);
          initiativeData = response.data;
        } catch (apiError) {
          console.warn('Direct API call failed, trying fetch:', apiError);
          
          // Fallback to fetch
          const response = await fetch(`/api/strategic-initiatives/${initiativeId}/`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': Cookies.get('csrftoken') || '',
            }
          });
          
          if (response.ok) {
            initiativeData = await response.json();
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        }
        
        if (initiativeData && initiativeData.weight) {
          const weight = parseFloat(initiativeData.weight);
          if (!isNaN(weight) && weight > 0) {
            setInitiativeWeight(weight);
            console.log('MainActivityForm: Initiative weight set to:', weight);
          }
        }
      } catch (error) {
        console.error('Error fetching initiative data:', error);
        // Use default weight if fetch fails
        setInitiativeWeight(35);
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

  // Target validation function - SINGLE IMPLEMENTATION
  const validateTargets = () => {
    try {
      const baselineValue = baseline ? parseFloat(baseline) : null;

      if (targetType === 'cumulative') {
        const quarterly_sum = q1Target + q2Target + q3Target + q4Target;
        if (Math.abs(quarterly_sum - annualTarget) > 0.01) {
          return `For cumulative targets, sum of quarterly targets (${quarterly_sum}) must equal annual target (${annualTarget})`;
        }
      } else if (targetType === 'increasing') {
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
  
  // Enhanced form validation function
  const isFormValid = () => {
    try {
      return validationErrors.length === 0 && 
             Math.abs(calculatedYearlyTarget - annualTarget) < 0.01 &&
             userOrgId !== null &&
             isFormReady;
    } catch (error) {
      console.error('Error in isFormValid:', error);
      return false;
    }
  };

  const handleFormSubmit = async (data: Partial<MainActivity>) => {
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      console.log('MainActivityForm: Starting form submission...');
      console.log('Form data received:', data);
      
      // Ensure we have user organization ID
      if (!userOrgId) {
        throw new Error('User organization not found. Please refresh the page and try again.');
      }
      
      // Ensure authentication is valid
      if (!authData?.isAuthenticated) {
        throw new Error('Authentication required. Please log in again.');
      }
      
      // Validate required fields with detailed checks
      if (!data.name?.trim() || data.name.trim().length < 3) {
        throw new Error('Activity name is required and must be at least 3 characters long');
      }

      if (!data.weight || Number(data.weight) <= 0 || Number(data.weight) > 100) {
        throw new Error('Weight must be between 0.01 and 100');
      }

      if (!data.baseline?.trim()) {
        throw new Error('Baseline is required and cannot be empty');
      }

      if (!data.annual_target || Number(data.annual_target) <= 0) {
        throw new Error('Annual target is required and must be greater than 0');
      }
      
      // Validate period selection
      const hasMonths = data.selected_months && Array.isArray(data.selected_months) && data.selected_months.length > 0;
      const hasQuarters = data.selected_quarters && Array.isArray(data.selected_quarters) && data.selected_quarters.length > 0;
      
      if (!hasMonths && !hasQuarters) {
        throw new Error('Please select at least one period (month or quarter)');
      }

      // Validate targets
      const targetError = validateTargets();
      if (targetError) {
        throw new Error(targetError);
      }

      // Ensure CSRF token is available
      try {
        await auth.getCurrentUser();
        let csrfToken = Cookies.get('csrftoken');
        
        if (!csrfToken) {
          console.log('No CSRF token found, fetching new one...');
          await axios.get('/api/auth/csrf/', { 
            withCredentials: true,
            timeout: 10000
          });
          csrfToken = Cookies.get('csrftoken');
        }
        
        if (!csrfToken) {
          throw new Error('Failed to obtain CSRF token. Please refresh the page.');
        }
        
        console.log('CSRF token available:', csrfToken.substring(0, 8) + '...');
      } catch (csrfError) {
        console.error('CSRF token error:', csrfError);
        throw new Error('Authentication error. Please refresh the page and try again.');
      }

      // CRITICAL FIX: Prepare data exactly as Django model expects
      const cleanActivityData = {
        // Required fields - ensure they match Django model exactly
        name: String(data.name).trim(),
        initiative: String(initiativeId), // Must be string for Django ForeignKey
        weight: String(parseFloat(String(data.weight || 0)).toFixed(2)), // Convert to string with 2 decimals
        baseline: String(data.baseline).trim(),
        target_type: String(data.target_type || 'cumulative'),
        
        // Quarterly targets - ensure they're strings with proper decimal formatting
        q1_target: String(parseFloat(String(data.q1_target || 0)).toFixed(2)),
        q2_target: String(parseFloat(String(data.q2_target || 0)).toFixed(2)),
        q3_target: String(parseFloat(String(data.q3_target || 0)).toFixed(2)),
        q4_target: String(parseFloat(String(data.q4_target || 0)).toFixed(2)),
        annual_target: String(parseFloat(String(data.annual_target || 0)).toFixed(2)),
        
        // Organization - must be integer for Django
        organization: Number(userOrgId),
        
        // Period selection - ensure proper arrays
        selected_months: periodType === 'months' ? (data.selected_months || []) : [],
        selected_quarters: periodType === 'quarters' ? (data.selected_quarters || []) : [],
      };
      
      console.log('MainActivityForm: Prepared clean data for Django:', cleanActivityData);
      
      // Additional validation before submission
      if (!cleanActivityData.name || cleanActivityData.name.length < 3) {
        throw new Error('Activity name must be at least 3 characters long');
      }
      
      const weightNum = parseFloat(cleanActivityData.weight);
      if (isNaN(weightNum) || weightNum <= 0 || weightNum > 100) {
        throw new Error('Weight must be a valid number between 0.01 and 100');
      }
      
      const annualNum = parseFloat(cleanActivityData.annual_target);
      if (isNaN(annualNum) || annualNum <= 0) {
        throw new Error('Annual target must be a valid number greater than 0');
      }

      if (!cleanActivityData.initiative) {
        throw new Error('Initiative ID is required');
      }

      if (!cleanActivityData.organization || isNaN(cleanActivityData.organization)) {
        throw new Error('Valid organization ID is required');
      }

      // Validate that at least one period is selected
      const hasValidPeriods = (cleanActivityData.selected_months && cleanActivityData.selected_months.length > 0) ||
                             (cleanActivityData.selected_quarters && cleanActivityData.selected_quarters.length > 0);
      
      if (!hasValidPeriods) {
        throw new Error('At least one month or quarter must be selected');
      }

      console.log('MainActivityForm: Final validation passed, submitting to parent...');
      
      // Call parent onSubmit with clean data
      await onSubmit(cleanActivityData);
      
      console.log('MainActivityForm: Successfully submitted activity');
    } catch (error: any) {
      console.error('MainActivityForm submission error:', error);
      
      // Enhanced error handling for production
      let errorMessage = 'Failed to save activity.';
      
      if (error.response) {
        const { status, data } = error.response;
        console.error('Server response error:', { status, data });
        
        if (status === 500) {
          // Server error - provide helpful message
          if (typeof data === 'string') {
            if (data.includes('ValidationError')) {
              errorMessage = 'Server validation error. Please check your input values and try again.';
            } else if (data.includes('IntegrityError')) {
              errorMessage = 'Data integrity error. This activity name might already exist for this initiative.';
            } else if (data.includes('DoesNotExist')) {
              errorMessage = 'Initiative not found. Please refresh the page and try again.';
            } else {
              errorMessage = 'Server error occurred. Please try again or contact support.';
            }
          } else {
            errorMessage = 'Internal server error. Please try again.';
          }
        } else if (status === 400) {
          // Bad request - validation error
          if (typeof data === 'object' && data !== null) {
            if (data.detail) {
              errorMessage = String(data.detail);
            } else if (data.non_field_errors) {
              errorMessage = Array.isArray(data.non_field_errors) 
                ? data.non_field_errors[0] 
                : String(data.non_field_errors);
            } else if (data.name) {
              errorMessage = Array.isArray(data.name) ? data.name[0] : String(data.name);
            } else if (data.weight) {
              const weightError = Array.isArray(data.weight) ? data.weight[0] : data.weight;
              errorMessage = `Weight error: ${weightError}`;
            } else if (data.initiative) {
              errorMessage = Array.isArray(data.initiative) ? data.initiative[0] : String(data.initiative);
            } else {
              // Get first error from any field
              const firstError = Object.values(data)[0];
              if (Array.isArray(firstError)) {
                errorMessage = String(firstError[0]);
              } else if (typeof firstError === 'string') {
                errorMessage = firstError;
              } else {
                errorMessage = 'Validation error. Please check your input.';
              }
            }
          } else if (typeof data === 'string') {
            errorMessage = data;
          }
        } else if (status === 403) {
          errorMessage = 'Permission denied. You may not have the required permissions to create activities.';
        } else if (status === 404) {
          errorMessage = 'Initiative not found. Please refresh the page and try again.';
        } else if (status === 401) {
          errorMessage = 'Authentication required. Please log in again.';
        } else {
          errorMessage = `Server error (${status}). Please try again.`;
        }
      } else if (error.request) {
        // Network error
        console.error('Network error:', error.request);
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (error.message) {
        errorMessage = String(error.message);
      }
      
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
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
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Error saving activity:</p>
            <p className="text-sm text-red-600 mt-1">{submitError}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {t('planning.activityName')} <span className="text-red-500">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-1">Enter a descriptive name for this activity</p>
        <input
          type="text"
          {...register('name', { 
            required: 'Activity name is required',
            minLength: { value: 3, message: 'Name must be at least 3 characters' },
            validate: (value) => {
              if (!value?.trim()) return 'Activity name cannot be empty';
              if (value.trim().length < 3) return 'Activity name must be at least 3 characters';
              return true;
            }
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
          {t('planning.weight')} <span className="text-red-500">*</span> <span className="text-blue-600">(Maximum: {maxWeight.toFixed(2)}%)</span>
        </label>
        <p className="text-xs text-gray-500 mb-1">The weight of this activity as a percentage of the initiative</p>
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
              valueAsNumber: true,
              validate: (value) => {
                if (!value || isNaN(value)) return 'Weight must be a valid number';
                if (value <= 0) return 'Weight must be greater than 0';
                if (value > maxWeight) return `Weight cannot exceed ${maxWeight.toFixed(2)}%`;
                return true;
              }
            })}
            className={`block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
              errors.weight ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="Enter weight value"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-gray-500 sm:text-sm">%</span>
          </div>
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
            ⚠ Over target: {adjustedCurrentTotal.toFixed(2)}% > {expectedActivitiesWeight.toFixed(2)}% (Reduce existing activities)
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
            minLength: { value: 1, message: 'Baseline cannot be empty' },
            validate: (value) => {
              if (!value?.trim()) return 'Baseline cannot be empty';
              return true;
            }
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
              {t('planning.period')} <span className="text-red-500">*</span>
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
              {t('planning.annualTarget')} <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-1">The target to reach by the end of the fiscal year</p>
            <input
              type="number"
              step="0.01"
              min="0.01"
              {...register('annual_target', {
                required: 'Annual target is required',
                min: { value: 0.01, message: 'Annual target must be greater than 0' },
                valueAsNumber: true,
                validate: (value) => {
                  if (!value || isNaN(value)) return 'Annual target must be a valid number';
                  if (value <= 0) return 'Annual target must be greater than 0';
                  return true;
                }
              })}
              className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.annual_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter annual target value"
            />
            {errors.annual_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.annual_target.message}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-600">
              The final target to be achieved by the end of the year
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.q1Target')} <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-1">Target for July - September</p>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q1_target', {
                required: 'Q1 target is required',
                min: { value: 0, message: 'Q1 target cannot be negative' },
                valueAsNumber: true,
                validate: (value) => {
                  if (value === undefined || value === null || isNaN(value)) return 'Q1 target must be a valid number';
                  if (value < 0) return 'Q1 target cannot be negative';
                  return true;
                }
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q1_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q1 target value"
            />
            {errors.q1_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q1_target.message}
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('planning.q2Target')} <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-1">Target for October - December</p>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q2_target', {
                required: 'Q2 target is required',
                min: { value: 0, message: 'Q2 target cannot be negative' },
                valueAsNumber: true,
                validate: (value) => {
                  if (value === undefined || value === null || isNaN(value)) return 'Q2 target must be a valid number';
                  if (value < 0) return 'Q2 target cannot be negative';
                  return true;
                }
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q2_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q2 target value"
            />
            {errors.q2_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q2_target.message}
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
              {t('planning.q3Target')} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q3_target', {
                required: 'Q3 target is required',
                min: { value: 0, message: 'Q3 target cannot be negative' },
                valueAsNumber: true,
                validate: (value) => {
                  if (value === undefined || value === null || isNaN(value)) return 'Q3 target must be a valid number';
                  if (value < 0) return 'Q3 target cannot be negative';
                  return true;
                }
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q3_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q3 target value"
            />
            {errors.q3_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q3_target.message}
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
              {t('planning.q4Target')} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('q4_target', {
                required: 'Q4 target is required',
                min: { value: 0, message: 'Q4 target cannot be negative' },
                valueAsNumber: true,
                validate: (value) => {
                  if (value === undefined || value === null || isNaN(value)) return 'Q4 target must be a valid number';
                  if (value < 0) return 'Q4 target cannot be negative';
                  return true;
                }
              })}
              className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                errors.q4_target ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Q4 target value"
            />
            {errors.q4_target && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1 flex-shrink-0" />
                {errors.q4_target.message}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-600">
              Target for April - June
              {targetType !== 'cumulative' && ' - Must equal annual target'}
            </p>
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

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isFormValid() || !userOrgId || !isFormReady}
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