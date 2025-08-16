import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Target,
  Plus,
  Edit,
  Trash2,
  Save,
  Loader,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  Send,
  Calculator,
  DollarSign,
  Activity,
  BarChart3,
  FileSpreadsheet,
  Building2,
  User,
  Calendar,
  FileType,
  Info,
  RefreshCw,
  Clock,
  XCircle
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import {
  organizations,
  objectives,
  programs,
  initiatives,
  performanceMeasures,
  mainActivities,
  plans,
  auth,
  activityBudgets,
  api,
  subActivities
} from '../lib/api';
import type {
  Organization,
  StrategicObjective,
  Program,
  StrategicInitiative
} from '../types/organization';
import type {
  Plan,
  PlanType,
  MainActivity,
  PerformanceMeasure,
  ActivityBudget,
  BudgetCalculationType,
  ActivityType
} from '../types/plan';
import { isPlanner, isAdmin } from '../types/user';
import { format } from 'date-fns';

// Component imports
import PlanTypeSelector from '../components/PlanTypeSelector';
import HorizontalObjectiveSelector from '../components/HorizontalObjectiveSelector';
import StrategicObjectivesList from '../components/StrategicObjectivesList';
import InitiativeList from '../components/InitiativeList';
import InitiativeForm from '../components/InitiativeForm';
import PerformanceMeasureList from '../components/PerformanceMeasureList';
import PerformanceMeasureForm from '../components/PerformanceMeasureForm';
import MainActivityList from '../components/MainActivityList';
import MainActivityForm from '../components/MainActivityForm';
import ActivityBudgetForm from '../components/ActivityBudgetForm';
import ActivityBudgetDetails from '../components/ActivityBudgetDetails';
import PlanReviewTable from '../components/PlanReviewTable';
import PlanningHeader from '../components/PlanningHeader';

// Costing tool imports
import TrainingCostingTool from '../components/TrainingCostingTool';
import MeetingWorkshopCostingTool from '../components/MeetingWorkshopCostingTool';
import SupervisionCostingTool from '../components/SupervisionCostingTool';
import PrintingCostingTool from '../components/PrintingCostingTool';
import ProcurementCostingTool from '../components/ProcurementCostingTool';

type PlanningStep = 'plan-type' | 'objective-selection' | 'planning' | 'review' | 'submit';

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewPlans: () => void;
}

const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, onViewPlans }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Plan Submitted Successfully!</h3>
          <p className="text-sm text-gray-500 mb-6">
            Your plan has been submitted for review. You can track its status in your plans dashboard.
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={onViewPlans}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
            >
              View My Plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PlanStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewPlans: () => void;
  planStatus: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | null;
  message: string;
}

const PlanStatusModal: React.FC<PlanStatusModalProps> = ({
  isOpen,
  onClose,
  onViewPlans,
  planStatus,
  message
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (planStatus) {
      case 'SUBMITTED':
        return <Clock className="h-6 w-6 text-yellow-600" />;
      case 'APPROVED':
        return <CheckCircle className="h-6 w-6 text-green-600" />;
      case 'REJECTED':
        return <XCircle className="h-6 w-6 text-red-600" />;
      default:
        return <AlertCircle className="h-6 w-6 text-blue-600" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
            {getIcon()}
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Plan Status</h3>
          <p className="text-sm text-gray-500 mb-6">{message}</p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <button
              onClick={onViewPlans}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
            >
              View Plans
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Planning: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ALL HOOKS AT TOP LEVEL
  const [currentStep, setCurrentStep] = useState<PlanningStep>('plan-type');
  const [selectedPlanType, setSelectedPlanType] = useState<PlanType>('LEO/EO Plan');
  const [selectedObjectives, setSelectedObjectives] = useState<StrategicObjective[]>([]);
  const [selectedObjective, setSelectedObjective] = useState<StrategicObjective | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [selectedInitiative, setSelectedInitiative] = useState<StrategicInitiative | null>(null);

  // User and organization state
  const [userOrganization, setUserOrganization] = useState<Organization | null>(null);
  const [plannerName, setPlannerName] = useState<string>('');
  const [isUserPlanner, setIsUserPlanner] = useState(false);
  const [userOrgId, setUserOrgId] = useState<number | null>(null);

  // Planning period state
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Form and UI state
  const [showInitiativeForm, setShowInitiativeForm] = useState(false);
  const [showMeasureForm, setShowMeasureForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showBudgetDetails, setShowBudgetDetails] = useState(false);
  const [showCostingTool, setShowCostingTool] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPlansTable, setShowPlansTable] = useState(true);

  // Edit state
  const [editingInitiative, setEditingInitiative] = useState<StrategicInitiative | null>(null);
  const [editingMeasure, setEditingMeasure] = useState<PerformanceMeasure | null>(null);
  const [editingActivity, setEditingActivity] = useState<MainActivity | null>(null);
  const [editingBudget, setEditingBudget] = useState<ActivityBudget | null>(null);

  // Budget and costing state
  const [selectedActivity, setSelectedActivity] = useState<MainActivity | null>(null);
  const [budgetCalculationType, setBudgetCalculationType] = useState<BudgetCalculationType>('WITHOUT_TOOL');
  const [selectedActivityType, setSelectedActivityType] = useState<ActivityType | null>(null);
  const [costingToolData, setCostingToolData] = useState<any>(null);

  // Error and loading state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [planStatusInfo, setPlanStatusInfo] = useState<{
    status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | null;
    message: string;
  }>({ status: null, message: '' });

  // Plans table component
  const PlansTable: React.FC<{ onCreateNewPlan: () => void; userOrgId: number | null }> = ({ 
    onCreateNewPlan, 
    userOrgId 
  }) => {
    const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});

    useEffect(() => {
      const fetchOrganizations = async () => {
        try {
          const response = await organizations.getAll();
          const orgMap: Record<string, string> = {};
          const orgsData = response?.data || response || [];
          
          if (Array.isArray(orgsData)) {
            orgsData.forEach((org: any) => {
              if (org && org.id) {
                orgMap[org.id] = org.name;
              }
            });
          }
          setOrganizationsMap(orgMap);
        } catch (error) {
          console.error('Failed to fetch organizations:', error);
        }
      };
      fetchOrganizations();
    }, []);

    const { data: userPlans, isLoading } = useQuery({
      queryKey: ['user-plans', userOrgId],
      queryFn: async () => {
        if (!userOrgId) return { data: [] };
        try {
          const response = await api.get('/plans/', {
            params: { organization: userOrgId }
          });
          const plansData = response.data?.results || response.data || [];
          return { data: plansData };
        } catch (error) {
          console.error('Error fetching user plans:', error);
          return { data: [] };
        }
      },
      enabled: !!userOrgId
    });

    const formatDate = (dateString: string) => {
      if (!dateString) return 'N/A';
      try {
        return format(new Date(dateString), 'MMM d, yyyy');
      } catch (e) {
        return 'Invalid date';
      }
    };

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'APPROVED':
          return 'bg-green-100 text-green-800';
        case 'SUBMITTED':
          return 'bg-yellow-100 text-yellow-800';
        case 'REJECTED':
          return 'bg-red-100 text-red-800';
        default:
          return 'bg-gray-100 text-gray-800';
      }
    };

    const handleViewPlan = (plan: any) => {
      navigate(`/plans/${plan.id}`);
    };

    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Loader className="h-6 w-6 animate-spin mr-2" />
          <span>Loading your plans...</span>
        </div>
      );
    }

    const plans = userPlans?.data || [];

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Your Plans</h2>
            <button
              onClick={onCreateNewPlan}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create New Plan
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <FileSpreadsheet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Plans Created</h3>
              <p className="text-gray-500 mb-4">You haven't created any plans yet.</p>
              <button
                onClick={onCreateNewPlan}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Plan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plan Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Planning Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {plans.map((plan: any) => (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {plan.type}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {plan.from_date && plan.to_date ?
                          `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                          'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(plan.status)}`}>
                          {plan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(plan.submitted_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleViewPlan(plan)}
                          className="text-blue-600 hover:text-blue-900 flex items-center"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Initialize authentication and user data
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('Planning: Initializing authentication...');
        const authData = await auth.getCurrentUser();
        
        if (!authData.isAuthenticated) {
          console.log('Planning: User not authenticated, redirecting to login');
          navigate('/login');
          return;
        }

        console.log('Planning: User authenticated successfully');
        setIsUserPlanner(isPlanner(authData.userOrganizations));

        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgId = authData.userOrganizations[0].organization;
          setUserOrgId(orgId);
          console.log('Planning: User organization ID set to:', orgId);

          // Fetch organization details
          try {
            const orgsResponse = await organizations.getAll();
            const orgsData = orgsResponse?.data || orgsResponse || [];
            const userOrg = orgsData.find((org: any) => org.id === orgId);
            if (userOrg) {
              setUserOrganization(userOrg);
              console.log('Planning: Organization set to:', userOrg.name);
            }
          } catch (orgError) {
            console.error('Planning: Failed to fetch organization:', orgError);
          }
        }

        // Set planner name
        const fullName = `${authData.user?.first_name || ''} ${authData.user?.last_name || ''}`.trim();
        setPlannerName(fullName || authData.user?.username || 'Unknown Planner');

        // Set default dates
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const fiscalYearStart = new Date(currentYear, 6, 1);
        const fiscalYearEnd = new Date(currentYear + 1, 5, 30);

        setFromDate(fiscalYearStart.toISOString().split('T')[0]);
        setToDate(fiscalYearEnd.toISOString().split('T')[0]);

      } catch (error) {
        console.error('Planning: Failed to fetch user data:', error);
        setError('Failed to load user information');
      }
    };

    initializeAuth();
  }, [navigate]);

  // Check for existing plans
  useEffect(() => {
    const checkExistingPlans = async () => {
      if (!userOrgId) return;

      try {
        const response = await api.get('/plans/', {
          params: { organization: userOrgId }
        });

        const plans = response.data?.results || response.data || [];
        const submittedPlan = plans.find((p: any) => p.status === 'SUBMITTED');
        const approvedPlan = plans.find((p: any) => p.status === 'APPROVED');

        if (approvedPlan) {
          setPlanStatusInfo({
            status: 'APPROVED',
            message: 'Your plan has been approved. You cannot create a new plan until the next planning cycle.'
          });
          setShowStatusModal(true);
        } else if (submittedPlan) {
          setPlanStatusInfo({
            status: 'SUBMITTED',
            message: 'You have already submitted a plan. Please wait for the evaluator to review it before creating a new one.'
          });
          setShowStatusModal(true);
        }
      } catch (error) {
        console.error('Failed to check existing plans:', error);
      }
    };

    checkExistingPlans();
  }, [userOrgId]);

  // Event handlers
  const handlePlanTypeSelect = (type: PlanType) => {
    console.log('Planning: Plan type selected:', type);
    setSelectedPlanType(type);
    setCurrentStep('objective-selection');
  };

  const handleObjectivesSelected = (objectives: StrategicObjective[]) => {
    console.log('Planning: Objectives selected:', objectives.length);
    setSelectedObjectives(objectives);
    
    if (objectives.length === 1) {
      setSelectedObjective(objectives[0]);
    }
  };

  const handleProceedToPlanning = () => {
    console.log('Planning: Proceeding to planning with objectives:', selectedObjectives.length);
    setCurrentStep('planning');
  };

  const handleSelectObjective = (objective: StrategicObjective) => {
    console.log('Planning: Objective selected:', objective.title);
    setSelectedObjective(objective);
    setSelectedProgram(null);
    setSelectedInitiative(null);
  };

  const handleSelectProgram = (program: Program) => {
    console.log('Planning: Program selected:', program.name);
    setSelectedProgram(program);
    setSelectedObjective(null);
    setSelectedInitiative(null);
  };

  const handleSelectInitiative = (initiative: StrategicInitiative) => {
    console.log('Planning: Initiative selected:', initiative.name);
    setSelectedInitiative(initiative);
  };

  const handleEditInitiative = (initiative: StrategicInitiative | {}) => {
    console.log('Planning: Opening initiative form for:', initiative);
    setEditingInitiative(initiative as StrategicInitiative);
    setShowInitiativeForm(true);
  };

  const handleSaveInitiative = async (data: any) => {
    try {
      setError(null);
      console.log('Planning: Saving initiative with data:', data);

      let result;
      if (editingInitiative?.id) {
        console.log('Planning: Updating existing initiative:', editingInitiative.id);
        result = await initiatives.update(editingInitiative.id, data);
      } else {
        console.log('Planning: Creating new initiative');
        result = await initiatives.create(data);
      }

      console.log('Planning: Initiative save result:', result);
      setShowInitiativeForm(false);
      setEditingInitiative(null);
      setRefreshKey(prev => prev + 1);
      
      // Refresh cache
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
      queryClient.invalidateQueries({ queryKey: ['objectives'] });

    } catch (error: any) {
      console.error('Planning: Failed to save initiative:', error);
      setError(error.message || 'Failed to save initiative');
    }
  };

  const handleEditMeasure = (measure: PerformanceMeasure | {}) => {
    setEditingMeasure(measure as PerformanceMeasure);
    setShowMeasureForm(true);
  };

  const handleSaveMeasure = async (data: any) => {
    try {
      setError(null);
      if (editingMeasure?.id) {
        await performanceMeasures.update(editingMeasure.id, data);
      } else {
        await performanceMeasures.create(data);
      }
      setShowMeasureForm(false);
      setEditingMeasure(null);
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error('Failed to save performance measure:', error);
      setError(error.message || 'Failed to save performance measure');
    }
  };

  const handleEditActivity = (activity: MainActivity | {}) => {
    setEditingActivity(activity as MainActivity);
    setShowActivityForm(true);
  };

  const handleSaveActivity = async (data: any) => {
    try {
      setError(null);
      if (editingActivity?.id) {
        await mainActivities.update(editingActivity.id, data);
      } else {
        await mainActivities.create(data);
      }
      setShowActivityForm(false);
      setEditingActivity(null);
      setRefreshKey(prev => prev + 1);
    } catch (error: any) {
      console.error('Failed to save main activity:', error);
      setError(error.message || 'Failed to save main activity');
    }
  };

  const handleAddBudget = (activity: MainActivity, calculationType: BudgetCalculationType, activityType?: ActivityType) => {
    setSelectedActivity(activity);
    setBudgetCalculationType(calculationType);
    setSelectedActivityType(activityType || null);

    if (calculationType === 'WITH_TOOL' && activityType) {
      setShowCostingTool(true);
    } else {
      setShowBudgetForm(true);
    }
  };

  const handleCostingToolComplete = (costingData: any) => {
    console.log('Planning: Costing tool completed with data:', costingData);
    setCostingToolData(costingData);
    setShowCostingTool(false);
    setShowBudgetForm(true);
  };

  const handleSaveBudget = async (budgetData: any) => {
    try {
      setError(null);
      if (!selectedActivity?.id) {
        throw new Error('No activity selected for budget');
      }

      console.log('Planning: Saving sub-activity with budget:', budgetData);
      const result = await subActivities.create(budgetData);
      console.log('Planning: Sub-activity saved:', result);

      setShowBudgetForm(false);
      setSelectedActivity(null);
      setEditingBudget(null);
      setCostingToolData(null);
      setRefreshKey(prev => prev + 1);
      setSuccess('Sub-activity with budget saved successfully');
      setTimeout(() => setSuccess(null), 3000);

    } catch (error: any) {
      console.error('Planning: Failed to save budget:', error);
      setError(error.message || 'Failed to save budget');
    }
  };

  const handleReviewPlan = () => {
    console.log('Planning: Proceeding to review with objectives:', selectedObjectives.length);
    setCurrentStep('review');
  };

  const handleSubmitPlan = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      if (!userOrganization || selectedObjectives.length === 0) {
        throw new Error('Missing required plan data');
      }

      const selectedObjectiveIds = selectedObjectives.map(obj => obj.id);
      const selectedObjectivesWeights: Record<string, number> = {};
      
      selectedObjectives.forEach(obj => {
        const effectiveWeight = obj.effective_weight !== undefined
          ? obj.effective_weight
          : obj.planner_weight !== undefined && obj.planner_weight !== null
            ? obj.planner_weight
            : obj.weight;
        selectedObjectivesWeights[obj.id.toString()] = effectiveWeight;
      });

      const planData = {
        organization: userOrganization.id,
        planner_name: plannerName,
        type: selectedPlanType,
        strategic_objective: selectedObjectives[0].id,
        selected_objectives: selectedObjectiveIds,
        selected_objectives_weights: selectedObjectivesWeights,
        fiscal_year: new Date().getFullYear().toString(),
        from_date: fromDate,
        to_date: toDate,
        status: 'SUBMITTED'
      };

      console.log('Planning: Submitting plan:', planData);
      const createdPlan = await plans.create(planData);
      console.log('Planning: Plan created:', createdPlan);

      setShowSuccessModal(true);

    } catch (error: any) {
      console.error('Planning: Failed to submit plan:', error);
      setError(error.message || 'Failed to submit plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case 'objective-selection':
        setCurrentStep('plan-type');
        break;
      case 'planning':
        setCurrentStep('objective-selection');
        break;
      case 'review':
        setCurrentStep('planning');
        break;
      default:
        setShowPlansTable(true);
    }
  };

  const handleCancel = () => {
    setShowInitiativeForm(false);
    setShowMeasureForm(false);
    setShowActivityForm(false);
    setShowBudgetForm(false);
    setShowBudgetDetails(false);
    setShowCostingTool(false);
    setEditingInitiative(null);
    setEditingMeasure(null);
    setEditingActivity(null);
    setEditingBudget(null);
    setSelectedActivity(null);
    setCostingToolData(null);
    setError(null);
  };

  const handleCreateNewPlan = () => {
    setShowPlansTable(false);
    setCurrentStep('plan-type');
    setSelectedObjectives([]);
    setSelectedObjective(null);
    setSelectedProgram(null);
    setSelectedInitiative(null);
    setError(null);
    setSuccess(null);
  };

  const handleViewMyPlans = () => {
    setShowPlansTable(true);
    setCurrentStep('plan-type');
  };

  const renderCostingTool = () => {
    if (!selectedActivityType || !selectedActivity) return null;

    const commonProps = {
      onCalculate: handleCostingToolComplete,
      onCancel: handleCancel,
      initialData: costingToolData
    };

    switch (selectedActivityType) {
      case 'Training':
        return <TrainingCostingTool {...commonProps} />;
      case 'Meeting':
      case 'Workshop':
        return <MeetingWorkshopCostingTool {...commonProps} />;
      case 'Supervision':
        return <SupervisionCostingTool {...commonProps} />;
      case 'Printing':
        return <PrintingCostingTool {...commonProps} />;
      case 'Procurement':
        return <ProcurementCostingTool {...commonProps} />;
      default:
        return null;
    }
  };

  // Check permissions
  if (!isUserPlanner && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Access Restricted</h3>
          <p className="text-yellow-600">You need planner permissions to access this page.</p>
        </div>
      </div>
    );
  }

  // Show plans table first
  if (showPlansTable && currentStep === 'plan-type') {
    return (
      <div className="px-4 py-6 sm:px-0">
        <PlansTable
          onCreateNewPlan={handleCreateNewPlan}
          userOrgId={userOrgId}
        />
        <PlanStatusModal
          isOpen={showStatusModal}
          onClose={() => setShowStatusModal(false)}
          onViewPlans={() => setShowStatusModal(false)}
          planStatus={planStatusInfo.status}
          message={planStatusInfo.message}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Error and Success Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
          <CheckCircle className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      {/* Step Navigation */}
      <div className="mb-8">
        <nav aria-label="Progress">
          <ol className="flex items-center">
            {[
              { key: 'plan-type', label: 'Plan Type' },
              { key: 'objective-selection', label: 'Objectives' },
              { key: 'planning', label: 'Planning' },
              { key: 'review', label: 'Review' }
            ].map((step, index) => (
              <li key={step.key} className={`${index !== 3 ? 'pr-8 sm:pr-20' : ''} relative`}>
                <div className="flex items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    currentStep === step.key
                      ? 'border-green-600 bg-green-600 text-white'
                      : ['plan-type', 'objective-selection'].includes(step.key) &&
                        ['objective-selection', 'planning', 'review'].includes(currentStep)
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300 bg-white text-gray-500'
                  }`}>
                    <span className="text-sm font-medium">{index + 1}</span>
                  </div>
                  <span className={`ml-4 text-sm font-medium ${
                    currentStep === step.key ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {step.label}
                  </span>
                </div>
                {index !== 3 && (
                  <div className="absolute top-4 left-4 -ml-px mt-0.5 h-full w-0.5 bg-gray-300" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {/* Step Content */}
      <div className="space-y-8">
        {/* Step 1: Plan Type Selection */}
        {currentStep === 'plan-type' && (
          <PlanTypeSelector onSelectPlanType={handlePlanTypeSelect} />
        )}

        {/* Step 2: Objective Selection */}
        {currentStep === 'objective-selection' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                Back
              </button>
              <h2 className="text-xl font-semibold text-gray-900">
                Select Strategic Objectives
              </h2>
              <div></div>
            </div>

            <HorizontalObjectiveSelector
              onObjectivesSelected={handleObjectivesSelected}
              onProceed={handleProceedToPlanning}
              initialObjectives={selectedObjectives}
            />
          </div>
        )}

        {/* Step 3: Planning Interface */}
        {currentStep === 'planning' && (
          <div className="space-y-6">
            <PlanningHeader
              organizationName={userOrganization?.name || 'Unknown Organization'}
              fromDate={fromDate}
              toDate={toDate}
              plannerName={plannerName}
              planType={selectedPlanType}
              onFromDateChange={setFromDate}
              onToDateChange={setToDate}
              onPlanTypeChange={setSelectedPlanType}
            />

            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                Back to Objectives
              </button>

              <button
                onClick={handleReviewPlan}
                className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Review & Submit
              </button>
            </div>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1: Selected Objectives */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Target className="h-5 w-5 mr-2 text-blue-600" />
                  Selected Objectives ({selectedObjectives.length})
                </h3>
                <StrategicObjectivesList
                  onSelectObjective={handleSelectObjective}
                  selectedObjectiveId={selectedObjective?.id}
                  onSelectProgram={handleSelectProgram}
                  selectedObjectives={selectedObjectives}
                />
              </div>

              {/* Column 2: Initiatives */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-green-600" />
                  Strategic Initiatives
                </h3>
                {(selectedObjective || selectedProgram) ? (
                  <InitiativeList
                    parentId={(selectedObjective?.id || selectedProgram?.id)?.toString() || ''}
                    parentType={selectedObjective ? 'objective' : 'program'}
                    parentWeight={(() => {
                      if (selectedObjective) {
                        const objData = selectedObjectives.find(obj => obj.id === selectedObjective.id);
                        return objData?.effective_weight || objData?.planner_weight || selectedObjective.weight;
                      }
                      return selectedProgram?.strategic_objective?.weight || 100;
                    })()}
                    selectedObjectiveData={selectedObjective ? 
                      selectedObjectives.find(obj => obj.id === selectedObjective.id) : null
                    }
                    onEditInitiative={handleEditInitiative}
                    onSelectInitiative={handleSelectInitiative}
                    planKey={`planning-${refreshKey}`}
                    isUserPlanner={isUserPlanner}
                    userOrgId={userOrgId}
                    refreshKey={refreshKey}
                  />
                ) : (
                  <div className="text-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <BarChart3 className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Select an objective to view initiatives</p>
                  </div>
                )}
              </div>

              {/* Column 3: Performance Measures & Main Activities */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Activity className="h-5 w-5 mr-2 text-purple-600" />
                    Performance Measures
                  </h3>
                  {selectedInitiative ? (
                    <PerformanceMeasureList
                      initiativeId={selectedInitiative.id}
                      initiativeWeight={Number(selectedInitiative.weight)}
                      onEditMeasure={handleEditMeasure}
                      onSelectMeasure={() => {}}
                      planKey={`planning-${refreshKey}`}
                    />
                  ) : (
                    <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                      <Activity className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Select an initiative to view performance measures</p>
                    </div>
                  )}
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <DollarSign className="h-5 w-5 mr-2 text-orange-600" />
                    Main Activities
                  </h3>
                  {selectedInitiative ? (
                    <MainActivityList
                      initiativeId={selectedInitiative.id}
                      initiativeWeight={Number(selectedInitiative.weight)}
                      onEditActivity={handleEditActivity}
                      onSelectActivity={(activity) => {
                        setSelectedActivity(activity);
                        // You can add budget management here
                      }}
                      planKey={`planning-${refreshKey}`}
                      isUserPlanner={isUserPlanner}
                      userOrgId={userOrgId}
                      refreshKey={refreshKey}
                    />
                  ) : (
                    <div className="text-center p-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                      <DollarSign className="h-6 w-6 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">Select an initiative to view main activities</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 'review' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                Back to Planning
              </button>
              <h2 className="text-xl font-semibold text-gray-900">Review Your Plan</h2>
              <div></div>
            </div>

            <PlanReviewTable
              objectives={selectedObjectives}
              onSubmit={handleSubmitPlan}
              isSubmitting={isSubmitting}
              organizationName={userOrganization?.name || 'Unknown Organization'}
              plannerName={plannerName}
              fromDate={fromDate}
              toDate={toDate}
              planType={selectedPlanType}
              userOrgId={userOrgId}
              refreshKey={refreshKey}
            />
          </div>
        )}
      </div>

      {/* Initiative Form Modal */}
      {showInitiativeForm && (selectedObjective || selectedProgram) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingInitiative?.id ? 'Edit Initiative' : 'Create Initiative'}
            </h3>

            <InitiativeForm
              parentId={(selectedObjective?.id || selectedProgram?.id)?.toString() || ''}
              parentType={selectedObjective ? 'objective' : 'program'}
              parentWeight={(() => {
                if (selectedObjective) {
                  const objData = selectedObjectives.find(obj => obj.id === selectedObjective.id);
                  return objData?.effective_weight || objData?.planner_weight || selectedObjective.weight;
                }
                return selectedProgram?.strategic_objective?.weight || 100;
              })()}
              selectedObjectiveData={selectedObjective ? 
                selectedObjectives.find(obj => obj.id === selectedObjective.id) : null
              }
              currentTotal={0}
              onSubmit={handleSaveInitiative}
              onCancel={handleCancel}
              initialData={editingInitiative}
            />
          </div>
        </div>
      )}

      {/* Performance Measure Form Modal */}
      {showMeasureForm && selectedInitiative && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingMeasure?.id ? 'Edit Performance Measure' : 'Create Performance Measure'}
            </h3>

            <PerformanceMeasureForm
              initiativeId={selectedInitiative.id}
              currentTotal={0}
              onSubmit={handleSaveMeasure}
              onCancel={handleCancel}
              initialData={editingMeasure}
            />
          </div>
        </div>
      )}

      {/* Main Activity Form Modal */}
      {showActivityForm && selectedInitiative && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingActivity?.id ? 'Edit Main Activity' : 'Create Main Activity'}
            </h3>

            <MainActivityForm
              initiativeId={selectedInitiative.id}
              currentTotal={0}
              onSubmit={handleSaveActivity}
              onCancel={handleCancel}
              initialData={editingActivity}
              onSuccess={() => {
                setShowActivityForm(false);
                setEditingActivity(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Costing Tool Modal */}
      {showCostingTool && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {selectedActivityType} Cost Calculator
              </h3>
              {renderCostingTool()}
            </div>
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      {showBudgetForm && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingBudget ? 'Edit Budget' : 'Add Budget'} - {selectedActivity.name}
            </h3>

            <ActivityBudgetForm
              activity={selectedActivity}
              budgetCalculationType={budgetCalculationType}
              activityType={selectedActivityType}
              onSubmit={handleSaveBudget}
              onCancel={handleCancel}
              initialData={editingBudget || costingToolData}
              isSubmitting={isSubmitting}
              costingToolData={costingToolData}
            />
          </div>
        </div>
      )}

      {/* Budget Details Modal */}
      {showBudgetDetails && selectedActivity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <ActivityBudgetDetails
              activity={selectedActivity}
              onBack={handleCancel}
              onEdit={() => {
                setShowBudgetDetails(false);
                setEditingBudget(selectedActivity.budget || null);
                setShowBudgetForm(true);
              }}
              isReadOnly={!isUserPlanner}
            />
          </div>
        </div>
      )}

      {/* Success Modal */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          handleViewMyPlans();
        }}
        onViewPlans={handleViewMyPlans}
      />

      {/* Plan Status Modal */}
      <PlanStatusModal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        onViewPlans={() => {
          setShowStatusModal(false);
          if (planStatusInfo.status === 'REJECTED') {
            handleCreateNewPlan();
          } else {
            handleViewMyPlans();
          }
        }}
        planStatus={planStatusInfo.status}
        message={planStatusInfo.message}
      />
    </div>
  );
};

export default Planning;