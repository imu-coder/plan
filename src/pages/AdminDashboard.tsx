import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, PieChart, TrendingUp, Users, Building2, FileText, 
  CheckCircle, XCircle, Clock, DollarSign, AlertCircle, Loader, 
  RefreshCw, Eye, Filter, Search, ChevronUp, ChevronDown,
  Calendar, Target, Activity, Briefcase, Award, Shield
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
import { isAdmin } from '../types/user';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // State management
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'reviewed' | 'analytics' | 'budget-activity' | 'executive-performance'>('overview');
  
  // Filtering and sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');
  const [organizationFilter, setOrganizationFilter] = useState<string>('ALL');
  const [sortField, setSortField] = useState<'date' | 'organization' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Check admin permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        if (!isAdmin(authData.userOrganizations)) {
          setError('You do not have permission to access the admin dashboard');
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
        setError('Failed to verify your permissions');
      }
    };
    
    checkPermissions();
  }, [navigate]);

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

  // Fetch all plans with immediate display
  const { data: allPlans, isLoading, refetch } = useQuery({
    queryKey: ['plans', 'admin-all'],
    queryFn: async () => {
      try {
        const response = await plans.getAll();
        const allPlans = response?.data || [];
        
        // Map organization names immediately
        const plansWithOrgNames = allPlans.map(plan => ({
          ...plan,
          organizationName: organizationsMap[plan.organization] || 'Unknown Organization'
        }));
        
        return { data: plansWithOrgNames };
      } catch (error) {
        console.error('Error fetching all plans:', error);
        throw error;
      }
    },
    retry: 1,
    staleTime: 30000,
    suspense: false,
    refetchOnWindowFocus: false
  });

  // Calculate comprehensive budget totals using SubActivity model
  const calculateBudgetTotals = (plans: any[]) => {
    let totalBudget = 0;
    let totalGovernment = 0;
    let totalPartners = 0;
    let totalSDG = 0;
    let totalOther = 0;
    let totalAvailable = 0;
    
    // Budget by activity type
    const budgetByActivityType = {
      Training: 0,
      Meeting: 0,
      Workshop: 0,
      Supervision: 0,
      Procurement: 0,
      Printing: 0,
      Other: 0
    };

    plans.forEach(plan => {
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  // Calculate from sub-activities (new model)
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const subBudgetRequired = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      
                      const subGov = Number(subActivity.government_treasury || 0);
                      const subPartners = Number(subActivity.partners_funding || 0);
                      const subSDG = Number(subActivity.sdg_funding || 0);
                      const subOther = Number(subActivity.other_funding || 0);
                      
                      totalBudget += subBudgetRequired;
                      totalGovernment += subGov;
                      totalPartners += subPartners;
                      totalSDG += subSDG;
                      totalOther += subOther;
                      
                      // Add to activity type budget
                      const activityType = subActivity.activity_type || 'Other';
                      if (budgetByActivityType[activityType] !== undefined) {
                        budgetByActivityType[activityType] += subBudgetRequired;
                      } else {
                        budgetByActivityType.Other += subBudgetRequired;
                      }
                    });
                  } 
                  // Fallback to legacy budget if no sub-activities
                  else if (activity.budget) {
                    const budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL'
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    
                    const gov = Number(activity.budget.government_treasury || 0);
                    const partners = Number(activity.budget.partners_funding || 0);
                    const sdg = Number(activity.budget.sdg_funding || 0);
                    const other = Number(activity.budget.other_funding || 0);
                    
                    totalBudget += budgetRequired;
                    totalGovernment += gov;
                    totalPartners += partners;
                    totalSDG += sdg;
                    totalOther += other;
                    
                    // Add to activity type budget (use activity_type from budget or default to 'Other')
                    const activityType = activity.budget.activity_type || 'Other';
                    if (budgetByActivityType[activityType] !== undefined) {
                      budgetByActivityType[activityType] += budgetRequired;
                    } else {
                      budgetByActivityType.Other += budgetRequired;
                    }
                  }
                });
              }
            });
          }
        });
      }
    });

    totalAvailable = totalGovernment + totalPartners + totalSDG + totalOther;
    const fundingGap = Math.max(0, totalBudget - totalAvailable);

    return {
      totalBudget,
      totalGovernment,
      totalPartners,
      totalSDG,
      totalOther,
      totalAvailable,
      fundingGap,
      budgetByActivityType
    };
  };

  // Review plan mutation
  const reviewPlanMutation = useMutation({
    mutationFn: async (reviewData: { planId: string, status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      try {
        await auth.getCurrentUser();
        await api.get('/auth/csrf/');
        
        const timestamp = new Date().getTime();
        if (reviewData.status === 'APPROVED') {
          return api.post(`/plans/${reviewData.planId}/approve/?_=${timestamp}`, { feedback: reviewData.feedback });
        } else {
          return api.post(`/plans/${reviewData.planId}/reject/?_=${timestamp}`, { feedback: reviewData.feedback });
        }
      } catch (error) {
        console.error('Review submission failed:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setShowReviewModal(false);
      setSelectedPlan(null);
      setSuccess('Plan review submitted successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to submit review');
      setTimeout(() => setError(null), 5000);
    },
  });

  // Helper functions
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getOrganizationName = (plan: any) => {
    return plan.organizationName || organizationsMap[plan.organization] || 'Unknown Organization';
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await refetch();
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleReviewPlan = (plan: any) => {
    setSelectedPlan(plan);
    setShowReviewModal(true);
  };

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    if (!selectedPlan) return;
    
    try {
      await reviewPlanMutation.mutateAsync({
        planId: selectedPlan.id,
        status: data.status,
        feedback: data.feedback
      });
    } catch (error: any) {
      setError(error.message || 'Failed to submit review');
    }
  };

  // Data processing
  const allPlansData = allPlans?.data || [];
  const submittedPlans = allPlansData.filter(plan => ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(plan.status));
  const pendingPlans = allPlansData.filter(plan => plan.status === 'SUBMITTED');
  const approvedPlans = allPlansData.filter(plan => plan.status === 'APPROVED');
  const rejectedPlans = allPlansData.filter(plan => plan.status === 'REJECTED');
  const leoEoPlans = allPlansData.filter(plan => plan.type === 'LEO/EO Plan');

  // Calculate budget totals
  const budgetTotals = calculateBudgetTotals(allPlansData);

  // Filter and sort reviewed plans
  const getFilteredReviewedPlans = () => {
    let filtered = [...approvedPlans, ...rejectedPlans];
    
    // Apply filters
    if (searchTerm) {
      filtered = filtered.filter(plan => 
        plan.planner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getOrganizationName(plan).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(plan => plan.status === statusFilter);
    }
    
    if (organizationFilter !== 'ALL') {
      filtered = filtered.filter(plan => plan.organization.toString() === organizationFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'date':
          aValue = new Date(a.submitted_at || a.created_at).getTime();
          bValue = new Date(b.submitted_at || b.created_at).getTime();
          break;
        case 'organization':
          aValue = getOrganizationName(a).toLowerCase();
          bValue = getOrganizationName(b).toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        default:
          return 0;
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  };

  // Pagination for reviewed plans
  const filteredReviewedPlans = getFilteredReviewedPlans();
  const totalPages = Math.ceil(filteredReviewedPlans.length / itemsPerPage);
  const paginatedReviewedPlans = filteredReviewedPlans.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Chart data preparation
  const planStatusData = {
    labels: ['Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [pendingPlans.length, approvedPlans.length, rejectedPlans.length],
      backgroundColor: ['#fbbf24', '#10b981', '#ef4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const budgetDistributionData = {
    labels: ['Government', 'Partners', 'SDG', 'Other'],
    datasets: [{
      data: [
        budgetTotals.totalGovernment,
        budgetTotals.totalPartners,
        budgetTotals.totalSDG,
        budgetTotals.totalOther
      ],
      backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const activityBudgetData = {
    labels: Object.keys(budgetTotals.budgetByActivityType),
    datasets: [{
      label: 'Budget by Activity Type',
      data: Object.values(budgetTotals.budgetByActivityType),
      backgroundColor: [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
        '#8b5cf6', '#06b6d4', '#84cc16'
      ],
      borderWidth: 1
    }]
  };

  // Monthly submission trends
  const getMonthlyTrends = () => {
    const monthlyData: Record<string, { submissions: number, budget: number }> = {};
    
    allPlansData.forEach(plan => {
      if (plan.submitted_at) {
        const month = format(new Date(plan.submitted_at), 'MMM yyyy');
        if (!monthlyData[month]) {
          monthlyData[month] = { submissions: 0, budget: 0 };
        }
        monthlyData[month].submissions += 1;
        
        // Calculate plan budget from sub-activities
        let planBudget = 0;
        if (plan.objectives && Array.isArray(plan.objectives)) {
          plan.objectives.forEach((objective: any) => {
            if (objective.initiatives && Array.isArray(objective.initiatives)) {
              objective.initiatives.forEach((initiative: any) => {
                if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                  initiative.main_activities.forEach((activity: any) => {
                    if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                      activity.sub_activities.forEach((subActivity: any) => {
                        const subBudget = subActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(subActivity.estimated_cost_with_tool || 0)
                          : Number(subActivity.estimated_cost_without_tool || 0);
                        planBudget += subBudget;
                      });
                    } else if (activity.budget) {
                      const activityBudget = activity.budget.budget_calculation_type === 'WITH_TOOL'
                        ? Number(activity.budget.estimated_cost_with_tool || 0)
                        : Number(activity.budget.estimated_cost_without_tool || 0);
                      planBudget += activityBudget;
                    }
                  });
                }
              });
            }
          });
        }
        monthlyData[month].budget += planBudget;
      }
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    return {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Submissions',
          data: sortedMonths.map(month => monthlyData[month].submissions),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'Budget ($)',
          data: sortedMonths.map(month => monthlyData[month].budget),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          yAxisID: 'y1'
        }
      ]
    };
  };

  // Organization performance data
  const getOrganizationPerformance = () => {
    const orgPerformance: Record<string, { plans: number, budget: number, approved: number }> = {};
    
    allPlansData.forEach(plan => {
      const orgName = getOrganizationName(plan);
      if (!orgPerformance[orgName]) {
        orgPerformance[orgName] = { plans: 0, budget: 0, approved: 0 };
      }
      
      orgPerformance[orgName].plans += 1;
      if (plan.status === 'APPROVED') {
        orgPerformance[orgName].approved += 1;
      }
      
      // Calculate plan budget
      let planBudget = 0;
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const subBudget = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      planBudget += subBudget;
                    });
                  } else if (activity.budget) {
                    const activityBudget = activity.budget.budget_calculation_type === 'WITH_TOOL'
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    planBudget += activityBudget;
                  }
                });
              }
            });
          }
        });
      }
      orgPerformance[orgName].budget += planBudget;
    });

    const sortedOrgs = Object.entries(orgPerformance)
      .sort(([,a], [,b]) => b.plans - a.plans)
      .slice(0, 10);

    return {
      labels: sortedOrgs.map(([name]) => name),
      datasets: [{
        label: 'Total Plans',
        data: sortedOrgs.map(([,data]) => data.plans),
        backgroundColor: '#3b82f6'
      }]
    };
  };

  // Budget by activity type for Budget Activity tab
  const getBudgetByActivityData = () => {
    const activityData: Record<string, Record<string, { count: number, budget: number }>> = {};
    
    allPlansData.forEach(plan => {
      const orgName = getOrganizationName(plan);
      
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const activityType = subActivity.activity_type || 'Other';
                      const subBudget = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      
                      if (!activityData[activityType]) {
                        activityData[activityType] = {};
                      }
                      if (!activityData[activityType][orgName]) {
                        activityData[activityType][orgName] = { count: 0, budget: 0 };
                      }
                      
                      activityData[activityType][orgName].count += 1;
                      activityData[activityType][orgName].budget += subBudget;
                    });
                  } else if (activity.budget) {
                    const activityType = activity.budget.activity_type || 'Other';
                    const activityBudget = activity.budget.budget_calculation_type === 'WITH_TOOL'
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    
                    if (!activityData[activityType]) {
                      activityData[activityType] = {};
                    }
                    if (!activityData[activityType][orgName]) {
                      activityData[activityType][orgName] = { count: 0, budget: 0 };
                    }
                    
                    activityData[activityType][orgName].count += 1;
                    activityData[activityType][orgName].budget += activityBudget;
                  }
                });
              }
            });
          }
        });
      }
    });

    return activityData;
  };

  // Executive performance data
  const getExecutivePerformanceData = () => {
    const execData: Record<string, {
      totalPlans: number,
      approved: number,
      submitted: number,
      totalBudget: number,
      availableFunding: number,
      governmentBudget: number,
      sdgBudget: number,
      partnersBudget: number,
      fundingGap: number
    }> = {};

    allPlansData.forEach(plan => {
      const orgName = getOrganizationName(plan);
      
      if (!execData[orgName]) {
        execData[orgName] = {
          totalPlans: 0,
          approved: 0,
          submitted: 0,
          totalBudget: 0,
          availableFunding: 0,
          governmentBudget: 0,
          sdgBudget: 0,
          partnersBudget: 0,
          fundingGap: 0
        };
      }

      execData[orgName].totalPlans += 1;
      
      if (plan.status === 'APPROVED') execData[orgName].approved += 1;
      if (plan.status === 'SUBMITTED') execData[orgName].submitted += 1;

      // Calculate budget from sub-activities
      let planBudget = 0;
      let planGovernment = 0;
      let planSDG = 0;
      let planPartners = 0;
      let planOther = 0;

      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const subBudget = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      
                      planBudget += subBudget;
                      planGovernment += Number(subActivity.government_treasury || 0);
                      planSDG += Number(subActivity.sdg_funding || 0);
                      planPartners += Number(subActivity.partners_funding || 0);
                      planOther += Number(subActivity.other_funding || 0);
                    });
                  } else if (activity.budget) {
                    const activityBudget = activity.budget.budget_calculation_type === 'WITH_TOOL'
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    
                    planBudget += activityBudget;
                    planGovernment += Number(activity.budget.government_treasury || 0);
                    planSDG += Number(activity.budget.sdg_funding || 0);
                    planPartners += Number(activity.budget.partners_funding || 0);
                    planOther += Number(activity.budget.other_funding || 0);
                  }
                });
              }
            });
          }
        });
      }

      const planAvailableFunding = planGovernment + planSDG + planPartners + planOther;
      const planFundingGap = Math.max(0, planBudget - planAvailableFunding);

      execData[orgName].totalBudget += planBudget;
      execData[orgName].availableFunding += planAvailableFunding;
      execData[orgName].governmentBudget += planGovernment;
      execData[orgName].sdgBudget += planSDG;
      execData[orgName].partnersBudget += planPartners;
      execData[orgName].fundingGap += planFundingGap;
    });

    return Object.entries(execData).map(([orgName, data]) => ({
      organization: orgName,
      ...data
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span className="text-lg">Loading admin dashboard...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Beautiful Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-green-600 rounded-lg p-8 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center">
              <Shield className="h-8 w-8 mr-3" />
              Admin Dashboard
            </h1>
            <p className="text-blue-100 text-lg">
              Comprehensive system overview and management
            </p>
            <p className="text-blue-200 text-sm mt-1">
              Monitor plans, budgets, and organizational performance across the Ministry
            </p>
          </div>
          <div className="text-right">
            <div className="bg-white/20 backdrop-blur rounded-lg p-4">
              <div className="text-2xl font-bold">{allPlansData.length}</div>
              <div className="text-sm text-blue-100">Total Plans</div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
          <AlertCircle className="h-5 w-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center text-green-700">
          <CheckCircle className="h-5 w-5 mr-2" />
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-8">
            {[
              { key: 'overview', label: 'Overview', icon: BarChart3 },
              { key: 'pending', label: 'Pending Reviews', icon: Clock },
              { key: 'reviewed', label: 'Reviewed Plans', icon: CheckCircle },
              { key: 'analytics', label: 'Analytics', icon: TrendingUp },
              { key: 'budget-activity', label: 'Budget by Activity', icon: DollarSign },
              { key: 'executive-performance', label: 'Executive Performance', icon: Award }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Plan Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Plans</p>
                  <p className="text-3xl font-bold text-gray-900">{submittedPlans.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Submitted + Approved</p>
                </div>
                <FileText className="h-12 w-12 text-blue-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Pending Review</p>
                  <p className="text-3xl font-bold text-amber-600">{pendingPlans.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Awaiting evaluation</p>
                </div>
                <Clock className="h-12 w-12 text-amber-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Approved</p>
                  <p className="text-3xl font-bold text-green-600">{approvedPlans.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Successfully reviewed</p>
                </div>
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Rejected</p>
                  <p className="text-3xl font-bold text-red-600">{rejectedPlans.length}</p>
                  <p className="text-sm text-gray-500 mt-1">Needs revision</p>
                </div>
                <XCircle className="h-12 w-12 text-red-500" />
              </div>
            </div>
          </div>

          {/* Budget Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Budget</p>
                  <p className="text-3xl font-bold text-blue-600">${budgetTotals.totalBudget.toLocaleString()}</p>
                  <p className="text-sm text-gray-500 mt-1">All LEO/EO Plans</p>
                </div>
                <DollarSign className="h-12 w-12 text-blue-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Available Funding</p>
                  <p className="text-3xl font-bold text-green-600">${budgetTotals.totalAvailable.toLocaleString()}</p>
                  <p className="text-sm text-gray-500 mt-1">All sources combined</p>
                </div>
                <Target className="h-12 w-12 text-green-500" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Funding Gap</p>
                  <p className="text-3xl font-bold text-red-600">${budgetTotals.fundingGap.toLocaleString()}</p>
                  <p className="text-sm text-gray-500 mt-1">Additional funding needed</p>
                </div>
                <AlertCircle className="h-12 w-12 text-red-500" />
              </div>
            </div>
          </div>

          {/* Budget by Activity Type */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <Activity className="h-5 w-5 mr-2 text-purple-600" />
              Budget by Activity Type
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {Object.entries(budgetTotals.budgetByActivityType).map(([type, budget], index) => {
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500', 'bg-purple-500', 'bg-cyan-500', 'bg-lime-500'];
                return (
                  <div key={type} className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className={`w-12 h-12 ${colors[index]} rounded-full flex items-center justify-center mx-auto mb-2`}>
                      <Activity className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-sm font-medium text-gray-700">{type}</div>
                    <div className="text-lg font-bold text-gray-900">${budget.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Distribution</h3>
              <div className="h-64">
                <Doughnut 
                  data={planStatusData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget & Funding Distribution</h3>
              <div className="h-64">
                <Doughnut 
                  data={budgetDistributionData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Submission Trends */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Submission Trends</h3>
            <div className="h-80">
              <Line 
                data={getMonthlyTrends()}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    mode: 'index' as const,
                    intersect: false,
                  },
                  scales: {
                    y: {
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      title: {
                        display: true,
                        text: 'Number of Submissions'
                      }
                    },
                    y1: {
                      type: 'linear' as const,
                      display: true,
                      position: 'right' as const,
                      title: {
                        display: true,
                        text: 'Budget ($)'
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
                    },
                  },
                }}
              />
            </div>
          </div>

          {/* Top Organizations by Plan Activity */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Organizations by Plan Activity</h3>
            <div className="h-80">
              <Bar 
                data={getOrganizationPerformance()}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: 'Number of Plans'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pending Reviews Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Pending Plan Reviews</h3>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
              >
                {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh
              </button>
            </div>

            {pendingPlans.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No pending reviews</h3>
                <p className="text-gray-500">All submitted plans have been reviewed.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Planner</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingPlans.map((plan: any) => {
                      const planBudget = calculateBudgetTotals([plan]);
                      return (
                        <tr key={plan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.planner_name || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.type}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(plan.submitted_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${planBudget.totalBudget.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => navigate(`/plans/${plan.id}`)}
                                className="text-blue-600 hover:text-blue-900 flex items-center"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </button>
                              <button
                                onClick={() => handleReviewPlan(plan)}
                                className="text-green-600 hover:text-green-900 flex items-center"
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Review
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviewed Plans Tab */}
      {activeTab === 'reviewed' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Reviewed Plans</h3>
              <div className="flex items-center space-x-4">
                {/* Search */}
                <div className="relative">
                  <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search plans..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="ALL">All Status</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                
                {/* Organization Filter */}
                <select
                  value={organizationFilter}
                  onChange={(e) => setOrganizationFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="ALL">All Organizations</option>
                  {Object.entries(organizationsMap).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => {
                        if (sortField === 'organization') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('organization');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center">
                        Organization
                        {sortField === 'organization' && (
                          sortOrder === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Planner</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan Type</th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => {
                        if (sortField === 'status') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('status');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center">
                        Status
                        {sortField === 'status' && (
                          sortOrder === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                      onClick={() => {
                        if (sortField === 'date') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('date');
                          setSortOrder('desc');
                        }
                      }}
                    >
                      <div className="flex items-center">
                        Review Date
                        {sortField === 'date' && (
                          sortOrder === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget Analysis</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedReviewedPlans.map((plan: any) => {
                    const planBudget = calculateBudgetTotals([plan]);
                    const fundingCoverage = planBudget.totalBudget > 0 
                      ? ((planBudget.totalAvailable / planBudget.totalBudget) * 100).toFixed(1)
                      : '0';
                    
                    return (
                      <tr key={plan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.planner_name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.type}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.reviews && plan.reviews.length > 0 
                            ? formatDate(plan.reviews[plan.reviews.length - 1].reviewed_at)
                            : formatDate(plan.updated_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Budget:</span>
                              <span className="font-medium">${planBudget.totalBudget.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Funding:</span>
                              <span className="font-medium text-green-600">${planBudget.totalAvailable.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Coverage:</span>
                              <span className={`font-medium ${Number(fundingCoverage) >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                {fundingCoverage}%
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => navigate(`/plans/${plan.id}`)}
                            className="text-blue-600 hover:text-blue-900 flex items-center"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-700">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredReviewedPlans.length)} of {filteredReviewedPlans.length} results
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          {/* Complete Budget Overview by Executives */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <Briefcase className="h-6 w-6 mr-2 text-blue-600" />
              Complete Budget Overview by Executives
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {Object.entries(organizationsMap).map(([orgId, orgName]) => {
                const orgPlans = allPlansData.filter(plan => plan.organization.toString() === orgId);
                const orgBudget = calculateBudgetTotals(orgPlans);
                const fundingCoverage = orgBudget.totalBudget > 0 
                  ? ((orgBudget.totalAvailable / orgBudget.totalBudget) * 100).toFixed(1)
                  : '0';
                
                const colors = [
                  'from-blue-500 to-blue-600',
                  'from-green-500 to-green-600', 
                  'from-purple-500 to-purple-600',
                  'from-red-500 to-red-600',
                  'from-yellow-500 to-yellow-600',
                  'from-indigo-500 to-indigo-600',
                  'from-pink-500 to-pink-600',
                  'from-cyan-500 to-cyan-600'
                ];
                const colorIndex = parseInt(orgId) % colors.length;
                
                return (
                  <div key={orgId} className={`bg-gradient-to-br ${colors[colorIndex]} p-6 rounded-lg text-white shadow-lg`}>
                    <div className="flex items-center justify-between mb-4">
                      <Building2 className="h-8 w-8 text-white/80" />
                      <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                        {orgPlans.length} Plans
                      </span>
                    </div>
                    <h4 className="font-bold text-lg mb-2 truncate" title={orgName}>{orgName}</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-white/80">Budget:</span>
                        <span className="font-semibold">${orgBudget.totalBudget.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/80">Funding:</span>
                        <span className="font-semibold">${orgBudget.totalAvailable.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/80">Coverage:</span>
                        <span className="font-semibold">{fundingCoverage}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/80">Gap:</span>
                        <span className="font-semibold">${orgBudget.fundingGap.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget by Activity Type</h3>
              <div className="h-64">
                <Bar 
                  data={activityBudgetData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      }
                    }
                  }}
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Funding Sources Distribution</h3>
              <div className="h-64">
                <Doughnut 
                  data={budgetDistributionData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Budget by Activity Tab */}
      {activeTab === 'budget-activity' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Budget Analysis by Activity Type</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organizations</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Count</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Budget</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(getBudgetByActivityData()).map(([activityType, orgData]) => {
                    const totalCount = Object.values(orgData).reduce((sum, data) => sum + data.count, 0);
                    const totalBudget = Object.values(orgData).reduce((sum, data) => sum + data.budget, 0);
                    
                    return (
                      <tr key={activityType} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Activity className="h-5 w-5 text-blue-600 mr-2" />
                            <span className="text-sm font-medium text-gray-900">{activityType}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {Object.entries(orgData).slice(0, 3).map(([orgName, data]) => (
                              <div key={orgName} className="flex justify-between text-xs">
                                <span className="text-gray-600 truncate max-w-32" title={orgName}>{orgName}</span>
                                <span className="text-gray-900 font-medium">{data.count} (${data.budget.toLocaleString()})</span>
                              </div>
                            ))}
                            {Object.keys(orgData).length > 3 && (
                              <div className="text-xs text-gray-500">
                                +{Object.keys(orgData).length - 3} more organizations
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                          {totalCount}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          ${totalBudget.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Executive Performance Tab */}
      {activeTab === 'executive-performance' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
              <Award className="h-6 w-6 mr-2 text-gold-600" />
              Executive Performance Overview
            </h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gradient-to-r from-blue-600 to-purple-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider">Organization</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Total Plans</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Approved</th>
                    <th className="px-6 py-4 text-center text-xs font-bold text-white uppercase tracking-wider">Submitted</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Total Budget</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Available Funding</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Government</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">SDG</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Partners</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-white uppercase tracking-wider">Funding Gap</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {getExecutivePerformanceData().map((execData, index) => (
                    <tr key={execData.organization} className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-gray-25' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 text-blue-600 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{execData.organization}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                        {execData.totalPlans}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {execData.approved}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {execData.submitted}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        ${execData.totalBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-green-600">
                        ${execData.availableFunding.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-blue-600">
                        ${execData.governmentBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-green-600">
                        ${execData.sdgBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-purple-600">
                        ${execData.partnersBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <span className={execData.fundingGap > 0 ? 'text-red-600' : 'text-green-600'}>
                          ${execData.fundingGap.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Review Plan: {getOrganizationName(selectedPlan)}
            </h3>
            
            <PlanReviewForm
              plan={selectedPlan}
              onSubmit={handleReviewSubmit}
              onCancel={() => {
                setShowReviewModal(false);
                setSelectedPlan(null);
              }}
              isSubmitting={reviewPlanMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;