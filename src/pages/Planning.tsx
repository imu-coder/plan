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
  api
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
import ObjectiveSelectionMode from '../components/ObjectiveSelectionMode';
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
import ActivityBudgetSummary from '../components/ActivityBudgetSummary';
import PlanReviewTable from '../components/PlanReviewTable';
import PlanSubmitForm from '../components/PlanSubmitForm';
import PlanPreviewModal from '../components/PlanPreviewModal';
import PlanningHeader from '../components/PlanningHeader';

// Costing tool imports
import TrainingCostingTool from '../components/TrainingCostingTool';
import MeetingWorkshopCostingTool from '../components/MeetingWorkshopCostingTool';
import SupervisionCostingTool from '../components/SupervisionCostingTool';
import PrintingCostingTool from '../components/PrintingCostingTool';
import ProcurementCostingTool from '../components/ProcurementCostingTool';

type PlanningStep = 
  | 'plan-type' 
  | 'objective-selection' 
  | 'planning' 
  | 'review' 
  | 'submit';

// Success Modal Component
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

// Plan Status Modal Component
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

  const getTitle = () => {
    switch (planStatus) {
      case 'SUBMITTED':
        return 'Plan Already Submitted';
      case 'APPROVED':
        return 'Plan Already Approved';
      case 'REJECTED':
        return 'Plan Was Rejected';
      default:
        return 'Plan Status';
    }
  };

  const getButtonText = () => {
    switch (planStatus) {
      case 'REJECTED':
        return 'Create New Plan';
      default:
        return 'View My Plans';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100 mb-4">
            {getIcon()}
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">{getTitle()}</h3>
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
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${
                planStatus === 'REJECTED' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {getButtonText()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Plans Table Component
interface PlansTableProps {
  onCreateNewPlan: () => void;
  userOrgId: number | null;
}

const PlansTable: React.FC<PlansTableProps> = ({ onCreateNewPlan, userOrgId }) => {
  const navigate = useNavigate();
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});

  // Fetch organizations for mapping
  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const response = await organizations.getAll();
        const orgMap: Record<string, string> = {};
        
        if (response && Array.isArray(response)) {
          response.forEach((org: any) => {
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

  // Fetch user's plans
  const { data: userPlans, isLoading, refetch } = useQuery({
    queryKey: ['user-plans', userOrgId],
    queryFn: async () => {
      if (!userOrgId) return { data: [] };
      
      try {
        const response = await api.get('/plans/', {
          params: { organization: userOrgId }
        });
        
        const plansData = response.data?.results || response.data || [];
        
        // Map organization names
        plansData.forEach((plan: any) => {
          if (plan.organization && organizationsMap[plan.organization]) {
            plan.organizationName = organizationsMap[plan.organization];
          }
        });
        
        return { data: plansData };
      } catch (error) {
        console.error('Error fetching user plans:', error);
        return { data: [] };
      }
    },
    enabled: !!userOrgId && Object.keys(organizationsMap).length > 0,
    retry: 2
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

const Planning: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Core state
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [planStatusInfo, setPlanStatusInfo] = useState<{
    status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | null;
    message: string;
  }>({ status: null, message: '' });
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

  // Check for existing plans on component mount
  useEffect(() => {
    const checkExistingPlans = async () => {
      if (!userOrgId) return;
      
      try {
        const response = await api.get('/plans/', {
          params: { organization: userOrgId }
        });
        
        const plans = response.data?.results || response.data || [];
        
        // Check for existing plans
        const submittedPlan = plans.find((p: any) => p.status === 'SUBMITTED');
        const approvedPlan = plans.find((p: any) => p.status === 'APPROVED');
        const rejectedPlan = plans.find((p: any) => p.status === 'REJECTED');
        
        if (approvedPlan) {
          setPlanStatusInfo({
            status: 'APPROVED',
            message: 'Your plan has been approved. You cannot create a new plan until the next planning cycle.'
          });
          setShowStatusModal(true);
          setShowPlansTable(true);
        } else if (submittedPlan) {
          setPlanStatusInfo({
            status: 'SUBMITTED',
            message: 'You have already submitted a plan. Please wait for the evaluator to review it before creating a new one.'
          });
          setShowStatusModal(true);
          setShowPlansTable(true);
        } else {
          // No blocking plans, show normal planning interface
          setShowPlansTable(true);
        }
      } catch (error) {
        console.error('Failed to check existing plans:', error);
        setShowPlansTable(true);
      }
    };
    
    checkExistingPlans();
  }, [userOrgId]);
  // Fetch current user and organization
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserPlanner(isPlanner(authData.userOrganizations));
        
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const userOrg = authData.userOrganizations[0];
          setUserOrgId(userOrg.organization);
          
          // Fetch organization details
          try {
            const orgData = await organizations.getById(userOrg.organization.toString());
            setUserOrganization(orgData);
          } catch (orgError) {
            console.error('Failed to fetch organization details:', orgError);
          }
        }
        
        // Set planner name
        const fullName = `${authData.user?.first_name || ''} ${authData.user?.last_name || ''}`.trim();
        setPlannerName(fullName || authData.user?.username || 'Unknown Planner');
        
        // Set default dates (current fiscal year)
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const fiscalYearStart = new Date(currentYear, 6, 1); // July 1st
        const fiscalYearEnd = new Date(currentYear + 1, 5, 30); // June 30th next year
        
        setFromDate(fiscalYearStart.toISOString().split('T')[0]);
        setToDate(fiscalYearEnd.toISOString().split('T')[0]);
        
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setError('Failed to load user information');
      }
    };
    
    fetchUserData();
  }, [navigate]);

  // Check permissions
  if (!isUserPlanner && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Access Restricted</h3>
          <p className="text-yellow-600">{t('planning.permissions.plannerRequired')}</p>
        </div>
      </div>
    );
  }

  // Show plans table first
  if (showPlansTable && currentStep === 'plan-type') {
    return (
      <div className="px-4 py-6 sm:px-0">
        <PlansTable 
          onCreateNewPlan={() => {
            setShowPlansTable(false);
            setCurrentStep('plan-type');
          }}
          userOrgId={userOrgId}
        />
        
        {/* Status Modal */}
        <PlanStatusModal
          isOpen={showStatusModal}
          onClose={() => setShowStatusModal(false)}
          onViewPlans={() => {
            setShowStatusModal(false);
            // Stay on plans table
          }}
          planStatus={planStatusInfo.status}
          message={planStatusInfo.message}
        />
      </div>
    );
  }
  // Step handlers
  const handlePlanTypeSelect = (type: PlanType) => {
    setSelectedPlanType(type);
    setCurrentStep('objective-selection');
  };


  const handleObjectivesSelected = (objectives: StrategicObjective[]) => {
    console.log('Objectives selected in Planning:', objectives);
    setSelectedObjectives(objectives);
    
    // If only one objective, auto-select it
    if (objectives.length === 1) {
      setSelectedObjective(objectives[0]);
    }
  };

  const handleProceedToPlanning = () => {
    console.log('Proceeding to planning with objectives:', selectedObjectives);
    setCurrentStep('planning');
  };

  const handleSelectObjective = (objective: StrategicObjective) => {
    console.log('Objective selected:', objective);
    setSelectedObjective(objective);
    setSelectedProgram(null);
    setSelectedInitiative(null);
  };

  const handleSelectProgram = (program: Program) => {
    console.log('Program selected:', program);
    setSelectedProgram(program);
    setSelectedObjective(null);
    setSelectedInitiative(null);
  };

  const handleSelectInitiative = (initiative: StrategicInitiative) => {
    console.log('Initiative selected:', initiative);
    setSelectedInitiative(initiative);
  };

  // Initiative CRUD handlers
  const handleEditInitiative = (initiative: StrategicInitiative | {}) => {
    // Pass the custom weight data when editing/creating initiatives
    const initiativeWithWeight = {
      ...initiative,
      parentWeight: selectedObjective ? (
        selectedObjectives.find(obj => obj.id === selectedObjective.id)?.effective_weight ||
        selectedObjectives.find(obj => obj.id === selectedObjective.id)?.planner_weight ||
        selectedObjective.weight
      ) : selectedProgram?.strategic_objective?.weight || 100,
      selectedObjectiveData: selectedObjective ? 
        selectedObjectives.find(obj => obj.id === selectedObjective.id) : null
    };
    
    setEditingInitiative(initiative as StrategicInitiative);
    setShowInitiativeForm(true);
  };

  const handleSaveInitiative = async (data: any) => {
    try {
      setError(null);
      
      if (editingInitiative?.id) {
        await initiatives.update(editingInitiative.id, data);
      } else {
        await initiatives.create(data);
      }
      
      // Refresh initiatives data
      queryClient.invalidateQueries({ queryKey: ['initiatives'] });
      setRefreshKey(prev => prev + 1);
      
      setShowInitiativeForm(false);
      setEditingInitiative(null);
      setSuccess('Initiative saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Failed to save initiative:', error);
      setError(error.message || 'Failed to save initiative');
    }
  };

  // Performance measure CRUD handlers
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
      
      // Refresh measures data
      queryClient.invalidateQueries({ queryKey: ['performance-measures'] });
      setRefreshKey(prev => prev + 1);
      
      setShowMeasureForm(false);
      setEditingMeasure(null);
      setSuccess('Performance measure saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Failed to save performance measure:', error);
      setError(error.message || 'Failed to save performance measure');
    }
  };

  // Main activity CRUD handlers
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
      
      // Refresh activities data
      queryClient.invalidateQueries({ queryKey: ['main-activities'] });
      setRefreshKey(prev => prev + 1);
      
      setShowActivityForm(false);
      setEditingActivity(null);
      setSuccess('Main activity saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Failed to save main activity:', error);
      setError(error.message || 'Failed to save main activity');
    }
  };

  // Budget handlers
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

  const handleEditBudget = (activity: MainActivity) => {
    setSelectedActivity(activity);
    setEditingBudget(activity.budget || null);
    
    if (activity.budget?.budget_calculation_type === 'WITH_TOOL') {
      setBudgetCalculationType('WITH_TOOL');
      setSelectedActivityType(activity.budget.activity_type || null);
    } else {
      setBudgetCalculationType('WITHOUT_TOOL');
      setSelectedActivityType(null);
    }
    
    setShowBudgetForm(true);
  };

  const handleViewBudget = (activity: MainActivity) => {
    setSelectedActivity(activity);
    setShowBudgetDetails(true);
  };

  const handleCostingToolComplete = (costingData: any) => {
    console.log('Costing tool completed with data:', costingData);
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
      
      console.log('Saving budget for activity:', selectedActivity.id);
      console.log('Budget data:', budgetData);
      
      // Use the custom budget update endpoint
      const response = await mainActivities.updateBudget(selectedActivity.id, budgetData);
      
      console.log('Budget saved successfully:', response.data);
      
      // Refresh activities data to get updated budget
      queryClient.invalidateQueries({ queryKey: ['main-activities'] });
      setRefreshKey(prev => prev + 1);
      
      setShowBudgetForm(false);
      setSelectedActivity(null);
      setEditingBudget(null);
      setCostingToolData(null);
      setSuccess('Budget saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Failed to save budget:', error);
      setError(error.message || 'Failed to save budget');
    }
  };

  // Plan submission handlers
  const handleReviewPlan = () => {
    setCurrentStep('review');
  };

  const handleSubmitPlan = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      
      if (!userOrganization || selectedObjectives.length === 0) {
        throw new Error('Missing required plan data');
      }
      
      // Check for existing plans before submitting
      try {
        const existingPlansResponse = await api.get('/plans/', {
          params: { organization: userOrgId }
        });
        
        const existingPlans = existingPlansResponse.data?.results || existingPlansResponse.data || [];
        const submittedPlan = existingPlans.find((p: any) => p.status === 'SUBMITTED');
        const approvedPlan = existingPlans.find((p: any) => p.status === 'APPROVED');
        
        if (approvedPlan) {
          setPlanStatusInfo({
            status: 'APPROVED',
            message: 'You already have an approved plan. You cannot create a new plan until the next planning cycle.'
          });
          setShowStatusModal(true);
          return;
        }
        
        if (submittedPlan) {
          setPlanStatusInfo({
            status: 'SUBMITTED',
            message: 'You have already submitted a plan. Please wait for the evaluator to review it before creating a new one.'
          });
          setShowStatusModal(true);
          return;
        }
      } catch (checkError) {
        console.warn('Failed to check existing plans:', checkError);
        // Continue with submission if check fails
      }
      
      const selectedObjectiveIds = selectedObjectives.map(obj => obj.id);
      
      // Prepare selected objectives weights
      const selectedObjectivesWeights: Record<string, number> = {};
      selectedObjectives.forEach(obj => {
        const effectiveWeight = obj.effective_weight !== undefined 
          ? obj.effective_weight
          : obj.planner_weight !== undefined && obj.planner_weight !== null
            ? obj.planner_weight
            : obj.weight;
        selectedObjectivesWeights[obj.id.toString()] = effectiveWeight;
      });
      
      // Create plan data
      const planData = {
        organization: userOrganization.id,
        planner_name: plannerName,
        type: selectedPlanType,
        strategic_objective: selectedObjectives[0].id, // Primary objective
        selected_objectives: selectedObjectiveIds, // Send only IDs - CORRECT
        selected_objectives_weights: selectedObjectivesWeights,
        fiscal_year: new Date().getFullYear().toString(),
        from_date: fromDate,
        to_date: toDate,
        status: 'SUBMITTED'
      };
      
      console.log('Submitting plan:', planData);
      console.log('Selected objective IDs:', selectedObjectiveIds);
      console.log('Selected objectives weights:', selectedObjectivesWeights);
      
      // Create the plan
      const createdPlan = await plans.create(planData);
      console.log('Plan created:', createdPlan);
      
      // Show success modal
      setShowSuccessModal(true);
      
    } catch (error: any) {
      console.error('Failed to submit plan:', error);
      
      // Check if it's a duplicate plan error
      if (error.response?.data?.detail?.includes('already been submitted') || 
          error.response?.data?.detail?.includes('duplicate')) {
        setPlanStatusInfo({
          status: 'SUBMITTED',
          message: 'You have already submitted a plan. Please wait for the evaluator to review it.'
        });
        setShowStatusModal(true);
      } else {
        console.error('Error response data:', error.response?.data);
        let errorMessage = 'Failed to submit plan';
        if (error.response?.data?.detail) {
          errorMessage = error.response.data.detail;
        } else if (error.response?.data?.selected_objectives) {
          errorMessage = 'Error with selected objectives: ' + JSON.stringify(error.response.data.selected_objectives);
        }
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateNewPlan = () => {
    // Reset all state for new plan
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
  // Navigation handlers
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
      case 'submit':
        setCurrentStep('review');
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

  // Render costing tools
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

  // Main render
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
            {/* Planning Header */}
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

            {/* Navigation and Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleBack}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                Back to Objectives
              </button>
              
              <div className="flex space-x-3">
                {/* <button
                  onClick={() => setShowPreviewModal(true)}
                  className="flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Plan
                </button> */}
                <button
                  onClick={handleReviewPlan}
                  className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Review & Submit
                </button>
              </div>
            </div>

            {/* 3-Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1: Selected Objectives */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Target className="h-5 w-5 mr-2 text-blue-600" />
                  Selected Objectives
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
                  (() => {
                    // Calculate the effective weight to pass to InitiativeList
                    let effectiveWeight = 100; // Default fallback
                    let selectedObjectiveData = null;
                    
                    if (selectedObjective) {
                      // Find the selected objective in the selectedObjectives array to get the custom weight
                      selectedObjectiveData = selectedObjectives.find(obj => obj.id === selectedObjective.id);
                      
                      console.log('Planning.tsx: Found selectedObjectiveData:', selectedObjectiveData);
                      
                      if (selectedObjectiveData) {
                        // Use the weight from selectedObjectives array (which has custom weights)
                        effectiveWeight = selectedObjectiveData.effective_weight !== undefined 
                          ? selectedObjectiveData.effective_weight
                          : selectedObjectiveData.planner_weight !== undefined && selectedObjectiveData.planner_weight !== null
                            ? selectedObjectiveData.planner_weight
                            : selectedObjectiveData.weight;
                        
                        console.log('Planning.tsx: Using custom weight from selectedObjectives:', effectiveWeight);
                      } else {
                        // Fallback to the selected objective's weight
                        effectiveWeight = selectedObjective.effective_weight !== undefined 
                          ? selectedObjective.effective_weight
                          : selectedObjective.planner_weight !== undefined && selectedObjective.planner_weight !== null
                            ? selectedObjective.planner_weight
                            : selectedObjective.weight;
                        
                        console.log('Planning.tsx: Using fallback weight from selectedObjective:', effectiveWeight);
                      }
                      
                      console.log('Planning.tsx - Weight calculation for InitiativeList:', {
                        objectiveId: selectedObjective.id,
                        objectiveTitle: selectedObjective.title,
                        selectedObjectiveData: selectedObjectiveData ? 'found' : 'not found',
                        originalWeight: selectedObjective.weight,
                        plannerWeight: selectedObjective.planner_weight,
                        effectiveWeightFromSelected: selectedObjectiveData?.effective_weight,
                        finalEffectiveWeight: effectiveWeight
                      });
                    } else if (selectedProgram) {
                      // For programs, also check if the parent objective is in selectedObjectives
                      const parentObjective = selectedObjectives.find(obj => 
                        obj.id === selectedProgram.strategic_objective_id || 
                        obj.id === selectedProgram.strategic_objective?.id
                      );
                      
                      if (parentObjective) {
                        effectiveWeight = parentObjective.effective_weight !== undefined 
                          ? parentObjective.effective_weight
                          : parentObjective.planner_weight !== undefined && parentObjective.planner_weight !== null
                            ? parentObjective.planner_weight
                            : parentObjective.weight;
                      } else {
                        effectiveWeight = selectedProgram.strategic_objective?.effective_weight ||
                                        selectedProgram.strategic_objective?.planner_weight ||
                                        selectedProgram.strategic_objective?.weight || 100;
                      }
                    }
                    
                    return (
                      <InitiativeList
                        parentId={(selectedObjective?.id || selectedProgram?.id)?.toString() || ''}
                        parentType={selectedObjective ? 'objective' : 'program'}
                        parentWeight={effectiveWeight}
                        selectedObjectiveData={selectedObjectiveData}
                        onEditInitiative={handleEditInitiative}
                        onSelectInitiative={handleSelectInitiative}
                        planKey={`planning-${refreshKey}`}
                        isUserPlanner={isUserPlanner}
                        userOrgId={userOrgId}
                      />
                    );
                  })()
                ) : (
                  <div className="text-center p-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <BarChart3 className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Select an objective to view initiatives</p>
                  </div>
                )}
              </div>

              {/* Column 3: Performance Measures & Main Activities */}
              <div className="space-y-6">
                {/* Performance Measures */}
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

                {/* Main Activities */}
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <DollarSign className="h-5 w-5 mr-2 text-orange-600" />
                    Main Activities
                  </h3>
                  {selectedInitiative ? (
                    <div className="space-y-4">
                      <MainActivityList
                        initiativeId={selectedInitiative.id}
                        initiativeWeight={Number(selectedInitiative.weight)}
                        onEditActivity={handleEditActivity}
                        onSelectActivity={() => {}}
                        onAddBudget={handleAddBudget}
                        onEditBudget={handleEditBudget}
                        onViewBudget={handleViewBudget}
                        planKey={`planning-${refreshKey}`}
                        isUserPlanner={isUserPlanner}
                        userOrgId={userOrgId}
                      />
                      
                      {/* Create Main Activity Button */}
                      {isUserPlanner && (
                        <div className="text-center pt-4">
                          <button 
                            onClick={() => handleEditActivity({})}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Create Main Activity
                          </button>
                        </div>
                      )}
                    </div>
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
            />
          </div>
        )}
      </div>

      {/* Modals and Forms */}
      
      {/* Initiative Form Modal */}
      {showInitiativeForm && (selectedObjective || selectedProgram) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingInitiative?.id ? 'Edit Initiative' : 'Create Initiative'}
            </h3>
            
            {(() => {
              // Calculate the effective weight for the form
              let formParentWeight = 100;
              let selectedObjectiveData = null;
              
              if (selectedObjective) {
                // Find the selected objective in the selectedObjectives array
                selectedObjectiveData = selectedObjectives.find(obj => obj.id === selectedObjective.id);
                
                if (selectedObjectiveData) {
                  formParentWeight = selectedObjectiveData.effective_weight !== undefined 
                    ? selectedObjectiveData.effective_weight
                    : selectedObjectiveData.planner_weight !== undefined && selectedObjectiveData.planner_weight !== null
                      ? selectedObjectiveData.planner_weight
                      : selectedObjectiveData.weight;
                } else {
                  formParentWeight = selectedObjective.effective_weight !== undefined 
                    ? selectedObjective.effective_weight
                    : selectedObjective.planner_weight !== undefined && selectedObjective.planner_weight !== null
                      ? selectedObjective.planner_weight
                      : selectedObjective.weight;
                }
              } else if (selectedProgram) {
                const parentObjective = selectedObjectives.find(obj => 
                  obj.id === selectedProgram.strategic_objective_id || 
                  obj.id === selectedProgram.strategic_objective?.id
                );
                
                if (parentObjective) {
                  formParentWeight = parentObjective.effective_weight !== undefined 
                    ? parentObjective.effective_weight
                    : parentObjective.planner_weight !== undefined && parentObjective.planner_weight !== null
                      ? parentObjective.planner_weight
                      : parentObjective.weight;
                } else {
                  formParentWeight = selectedProgram.strategic_objective?.weight || 100;
                }
              }
              
              console.log('InitiativeForm Modal - Weight calculation:', {
                selectedObjective: selectedObjective?.title,
                selectedProgram: selectedProgram?.name,
                selectedObjectiveData: selectedObjectiveData ? 'found' : 'not found',
                formParentWeight,
                originalWeight: selectedObjective?.weight || selectedProgram?.strategic_objective?.weight
              });
              
              return (
                <InitiativeForm
                  parentId={(selectedObjective?.id || selectedProgram?.id)?.toString() || ''}
                  parentType={selectedObjective ? 'objective' : 'program'}
                  parentWeight={formParentWeight}
                  selectedObjectiveData={selectedObjectiveData}
                  currentTotal={0}
                  onSubmit={handleSaveInitiative}
                  onCancel={handleCancel}
                  initialData={editingInitiative}
                />
              );
            })()}
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
                handleEditBudget(selectedActivity);
              }}
              isReadOnly={!isUserPlanner}
            />
          </div>
        </div>
      )}

      {/* Plan Preview Modal */}
      <PlanPreviewModal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        objectives={selectedObjectives}
        organizationName={userOrganization?.name || 'Unknown Organization'}
        plannerName={plannerName}
        fromDate={fromDate}
        toDate={toDate}
        planType={selectedPlanType}
        refreshKey={refreshKey}
      />

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
