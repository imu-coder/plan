import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, ArrowLeft, AlertCircle, Loader, Building2, Calendar, User, CheckCircle, XCircle, ClipboardCheck, FileType, RefreshCw } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { exportToExcel, exportToPDF } from '../lib/utils/export';
import PlanReviewForm from '../components/PlanReviewForm';
import PlanReviewTable from '../components/PlanReviewTable';
import { isAdmin, isEvaluator, isPlanner } from '../types/user';
import Cookies from 'js-cookie';
import axios from 'axios';

// Define interfaces for type safety
interface Organization {
  id: string | number;
  name: string;
}

interface UserOrganization {
  organization: string | number;
  role: string;
}

interface Plan {
  id: string;
  organization: string | number;
  organizationName?: string;
  planner_name: string;
  type: string;
  from_date: string | null;
  to_date: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  submitted_at?: string;
  objectives: Array<{
    id: string;
    title: string;
    effective_weight?: number;
    planner_weight?: number;
    weight: number;
    initiatives: Array<{
      id: string;
      name: string;
      weight: number;
      organization?: string | number;
      organization_name?: string;
      performance_measures: Array<{
        id: string;
        name: string;
        weight: number;
        baseline?: string;
        q1_target?: number;
        q2_target?: number;
        q3_target?: number;
        q4_target?: number;
        annual_target?: number;
        target_type?: 'cumulative' | 'non-cumulative';
        organization?: string | number;
        organization_name?: string;
      }>;
      main_activities: Array<{
        id: string;
        name: string;
        weight: number;
        selected_months?: string[];
        selected_quarters?: string[];
        budget?: {
          budget_calculation_type: 'WITH_TOOL' | 'WITHOUT_TOOL';
          estimated_cost_with_tool?: number;
          estimated_cost_without_tool?: number;
          government_treasury?: number;
          sdg_funding?: number;
          partners_funding?: number;
          other_funding?: number;
        };
        organization?: string | number;
        organization_name?: string;
      }>;
    }>;
  }>;
  reviews: Array<{
    feedback: string;
    reviewed_at: string;
    evaluator_name?: string;
  }>;
}

interface AuthData {
  isAuthenticated: boolean;
  userOrganizations: UserOrganization[];
  user: {
    first_name?: string;
    last_name?: string;
    username: string;
  };
}

const PlanSummary: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { planId } = useParams<{ planId: string }>();

  // State hooks
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<(string | number)[]>([]);
  const [authState, setAuthState] = useState<AuthData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [organizationName, setOrganizationName] = useState<string>('');
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [processedPlanData, setProcessedPlanData] = useState<Plan | null>(null);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [plannerOrganizationName, setPlannerOrganizationName] = useState<string>('');
  const [dataProcessingError, setDataProcessingError] = useState<string | null>(null);

  // Query hooks
  const { data: organizationsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      try {
        const response = await organizations.getAll();
        return response || { data: [] };
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
        return { data: [] };
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Production-safe data processing for plan data
  const processAndFilterPlanData = (planData: any): Plan => {
    try {
      console.log('PlanSummary: Processing plan data for user org:', userOrganizations[0]);
      
      if (!planData) return planData;

      const processed = normalizeAndProcessPlanData(planData);
      
      // Filter objectives and their content based on user organization
      if (processed.objectives && Array.isArray(processed.objectives)) {
        processed.objectives = processed.objectives.map(objective => {
          if (!objective) return objective;

          // Filter initiatives for user's organization
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives = objective.initiatives
              .filter(initiative => {
                if (!initiative) return false;
                
                const isDefault = initiative.is_default === true;
                const hasNoOrg = !initiative.organization || initiative.organization === null;
                const belongsToUserOrg = userOrganizations[0] && initiative.organization && 
                                        Number(initiative.organization) === Number(userOrganizations[0]);
                
                const shouldInclude = isDefault || hasNoOrg || belongsToUserOrg;
                
                console.log(`PlanSummary: Initiative "${initiative.name}" - org:${initiative.organization}, userOrg:${userOrganizations[0]}, include:${shouldInclude}`);
                
                return shouldInclude;
              })
              .map(initiative => {
                if (!initiative) return initiative;

                // Filter performance measures
                if (initiative.performance_measures && Array.isArray(initiative.performance_measures)) {
                  initiative.performance_measures = initiative.performance_measures.filter(measure => {
                    if (!measure) return false;
                    const hasNoOrg = !measure.organization || measure.organization === null;
                    const belongsToUserOrg = userOrganizations[0] && measure.organization && 
                                            Number(measure.organization) === Number(userOrganizations[0]);
                    return hasNoOrg || belongsToUserOrg;
                  });
                }

                // Filter main activities
                if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                  initiative.main_activities = initiative.main_activities.filter(activity => {
                    if (!activity) return false;
                    const hasNoOrg = !activity.organization || activity.organization === null;
                    const belongsToUserOrg = userOrganizations[0] && activity.organization && 
                                            Number(activity.organization) === Number(userOrganizations[0]);
                    return hasNoOrg || belongsToUserOrg;
                  });
                }

                return initiative;
              });
          }

          return objective;
        });
      }

      console.log('PlanSummary: Successfully processed and filtered plan data');
      return processed;
      
    } catch (error) {
      console.error('PlanSummary: Error processing plan data:', error);
      setDataProcessingError('Failed to process plan data for your organization');
      throw error;
    }
  };

  const { data: planData, isLoading, error, refetch } = useQuery({
    queryKey: ['plan', planId, retryCount],
    queryFn: async () => {
      if (!planId) throw new Error('Plan ID is missing');

      try {
        await auth.getCurrentUser();
        const timestamp = new Date().getTime();

        try {
          const headers = {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-CSRFToken': Cookies.get('csrftoken') || '',
            'Accept': 'application/json',
          };

          const response = await axios.get(`/api/plans/${planId}/?_=${timestamp}`, {
            headers,
            withCredentials: true,
            timeout: 10000,
          });

          if (!response.data) throw new Error('No data received');
          return processAndFilterPlanData(response.data);
        } catch (directError) {
          const planResult = await plans.getById(planId);
          if (!planResult) throw new Error('No data received');
          return processAndFilterPlanData(planResult);
        }
      } catch (error: any) {
        setLoadingError(error.message || 'Failed to load plan');
        throw error;
      }
    },
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    staleTime: 0,
    enabled: !!authState && !!planId,
  });

  const reviewPlanMutation = useMutation({
    mutationFn: async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
      if (!planId) throw new Error('Plan ID is missing');

      try {
        await auth.getCurrentUser();
        await axios.get('/api/auth/csrf/', { withCredentials: true });
      } catch (error) {
        throw new Error('Failed to validate authentication or fetch CSRF token');
      }

      const timestamp = new Date().getTime();
      if (data.status === 'APPROVED') {
        return api.post(`/plans/${planId}/approve/?_=${timestamp}`, { feedback: data.feedback });
      } else {
        return api.post(`/plans/${planId}/reject/?_=${timestamp}`, { feedback: data.feedback });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', 'pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['plan', planId] });
      setShowReviewForm(false);
      navigate('/evaluator');
    },
    onError: (error: any) => {
      setLoadingError(error.message || 'Failed to submit review');
    },
  });

  // Authentication effect
  useEffect(() => {
    const ensureAuth = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData?.isAuthenticated) {
          navigate('/login');
          return;
        }

        setAuthState(authData);
        if (authData.userOrganizations?.length > 0) {
          setUserRole(authData.userOrganizations[0].role);
          setUserOrganizations(authData.userOrganizations.map((org: UserOrganization) => org.organization));
        }

        try {
          const response = await axios.get('/api/auth/csrf/', { withCredentials: true });
          const token = response.headers['x-csrftoken'] || Cookies.get('csrftoken');
          if (token) Cookies.set('csrftoken', token, { path: '/' });
        } catch (error) {
          console.error('Failed to fetch CSRF token:', error);
        }
      } catch (error) {
        console.error('Authentication check failed:', error);
        navigate('/login');
      }
    };

    ensureAuth();
  }, [navigate]);

  useEffect(() => {
    // Create organizations mapping
    if (organizationsData?.data) {
      const orgMap: Record<string, string> = {};
      const orgsArray = Array.isArray(organizationsData.data) ? organizationsData.data : [];
      orgsArray.forEach((org: Organization) => {
        if (org?.id) {
          orgMap[String(org.id)] = org.name;
        }
      });
      setOrganizationsMap(orgMap);
      console.log('Organizations map created for plan summary:', orgMap);
    }

    if (planData) {
      setProcessedPlanData(planData);
      if (organizationsData?.data) {
        try {
          if (planData.organizationName) {
            setOrganizationName(planData.organizationName);
            return;
          }

          if (planData.organization) {
            const org = organizationsData.data.find((o: Organization) => String(o.id) === String(planData.organization));
            if (org) {
              setOrganizationName(org.name);
              setPlannerOrganizationName(org.name);
              return;
            }
          }

          setOrganizationName('Unknown Organization');
        } catch (e) {
          console.error('Error setting organization name:', e);
          setOrganizationName('Unknown Organization');
        }
      }
    }
  }, [planData, organizationsData]);

  // Helper functions
  const normalizeAndProcessPlanData = (plan: any): Plan => {
    if (!plan) return plan;

    const processedPlan: Plan = JSON.parse(JSON.stringify(plan));

    try {
      processedPlan.objectives = Array.isArray(processedPlan.objectives)
        ? processedPlan.objectives
        : processedPlan.objectives
        ? [processedPlan.objectives]
        : [];

      processedPlan.objectives = processedPlan.objectives.map((objective: any) => {
        if (!objective) return objective;

        objective.initiatives = Array.isArray(objective.initiatives)
          ? objective.initiatives
          : objective.initiatives
          ? [objective.initiatives]
          : [];

        objective.initiatives = objective.initiatives.map((initiative: any) => {
          if (!initiative) return initiative;

          initiative.performance_measures = Array.isArray(initiative.performance_measures)
            ? initiative.performance_measures
            : initiative.performance_measures
            ? [initiative.performance_measures]
            : [];

          initiative.main_activities = Array.isArray(initiative.main_activities)
            ? initiative.main_activities
            : initiative.main_activities
            ? [initiative.main_activities]
            : [];

          initiative.main_activities = initiative.main_activities.map((activity: any) => {
            if (!activity) return activity;

            activity.selected_months = Array.isArray(activity.selected_months)
              ? activity.selected_months
              : activity.selected_months
              ? [activity.selected_months]
              : [];

            activity.selected_quarters = Array.isArray(activity.selected_quarters)
              ? activity.selected_quarters
              : activity.selected_quarters
              ? [activity.selected_quarters]
              : [];

            return activity;
          });

          return initiative;
        });

        return objective;
      });

      processedPlan.reviews = Array.isArray(processedPlan.reviews)
        ? processedPlan.reviews
        : processedPlan.reviews
        ? [processedPlan.reviews]
        : [];
    } catch (e) {
      console.error('Error normalizing plan data:', e);
      throw new Error('Failed to normalize plan data');
    }

    return processedPlan;
  };

  const calculateTotalBudget = () => {
    let total = 0;
    let governmentTotal = 0;
    let sdgTotal = 0;
    let partnersTotal = 0;
    let otherTotal = 0;

    if (!processedPlanData?.objectives) {
      return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
    }

    try {
      processedPlanData.objectives.forEach((objective) => {
        objective.initiatives?.forEach((initiative) => {
          initiative.main_activities?.forEach((activity) => {
            // Calculate from sub-activities instead of legacy budget
            if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
              activity.sub_activities.forEach(subActivity => {
                const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);

                total += cost;
                governmentTotal += Number(subActivity.government_treasury || 0);
                sdgTotal += Number(subActivity.sdg_funding || 0);
                partnersTotal += Number(subActivity.partners_funding || 0);
                otherTotal += Number(subActivity.other_funding || 0);
              });
            }
          });
        });
      });
    } catch (e) {
      console.error('Error calculating total budget:', e);
    }

    return { total, governmentTotal, sdgTotal, partnersTotal, otherTotal };
  };

  const budgetTotals = calculateTotalBudget();

  const convertPlanDataToExportFormat = (objectives: Plan['objectives']) => {
    const exportData: any[] = [];

    if (!objectives || !Array.isArray(objectives)) {
      console.warn('No objectives to export');
      return exportData;
    }

    const userOrgId = userOrganizations[0] ?? null;
    console.log('Converting plan data for export - user org:', userOrgId);
    console.log('Objectives to convert:', objectives.length);

    objectives.forEach((objective, objIndex) => {
      if (!objective) return;

      // Get objective weight directly from database
      const objectiveWeight = objective.effective_weight ?? objective.planner_weight ?? objective.weight ?? 0;

      let objectiveAdded = false;

      if (!objective.initiatives || objective.initiatives.length === 0) {
        exportData.push({
          No: objIndex + 1,
          'Strategic Objective': objective.title || 'Untitled Objective',
          'Strategic Objective Weight': `${objectiveWeight.toFixed(1)}%`,
          'Strategic Initiative': '',
          'Initiative Weight': '',
          'Performance Measure/Main Activity': '',
          'Weight': '',
          'Baseline': '-',
          'Q1Target': '-',
          'Q2Target': '-',
          'SixMonthTarget': '-',
          'Q3Target': '-',
          'Q4Target': '-',
          'AnnualTarget': '-',
          'Implementor': 'Ministry of Health',
          'BudgetRequired': '-',
          'Government': '-',
          'Partners': '-',
          'SDG': '-',
          'Other': '-',
          'TotalAvailable': '-',
          'Gap': '-',
        });
      } else {
        const userInitiatives = objective.initiatives.filter(
          (initiative) => initiative.is_default || !initiative.organization || initiative.organization === userOrgId
        );

        console.log(`Objective ${objective.title}: ${objective.initiatives.length} total initiatives, ${userInitiatives.length} for user org`);

        userInitiatives.forEach((initiative) => {
          if (!initiative) return;

          const performanceMeasures = (initiative.performance_measures || []).filter(
            (measure) => !measure.organization || measure.organization === userOrgId
          );
          const mainActivities = (initiative.main_activities || []).filter(
            (activity) => {
              if (!activity) return false;
              const hasNoOrg = !activity.organization || activity.organization === null;
              const belongsToUserOrg = userOrgId && activity.organization && 
                                      Number(activity.organization) === Number(userOrgId);
              return hasNoOrg || belongsToUserOrg;
            }
          );

          console.log(`Initiative ${initiative.name}: ${performanceMeasures.length} measures, ${mainActivities.length} activities for user org`);

          const allItems = [...performanceMeasures, ...mainActivities];

          if (allItems.length === 0) {
            exportData.push({
              No: objectiveAdded ? '' : (objIndex + 1).toString(),
              'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
              'Strategic Objective Weight': objectiveAdded ? '' : `${objectiveWeight.toFixed(1)}%`,
              'Strategic Initiative': initiative.name || 'Untitled Initiative',
              'Initiative Weight': `${initiative.weight || 0}%`,
              'Performance Measure/Main Activity': 'No measures or activities',
              'Weight': '-',
              'Baseline': '-',
              'Q1Target': '-',
              'Q2Target': '-',
              'SixMonthTarget': '-',
              'Q3Target': '-',
              'Q4Target': '-',
              'AnnualTarget': '-',
              'Implementor':
                initiative.organization_name ||
                (initiative.organization && organizationsMap[String(initiative.organization)]) ||
                'Ministry of Health',
              'BudgetRequired': '-',
              'Government': '-',
              'Partners': '-',
              'SDG': '-',
              'Other': '-',
              'TotalAvailable': '-',
              'Gap': '-',
            });
            objectiveAdded = true;
          } else {
            let initiativeAddedForObjective = false;

            allItems.forEach((item) => {
              if (!item) return;

              const isPerformanceMeasure = performanceMeasures.includes(item);

              let budgetRequired = 0;
              let government = 0;
              let partners = 0;
              let sdg = 0;
              let other = 0;
              let totalAvailable = 0;
              let gap = 0;

              // Calculate budget from sub-activities for main activities
              if (!isPerformanceMeasure && item.sub_activities && Array.isArray(item.sub_activities)) {
                item.sub_activities.forEach(subActivity => {
                  const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                    ? Number(subActivity.estimated_cost_with_tool || 0)
                    : Number(subActivity.estimated_cost_without_tool || 0);

                  budgetRequired += cost;
                  government += Number(subActivity.government_treasury || 0);
                  partners += Number(subActivity.partners_funding || 0);
                  sdg += Number(subActivity.sdg_funding || 0);
                  other += Number(subActivity.other_funding || 0);
                });
                
                totalAvailable = government + partners + sdg + other;
                gap = Math.max(0, budgetRequired - totalAvailable);
              }

              const sixMonthTarget = item.target_type === 'cumulative'
                ? Number(item.q1_target || 0) + Number(item.q2_target || 0)
                : Number(item.q2_target || 0);

              exportData.push({
                No: objectiveAdded ? '' : (objIndex + 1).toString(),
                'Strategic Objective': objectiveAdded ? '' : (objective.title || 'Untitled Objective'),
                'Strategic Objective Weight': objectiveAdded ? '' : `${objectiveWeight.toFixed(1)}%`,
                'Strategic Initiative': initiativeAddedForObjective ? '' : (initiative.name || 'Untitled Initiative'),
                'Initiative Weight': initiativeAddedForObjective ? '' : `${initiative.weight || 0}%`,
                'Performance Measure/Main Activity': item.name || 'Untitled Item',
                'Weight': `${item.weight || 0}%`,
                'Baseline': item.baseline || '-',
                'Q1Target': item.q1_target ?? '-',
                'Q2Target': item.q2_target ?? '-',
                'SixMonthTarget': sixMonthTarget || '-',
                'Q3Target': item.q3_target ?? '-',
                'Q4Target': item.q4_target ?? '-',
                'AnnualTarget': item.annual_target ?? '-',
                'Implementor':
                  initiative.organization_name ||
                  (initiative.organization && organizationsMap[String(initiative.organization)]) ||
                  item.organization_name ||
                  (item.organization && organizationsMap[String(item.organization)]) ||
                  'Ministry of Health',
                'BudgetRequired': budgetRequired || '-',
                'Government': government || '-',
                'Partners': partners || '-',
                'SDG': sdg || '-',
                'Other': other || '-',
                'TotalAvailable': totalAvailable || '-',
                'Gap': gap || '-',
              });

              objectiveAdded = true;
              initiativeAddedForObjective = true;
            });
          }
        });
      }
    });

    console.log(`Converted ${objectives.length} objectives to ${exportData.length} export rows`);
    return exportData;
  };

  const formatDate = (dateString: string | undefined | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'PP');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getPeriodString = (activity: any) => {
    if (!activity) return 'N/A';

    try {
      if (activity.selected_quarters?.length > 0) {
        return activity.selected_quarters.join(', ');
      }
      if (activity.selected_months?.length > 0) {
        return activity.selected_months.join(', ');
      }
    } catch (e) {
      console.error('Error getting period string:', e);
    }

    return 'N/A';
  };

  const getPlanTypeDisplay = (type: string) => type || 'N/A';

  // Event handlers
  const handleRetry = async () => {
    setLoadingError(null);
    setRetryCount((prev) => prev + 1);
    try {
      await auth.getCurrentUser();
      await refetch();
    } catch (error) {
      setLoadingError('Failed to reload plan');
    }
  };

  const handleRefresh = async () => {
    setLoadingError(null);
    setRetryCount((prev) => prev + 1);
    try {
      await auth.getCurrentUser();
      await refetch();
    } catch (error) {
      console.error('Refresh failed:', error);
    }
  };

  const handleApprove = async () => {
    try {
      await auth.getCurrentUser();
      setShowReviewForm(true);
    } catch (error) {
      setLoadingError('Authentication error');
    }
  };

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    if (!planId) return;

    setIsSubmitting(true);
    try {
      await reviewPlanMutation.mutateAsync(data);
    } catch (error: any) {
      setLoadingError(error.message || 'Failed to submit review');
      setIsSubmitting(false);
      setShowReviewForm(false);
    }
  };

  const handleExportExcel = () => {
    if (!processedPlanData?.objectives) {
      console.error('No objectives data available for export');
      return;
    }

    console.log('Exporting plan data:', processedPlanData.objectives);

    try {
      const exportData = convertPlanDataToExportFormat(processedPlanData.objectives);
      exportToExcel(
        exportData,
        `plan-${new Date().toISOString().slice(0, 10)}`,
        'en',
        {
          organization: organizationName,
          planner: processedPlanData.planner_name || 'N/A',
          fromDate: processedPlanData.from_date || 'N/A',
          toDate: processedPlanData.to_date || 'N/A',
          planType: processedPlanData.type || 'N/A',
        }
      );
    } catch (error) {
      console.error('Error exporting to Excel:', error);
    }
  };

  const handleExportPDF = () => {
    if (!processedPlanData?.objectives) {
      console.error('No objectives data available for export');
      return;
    }

    try {
      exportToPDF(
        processedPlanData.objectives,
        `plan-${new Date().toISOString().slice(0, 10)}`,
        'en',
        {
          organization: organizationName,
          planner: processedPlanData.planner_name || 'N/A',
          fromDate: processedPlanData.from_date || 'N/A',
          toDate: processedPlanData.to_date || 'N/A',
          planType: processedPlanData.type || 'N/A',
        }
      );
    } catch (error) {
      console.error('Error exporting to PDF:', error);
    }
  };

  // Render conditions
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading plan details...</span>
      </div>
    );
  }

  if (dataProcessingError) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800">Data Processing Error</h3>
        <p className="text-red-600 mt-2">{dataProcessingError}</p>
        <div className="mt-6 flex justify-center space-x-4">
          <button
            onClick={() => {
              setDataProcessingError(null);
              handleRetry();
            }}
            className="px-4 py-2 bg-white border border-red-300 rounded-md text-red-700 hover:bg-red-50"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (error || loadingError) {
    const errorMessage = loadingError || (error instanceof Error ? error.message : 'An unknown error occurred');

    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800">Failed to load plan</h3>
        <p className="text-red-600 mt-2">{errorMessage}</p>
        <div className="mt-6 flex justify-center space-x-4">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-white border border-red-300 rounded-md text-red-700 hover:bg-red-50"
          >
            Try Again
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!processedPlanData) {
    return (
      <div className="p-8 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-yellow-800">Plan Not Found</h3>
        <p className="text-yellow-600 mt-2">The requested plan could not be found.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-6 px-4 py-2 bg-white border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-5 w-5 mr-1" />
          Back
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Plan Details</h1>
            <div className="flex items-center mt-2 space-x-4">
              <div className="flex items-center">
                <Building2 className="h-4 w-4 text-gray-500 mr-1" />
                <span className="text-sm text-gray-600">Organization: </span>
                <span className="text-sm font-medium text-gray-900">{plannerOrganizationName}</span>
              </div>
              <div className="flex items-center">
                <User className="h-4 w-4 text-gray-500 mr-1" />
                <span className="text-sm text-gray-600">Planner: </span>
                <span className="text-sm font-medium text-gray-900">{processedPlanData.planner_name || 'N/A'}</span>
              </div>
            </div>
            <div className="flex items-center mt-1">
              <div
                className={`px-2 py-1 text-xs rounded ${
                  processedPlanData.status === 'DRAFT'
                    ? 'bg-gray-100 text-gray-800'
                    : processedPlanData.status === 'SUBMITTED'
                    ? 'bg-yellow-100 text-yellow-800'
                    : processedPlanData.status === 'APPROVED'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {processedPlanData.status}
              </div>
              {processedPlanData.submitted_at && (
                <span className="text-sm text-gray-500 ml-2">
                  Submitted on {formatDate(processedPlanData.submitted_at)}
                </span>
              )}
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleExportExcel}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </button>

            {processedPlanData.status === 'SUBMITTED' && (
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 flex items-center"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Check Again
              </button>
            )}

            {processedPlanData.status === 'SUBMITTED' && isEvaluator(authState?.userOrganizations) && (
              <button
                onClick={handleApprove}
                className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Review Plan
              </button>
            )}
          </div>
        </div>

        {/* Evaluator Feedback Section - Moved to top */}
        {processedPlanData.reviews?.length > 0 && (
          <div className="mb-8 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-medium text-gray-900 flex items-center">
                <ClipboardCheck className="h-5 w-5 mr-2 text-blue-600" />
                Evaluator Feedback
              </h2>
            </div>
            <div className="p-6">
              <div
                className={`p-4 rounded-lg ${
                  processedPlanData.status === 'APPROVED'
                    ? 'bg-green-50 border border-green-200'
                    : processedPlanData.status === 'REJECTED'
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-gray-50 border border-gray-200'
                }`}
              >
                <div className="flex items-start">
                  {processedPlanData.status === 'APPROVED' ? (
                    <CheckCircle className="h-5 w-5 mr-2 text-green-500 mt-0.5" />
                  ) : processedPlanData.status === 'REJECTED' ? (
                    <XCircle className="h-5 w-5 mr-2 text-red-500 mt-0.5" />
                  ) : (
                    <div className="h-5 w-5 mr-2" />
                  )}
                  <div className="flex-1">
                    <p
                      className={`font-medium text-lg ${
                        processedPlanData.status === 'APPROVED'
                          ? 'text-green-700'
                          : processedPlanData.status === 'REJECTED'
                          ? 'text-red-700'
                          : 'text-gray-700'
                      }`}
                    >
                      {processedPlanData.status === 'APPROVED'
                        ? 'Plan Approved'
                        : processedPlanData.status === 'REJECTED'
                        ? 'Plan Rejected'
                        : 'Pending Review'}
                    </p>
                    {processedPlanData.reviews[0]?.feedback && (
                      <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                        <p className="text-sm font-medium text-gray-700 mb-1">Feedback:</p>
                        <p className="text-gray-900">{processedPlanData.reviews[0].feedback}</p>
                      </div>
                    )}
                    {processedPlanData.reviews[0]?.reviewed_at && (
                      <p className="mt-3 text-sm text-gray-500 flex items-center">
                        <Calendar className="h-4 w-4 mr-1" />
                        Reviewed on {formatDate(processedPlanData.reviews[0].reviewed_at)} by{' '}
                        {processedPlanData.reviews[0].evaluator_name || 'Evaluator'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {processedPlanData.objectives?.length > 0 && (
          <div className="mb-8">
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-medium text-gray-900">Complete Plan Details</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Detailed view showing all objectives, initiatives, measures, and activities
                </p>
              </div>
              <div className="p-6">
                <PlanReviewTable
                  objectives={processedPlanData.objectives || []}
                  onSubmit={async () => {}}
                  isSubmitting={false}
                  organizationName={plannerOrganizationName}
                  plannerName={processedPlanData.planner_name || 'N/A'}
                  fromDate={processedPlanData.from_date || ''}
                  toDate={processedPlanData.to_date || ''}
                  planType={processedPlanData.type || 'N/A'}
                  isPreviewMode={true}
                  userOrgId={userOrganizations[0] ?? null}
                  isViewOnly={true}
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-8">
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Organization Information</h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-start">
                <Building2 className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Organization Name</p>
                  <p className="font-medium">{plannerOrganizationName}</p>
                </div>
              </div>
              <div className="flex items-start">
                <User className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Planner</p>
                  <p className="font-medium">{processedPlanData.planner_name || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start">
                <FileType className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Plan Type</p>
                  <p className="font-medium">{getPlanTypeDisplay(processedPlanData.type)}</p>
                </div>
              </div>
              <div className="flex items-start">
                <Calendar className="h-5 w-5 text-gray-400 mt-0.5 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Planning Period</p>
                  <p className="font-medium">
                    {formatDate(processedPlanData.from_date)} - {formatDate(processedPlanData.to_date)}
                  </p>
                </div>
              </div>
            </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Objectives</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {processedPlanData.objectives?.length || 0}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Initiatives</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {processedPlanData.objectives?.reduce((total: number, obj) => total + (obj?.initiatives?.length || 0), 0) || 0}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-500">Total Activities</h3>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {processedPlanData.objectives?.reduce(
                  (total: number, obj) => {
                    if (!obj?.initiatives) return total;
                    return total + obj.initiatives.reduce((sum: number, init) => {
                      if (!init?.main_activities) return sum;
                      // Only count activities for user's organization
                      const userActivities = init.main_activities.filter(activity => {
                        if (!activity) return false;
                        const hasNoOrg = !activity.organization || activity.organization === null;
                        const belongsToUserOrg = userOrganizations[0] && activity.organization && 
                                                Number(activity.organization) === Number(userOrganizations[0]);
                        return hasNoOrg || belongsToUserOrg;
                      });
                      return sum + userActivities.length;
                    }, 0);
                  },
                  0
                ) || 0}
              </p>
            </div>

            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="flex flex-col">
                <h3 className="text-sm font-medium text-gray-500">Total Budget</h3>
                <p className="mt-2 text-3xl font-semibold text-green-600">
                  ${budgetTotals.total.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showReviewForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Review Plan: {plannerOrganizationName}
            </h3>

            <PlanReviewForm
              plan={processedPlanData}
              onSubmit={handleReviewSubmit}
              onCancel={() => setShowReviewForm(false)}
              isSubmitting={isSubmitting || reviewPlanMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanSummary;