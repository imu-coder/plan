import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, Eye, Building2, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, BarChart3, PieChart, DollarSign, LayoutGrid, TrendingUp, Users, FileText } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
import { isAdmin, isEvaluator } from '../types/user';
import Cookies from 'js-cookie';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title, PointElement, LineElement);

// Set some chart defaults
ChartJS.defaults.color = '#4b5563';
ChartJS.defaults.font.family = 'Inter, sans-serif';

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'reviewed' | 'analytics'>('overview');
  const [budgetData, setBudgetData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [planStatusData, setPlanStatusData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [orgSubmissionData, setOrgSubmissionData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [budgetTrendsData, setBudgetTrendsData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [userOrgIds, setUserOrgIds] = useState<number[]>([]);

  // Check if user has admin permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        // Get user's organization IDs for filtering (admins can see all)
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgIds = authData.userOrganizations.map(org => org.organization);
          setUserOrgIds(orgIds);
          console.log('Admin organization IDs:', orgIds);
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

  // Fetch all organizations to map IDs to names
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
        console.log('Organizations map created:', orgMap);
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      }
    };
    
    fetchOrganizations();
  }, []);

  // Fetch all plans for admin analytics
  const { data: allPlans, isLoading, refetch } = useQuery({
    queryKey: ['plans', 'admin-all'],
    queryFn: async () => {
      console.log('Fetching all plans for admin dashboard');
      try {
        await auth.getCurrentUser();
        
        // Get ALL plans for admin view
        const response = await api.get('/plans/');
        
        console.log('All plans response for admin:', response.data?.length || 0);
        
        const plans = response.data?.results || response.data || [];
        
        console.log(`Admin dashboard loaded ${plans.length} total plans`);
        
        // Map organization names
        if (Array.isArray(plans)) {
          plans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return { data: plans };
      } catch (error) {
        console.error('Error fetching all plans:', error);
        throw error;
      }
    },
    retry: 2,
    refetchInterval: 60000, // Refresh every minute
    refetchOnWindowFocus: true
  });

  // Fetch pending plans for review
  const { data: pendingPlans } = useQuery({
    queryKey: ['plans', 'admin-pending'],
    queryFn: async () => {
      try {
        await auth.getCurrentUser();
        
        const response = await api.get('/plans/', {
          params: {
            status: 'SUBMITTED'
          }
        });
        
        const plans = response.data?.results || response.data || [];
        
        // Map organization names
        if (Array.isArray(plans)) {
          plans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return { data: plans };
      } catch (error) {
        console.error('Error fetching pending plans:', error);
        throw error;
      }
    },
    enabled: !!organizationsMap && Object.keys(organizationsMap).length > 0,
    retry: 2
  });

  // Fetch reviewed plans
  const { data: reviewedPlans } = useQuery({
    queryKey: ['plans', 'admin-reviewed'],
    queryFn: async () => {
      try {
        await auth.getCurrentUser();
        
        const response = await api.get('/plans/', {
          params: {
            status__in: 'APPROVED,REJECTED'
          }
        });
        
        const plans = response.data?.results || response.data || [];
        
        // Map organization names
        if (Array.isArray(plans)) {
          plans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return { data: plans };
      } catch (error) {
        console.error('Error fetching reviewed plans:', error);
        throw error;
      }
    },
    enabled: !!organizationsMap && Object.keys(organizationsMap).length > 0,
    retry: 2
  });

  // Calculate budget totals from SubActivity model
  const calculateBudgetTotals = (plans: any[]) => {
    let totalBudget = 0;
    let totalGovernment = 0;
    let totalPartners = 0;
    let totalSDG = 0;
    let totalOther = 0;
    let totalAvailable = 0;
    let totalGap = 0;

    if (!plans || !Array.isArray(plans)) {
      return {
        totalBudget: 0,
        totalGovernment: 0,
        totalPartners: 0,
        totalSDG: 0,
        totalOther: 0,
        totalAvailable: 0,
        totalGap: 0
      };
    }

    plans.forEach((plan: any) => {
      if (!plan.objectives) return;

      plan.objectives.forEach((objective: any) => {
        if (!objective.initiatives) return;

        objective.initiatives.forEach((initiative: any) => {
          if (!initiative.main_activities) return;

          initiative.main_activities.forEach((activity: any) => {
            // Calculate budget from sub-activities (new model)
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                const subBudgetRequired = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                const subGovernment = Number(subActivity.government_treasury || 0);
                const subPartners = Number(subActivity.partners_funding || 0);
                const subSDG = Number(subActivity.sdg_funding || 0);
                const subOther = Number(subActivity.other_funding || 0);
                const subTotalAvailable = subGovernment + subPartners + subSDG + subOther;
                const subGap = Math.max(0, subBudgetRequired - subTotalAvailable);

                totalBudget += subBudgetRequired;
                totalGovernment += subGovernment;
                totalPartners += subPartners;
                totalSDG += subSDG;
                totalOther += subOther;
                totalAvailable += subTotalAvailable;
                totalGap += subGap;
              });
            } else if (activity.budget) {
              // Fallback to legacy budget if no sub-activities
              const budgetRequired = activity.budget.budget_calculation_type === 'WITH_TOOL'
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);
              
              const government = Number(activity.budget.government_treasury || 0);
              const partners = Number(activity.budget.partners_funding || 0);
              const sdg = Number(activity.budget.sdg_funding || 0);
              const other = Number(activity.budget.other_funding || 0);
              const available = government + partners + sdg + other;
              const gap = Math.max(0, budgetRequired - available);

              totalBudget += budgetRequired;
              totalGovernment += government;
              totalPartners += partners;
              totalSDG += sdg;
              totalOther += other;
              totalAvailable += available;
              totalGap += gap;
            }
          });
        });
      });
    });

    return {
      totalBudget,
      totalGovernment,
      totalPartners,
      totalSDG,
      totalOther,
      totalAvailable,
      totalGap
    };
  };

  // Update chart data when plans data changes
  useEffect(() => {
    if (allPlans?.data) {
      const plans = allPlans.data;
      
      // Plan Status Distribution
      const statusCounts = {
        DRAFT: plans.filter((p: any) => p.status === 'DRAFT').length,
        SUBMITTED: plans.filter((p: any) => p.status === 'SUBMITTED').length,
        APPROVED: plans.filter((p: any) => p.status === 'APPROVED').length,
        REJECTED: plans.filter((p: any) => p.status === 'REJECTED').length
      };

      setPlanStatusData({
        labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
        datasets: [{
          data: [statusCounts.DRAFT, statusCounts.SUBMITTED, statusCounts.APPROVED, statusCounts.REJECTED],
          backgroundColor: ['#9CA3AF', '#F59E0B', '#10B981', '#EF4444'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      });

      // Organization Submission Data
      const orgCounts: Record<string, number> = {};
      plans.forEach((plan: any) => {
        const orgName = plan.organizationName || organizationsMap[plan.organization] || 'Unknown';
        orgCounts[orgName] = (orgCounts[orgName] || 0) + 1;
      });

      const topOrgs = Object.entries(orgCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

      setOrgSubmissionData({
        labels: topOrgs.map(([name]) => name),
        datasets: [{
          label: 'Plans Submitted',
          data: topOrgs.map(([,count]) => count),
          backgroundColor: '#3B82F6',
          borderColor: '#1D4ED8',
          borderWidth: 1
        }]
      });

      // Budget Analysis using SubActivity model
      const budgetTotals = calculateBudgetTotals(plans);
      
      setBudgetData({
        labels: ['Government', 'Partners', 'SDG', 'Other', 'Gap'],
        datasets: [{
          label: 'Budget Distribution (ETB)',
          data: [
            budgetTotals.totalGovernment,
            budgetTotals.totalPartners,
            budgetTotals.totalSDG,
            budgetTotals.totalOther,
            budgetTotals.totalGap
          ],
          backgroundColor: ['#10B981', '#8B5CF6', '#F59E0B', '#6B7280', '#EF4444'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      });

      // Budget Trends (monthly aggregation)
      const monthlyBudgets: Record<string, number> = {};
      plans.forEach((plan: any) => {
        if (plan.created_at) {
          try {
            const month = format(new Date(plan.created_at), 'MMM yyyy');
            const planBudget = calculateBudgetTotals([plan]);
            monthlyBudgets[month] = (monthlyBudgets[month] || 0) + planBudget.totalBudget;
          } catch (e) {
            console.error('Error processing plan date:', e);
          }
        }
      });

      const sortedMonths = Object.entries(monthlyBudgets)
        .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
        .slice(-6); // Last 6 months

      setBudgetTrendsData({
        labels: sortedMonths.map(([month]) => month),
        datasets: [{
          label: 'Total Budget (ETB)',
          data: sortedMonths.map(([,budget]) => budget),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      });
    }
  }, [allPlans?.data, organizationsMap]);

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await auth.getCurrentUser();
      await refetch();
      setSuccess('Dashboard data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to refresh dashboard data');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Review mutation (approve or reject)
  const reviewMutation = useMutation({
    mutationFn: async (reviewData: { planId: string, status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      try {
        console.log(`Admin reviewing plan ${reviewData.planId} with status: ${reviewData.status}`);
        
        await auth.getCurrentUser();
        await api.get('/auth/csrf/');
        const csrfToken = Cookies.get('csrftoken');
        
        const reviewPayload = {
          status: reviewData.status,
          feedback: reviewData.feedback || ''
        };
        
        const timestamp = new Date().getTime();
        
        if (reviewData.status === 'APPROVED') {
          const response = await api.post(`/plans/${reviewData.planId}/approve/?_=${timestamp}`, reviewPayload);
          return response;
        } else {
          const response = await api.post(`/plans/${reviewData.planId}/reject/?_=${timestamp}`, reviewPayload);
          return response;
        }
      } catch (error) {
        console.error('Admin review submission failed:', error);
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
      console.error('Admin review mutation error:', error);
      setError(error.message || 'Failed to submit review');
      setTimeout(() => setError(null), 5000);
    },
  });

  const handleViewPlan = async (plan: any) => {
    if (!plan || !plan.id) {
      setError('Invalid plan data for viewing');
      return;
    }
    
    console.log('Admin navigating to plan details:', plan.id);
    setError(null);
    
    try {
      navigate(`/plans/${plan.id}`);
    } catch (err) {
      console.error('Failed to navigate to plan:', err);
      setError('Error accessing plan. Please try again.');
    }
  };

  const handleReviewPlan = async (plan: any) => {
    if (!plan || !plan.id) {
      setError('Invalid plan data for review');
      return;
    }
    
    try {
      await auth.getCurrentUser();
      console.log('Admin opening review modal for plan:', plan.id);
      setSelectedPlan(plan);
      setShowReviewModal(true);
    } catch (error) {
      console.error('Authentication failed:', error);
      setError('Failed to authenticate. Please try again.');
    }
  };

  const handleReviewSubmit = async (data: { status: 'APPROVED' | 'REJECTED'; feedback: string }) => {
    if (!selectedPlan) return;
    
    try {
      await reviewMutation.mutateAsync({
        planId: selectedPlan.id,
        status: data.status,
        feedback: data.feedback
      });
    } catch (error) {
      console.error('Failed to submit admin review:', error);
      
      let errorMessage = 'Failed to submit review';
      if (error.response?.status === 403) {
        errorMessage = 'Permission denied. You may not have admin permissions.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Plan not found or no longer available for review.';
      } else if (error.response?.status === 400) {
        errorMessage = 'Invalid review data. Please check your input.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'Invalid date';
    }
  };

  const getOrganizationName = (plan: any) => {
    if (plan.organizationName) return plan.organizationName;
    if (plan.organization_name) return plan.organization_name;
    if (plan.organization && organizationsMap[plan.organization]) {
      return organizationsMap[plan.organization];
    }
    return 'Unknown Organization';
  };

  // Calculate summary statistics
  const allPlansData = allPlans?.data || [];
  const pendingCount = pendingPlans?.data?.length || 0;
  const reviewedCount = reviewedPlans?.data?.length || 0;
  const approvedCount = allPlansData.filter((p: any) => p.status === 'APPROVED').length;
  const rejectedCount = allPlansData.filter((p: any) => p.status === 'REJECTED').length;
  const draftCount = allPlansData.filter((p: any) => p.status === 'DRAFT').length;
  const totalPlans = allPlansData.length;

  // Calculate budget totals using SubActivity model
  const budgetTotals = calculateBudgetTotals(allPlansData);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading admin dashboard...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">System-wide analytics and plan management</p>
      </div>

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
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('overview')}
              className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <LayoutGrid className="h-5 w-5 mr-2" />
                Overview
              </div>
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'pending'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <Bell className="h-5 w-5 mr-2" />
                Pending Reviews
                {pendingCount > 0 && (
                  <span className="ml-2 bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs">
                    {pendingCount}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('reviewed')}
              className={`mr-8 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'reviewed'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Reviewed Plans
                {reviewedCount > 0 && (
                  <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">
                    {reviewedCount}
                  </span>
                )}
              </div>
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                Analytics
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Total Plans</h3>
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <p className="text-3xl font-semibold text-blue-600">{totalPlans}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Draft Plans</h3>
                <FileText className="h-5 w-5 text-gray-500" />
              </div>
              <p className="text-3xl font-semibold text-gray-600">{draftCount}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Pending Reviews</h3>
                <Bell className="h-5 w-5 text-amber-500" />
              </div>
              <p className="text-3xl font-semibold text-amber-600">{pendingCount}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Approved Plans</h3>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
              <p className="text-3xl font-semibold text-green-600">{approvedCount}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Rejected Plans</h3>
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
              <p className="text-3xl font-semibold text-red-600">{rejectedCount}</p>
            </div>

            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-500">Organizations</h3>
                <Building2 className="h-5 w-5 text-purple-500" />
              </div>
              <p className="text-3xl font-semibold text-purple-600">{Object.keys(organizationsMap).length}</p>
            </div>
          </div>

          {/* Budget Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-500">Total Budget Required</h3>
                <DollarSign className="h-6 w-6 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-blue-600">
                ETB {budgetTotals.totalBudget.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">Across all plans</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-500">Total Available Funding</h3>
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
              <p className="text-2xl font-bold text-green-600">
                ETB {budgetTotals.totalAvailable.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">From all sources</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-500">Funding Gap</h3>
                <AlertCircle className="h-6 w-6 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">
                ETB {budgetTotals.totalGap.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">Additional funding needed</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-500">Funding Coverage</h3>
                <PieChart className="h-6 w-6 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {budgetTotals.totalBudget > 0 
                  ? `${((budgetTotals.totalAvailable / budgetTotals.totalBudget) * 100).toFixed(1)}%`
                  : '0%'
                }
              </p>
              <p className="text-xs text-gray-500 mt-1">Budget coverage ratio</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
              >
                {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh Data
              </button>
              
              <button
                onClick={() => setActiveTab('pending')}
                className="flex items-center px-4 py-2 text-sm text-amber-600 hover:text-amber-800 border border-amber-200 rounded-md"
              >
                <Bell className="h-4 w-4 mr-2" />
                Review Pending Plans ({pendingCount})
              </button>
              
              <button
                onClick={() => setActiveTab('analytics')}
                className="flex items-center px-4 py-2 text-sm text-purple-600 hover:text-purple-800 border border-purple-200 rounded-md"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                View Analytics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Status Distribution */}
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

            {/* Budget Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget Distribution by Source</h3>
              <div className="h-64">
                <Doughnut 
                  data={budgetData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom'
                      },
                      tooltip: {
                        callbacks: {
                          label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            return `${label}: ETB ${value.toLocaleString()}`;
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Organization Submissions */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plans by Organization</h3>
              <div className="h-64">
                <Bar 
                  data={orgSubmissionData}
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
                        ticks: {
                          stepSize: 1
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Budget Trends */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget Trends (Last 6 Months)</h3>
              <div className="h-64">
                <Line 
                  data={budgetTrendsData}
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
                        ticks: {
                          callback: function(value) {
                            return 'ETB ' + Number(value).toLocaleString();
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Detailed Budget Breakdown */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Detailed Budget Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Government Treasury</div>
                <div className="text-xl font-bold text-blue-600">
                  ETB {budgetTotals.totalGovernment.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {budgetTotals.totalBudget > 0 
                    ? `${((budgetTotals.totalGovernment / budgetTotals.totalBudget) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
              </div>
              
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Partners Funding</div>
                <div className="text-xl font-bold text-purple-600">
                  ETB {budgetTotals.totalPartners.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {budgetTotals.totalBudget > 0 
                    ? `${((budgetTotals.totalPartners / budgetTotals.totalBudget) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
              </div>
              
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">SDG Funding</div>
                <div className="text-xl font-bold text-yellow-600">
                  ETB {budgetTotals.totalSDG.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {budgetTotals.totalBudget > 0 
                    ? `${((budgetTotals.totalSDG / budgetTotals.totalBudget) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
              </div>
              
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Other Funding</div>
                <div className="text-xl font-bold text-gray-600">
                  ETB {budgetTotals.totalOther.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {budgetTotals.totalBudget > 0 
                    ? `${((budgetTotals.totalOther / budgetTotals.totalBudget) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-sm text-gray-500 mb-1">Funding Gap</div>
                <div className="text-xl font-bold text-red-600">
                  ETB {budgetTotals.totalGap.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {budgetTotals.totalBudget > 0 
                    ? `${((budgetTotals.totalGap / budgetTotals.totalBudget) * 100).toFixed(1)}%`
                    : '0%'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Plan Activity</h3>
            {allPlansData.length > 0 ? (
              <div className="space-y-3">
                {allPlansData
                  .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                  .slice(0, 5)
                  .map((plan: any) => (
                    <div key={plan.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <Building2 className="h-5 w-5 text-gray-400 mr-3" />
                        <div>
                          <p className="font-medium text-gray-900">{getOrganizationName(plan)}</p>
                          <p className="text-sm text-gray-500">
                            {plan.planner_name} • {formatDate(plan.updated_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                          plan.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                          plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {plan.status}
                        </span>
                        <button
                          onClick={() => handleViewPlan(plan)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p>No plans available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Reviews Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Pending Reviews</h3>
                <p className="mt-1 text-sm text-gray-500">
                  All plans submitted for review across the system.
                </p>
              </div>
              <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                <div className="flex items-center">
                  <Bell className="h-6 w-6 text-gray-400 mr-2" />
                  <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-4 flex justify-end">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
              >
                {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh Plans
              </button>
            </div>

            {!pendingPlans?.data || pendingPlans.data.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No pending plans</h3>
                <p className="text-gray-500 max-w-lg mx-auto">
                  There are no plans waiting for review across the system.
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planner
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submitted Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planning Period
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingPlans.data.map((plan: any) => (
                      <tr key={plan.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                            <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.planner_name || 'Unknown Planner'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.type || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                            <span className="text-sm text-gray-500">
                              {plan.submitted_at ? formatDate(plan.submitted_at) : 'Not yet submitted'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.from_date && plan.to_date ? 
                            `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                            'Date not available'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            {plan.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleViewPlan(plan)}
                              className="text-blue-600 hover:text-blue-900 flex items-center"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </button>
                            <button
                              onClick={() => handleReviewPlan(plan)}
                              className="text-green-600 hover:text-green-900 flex items-center ml-2"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviewed Plans Tab */}
      {activeTab === 'reviewed' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Reviewed Plans</h3>
                <p className="mt-1 text-sm text-gray-500">
                  All plans that have been reviewed (approved or rejected) across the system.
                </p>
              </div>
            </div>

            {!reviewedPlans?.data || reviewedPlans.data.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 mt-6">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No reviewed plans</h3>
                <p className="text-gray-500 max-w-lg mx-auto">
                  No plans have been reviewed yet across the system.
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planner
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan Type
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planning Period
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reviewed Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Budget (ETB)
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reviewedPlans.data.map((plan: any) => {
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
                            {plan.planner_name || 'Unknown Planner'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.type || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.from_date && plan.to_date ? 
                              `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                              'Date not available'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {plan.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.reviews && plan.reviews.length > 0 ? 
                              formatDate(plan.reviews[plan.reviews.length - 1].reviewed_at) : 
                              formatDate(plan.updated_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="text-right">
                              <div className="font-medium">
                                {planBudget.totalBudget.toLocaleString()}
                              </div>
                              {planBudget.totalGap > 0 && (
                                <div className="text-xs text-red-600">
                                  Gap: {planBudget.totalGap.toLocaleString()}
                                </div>
                              )}
                            </div>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Admin Review: {getOrganizationName(selectedPlan)}
            </h3>
            
            <PlanReviewForm
              plan={selectedPlan}
              onSubmit={handleReviewSubmit}
              onCancel={() => {
                setShowReviewModal(false);
                setSelectedPlan(null);
              }}
              isSubmitting={reviewMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;