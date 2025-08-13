import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  BarChart3, PieChart, TrendingUp, Users, Building2, Target, Activity, 
  DollarSign, CheckCircle, XCircle, Clock, AlertCircle, Loader, RefreshCw, 
  Eye, Calendar, FileText, Download, Settings, Filter, Search, ArrowUp, ArrowDown
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title,
  PointElement,
  LineElement,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title,
  PointElement,
  LineElement,
  Filler
);

// Chart configuration
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
  },
};

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // State management
  const [activeTab, setActiveTab] = useState<'overview' | 'pending' | 'reviewed' | 'analytics' | 'organizations' | 'users'>('overview');
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'organization' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: ''
  });

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
          setTimeout(() => navigate('/dashboard'), 3000);
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

  // Fetch all plans
  const { data: allPlans, isLoading: isLoadingPlans, refetch: refetchPlans } = useQuery({
    queryKey: ['plans', 'admin-all'],
    queryFn: async () => {
      try {
        const response = await plans.getAll();
        return response?.data || [];
      } catch (error) {
        console.error('Error fetching all plans:', error);
        throw error;
      }
    },
    retry: 2,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch all organizations
  const { data: allOrganizations, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ['organizations', 'admin-all'],
    queryFn: async () => {
      try {
        const response = await organizations.getAll();
        return response || [];
      } catch (error) {
        console.error('Error fetching organizations:', error);
        throw error;
      }
    },
    retry: 2,
  });

  // Calculate comprehensive statistics
  const calculateStats = () => {
    if (!allPlans || !Array.isArray(allPlans)) {
      return {
        totalPlans: 0,
        pendingPlans: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
        draftPlans: 0,
        totalBudget: 0,
        totalFunding: 0,
        fundingGap: 0,
        organizationsWithPlans: 0,
        avgPlanValue: 0,
        recentSubmissions: 0
      };
    }

    const stats = {
      totalPlans: allPlans.length,
      pendingPlans: allPlans.filter(p => p.status === 'SUBMITTED').length,
      approvedPlans: allPlans.filter(p => p.status === 'APPROVED').length,
      rejectedPlans: allPlans.filter(p => p.status === 'REJECTED').length,
      draftPlans: allPlans.filter(p => p.status === 'DRAFT').length,
      totalBudget: 0,
      totalFunding: 0,
      fundingGap: 0,
      organizationsWithPlans: new Set(allPlans.map(p => p.organization)).size,
      avgPlanValue: 0,
      recentSubmissions: 0
    };

    // Calculate budget totals using SubActivity model
    const budgetTotals = calculateBudgetTotals(allPlans);
    stats.totalBudget = budgetTotals.total;
    stats.totalFunding = budgetTotals.totalFunding;
    stats.fundingGap = budgetTotals.fundingGap;
    stats.avgPlanValue = stats.totalPlans > 0 ? stats.totalBudget / stats.totalPlans : 0;

    // Recent submissions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    stats.recentSubmissions = allPlans.filter(p => 
      p.submitted_at && new Date(p.submitted_at) > sevenDaysAgo
    ).length;

    return stats;
  };

  // Calculate budget totals using SubActivity model
  const calculateBudgetTotals = (plans: any[]) => {
    let total = 0;
    let totalFunding = 0;
    let governmentTotal = 0;
    let partnersTotal = 0;
    let sdgTotal = 0;
    let otherTotal = 0;

    if (!plans || !Array.isArray(plans)) {
      return { total, totalFunding, fundingGap: 0, governmentTotal, partnersTotal, sdgTotal, otherTotal };
    }

    try {
      plans.forEach((plan) => {
        if (!plan.objectives || !Array.isArray(plan.objectives)) return;

        plan.objectives.forEach((objective: any) => {
          if (!objective.initiatives || !Array.isArray(objective.initiatives)) return;

          objective.initiatives.forEach((initiative: any) => {
            if (!initiative.main_activities || !Array.isArray(initiative.main_activities)) return;

            initiative.main_activities.forEach((activity: any) => {
              // Calculate budget from sub-activities (new model)
              if (activity.sub_activities && Array.isArray(activity.sub_activities) && activity.sub_activities.length > 0) {
                activity.sub_activities.forEach((subActivity: any) => {
                  const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                    ? Number(subActivity.estimated_cost_with_tool || 0)
                    : Number(subActivity.estimated_cost_without_tool || 0);
                  
                  const subGov = Number(subActivity.government_treasury || 0);
                  const subPartners = Number(subActivity.partners_funding || 0);
                  const subSdg = Number(subActivity.sdg_funding || 0);
                  const subOther = Number(subActivity.other_funding || 0);
                  
                  total += subCost;
                  governmentTotal += subGov;
                  partnersTotal += subPartners;
                  sdgTotal += subSdg;
                  otherTotal += subOther;
                  totalFunding += (subGov + subPartners + subSdg + subOther);
                });
              } else if (activity.budget) {
                // Fallback to legacy budget if no sub-activities
                const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                  ? Number(activity.budget.estimated_cost_with_tool || 0)
                  : Number(activity.budget.estimated_cost_without_tool || 0);
                
                const gov = Number(activity.budget.government_treasury || 0);
                const partners = Number(activity.budget.partners_funding || 0);
                const sdg = Number(activity.budget.sdg_funding || 0);
                const other = Number(activity.budget.other_funding || 0);
                
                total += cost;
                governmentTotal += gov;
                partnersTotal += partners;
                sdgTotal += sdg;
                otherTotal += other;
                totalFunding += (gov + partners + sdg + other);
              }
            });
          });
        });
      });
    } catch (e) {
      console.error('Error calculating budget totals:', e);
    }

    return { 
      total, 
      totalFunding, 
      fundingGap: Math.max(0, total - totalFunding),
      governmentTotal,
      partnersTotal,
      sdgTotal,
      otherTotal
    };
  };

  const stats = calculateStats();

  // Prepare chart data
  const planStatusData = {
    labels: ['Draft', 'Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [stats.draftPlans, stats.pendingPlans, stats.approvedPlans, stats.rejectedPlans],
      backgroundColor: ['#9CA3AF', '#F59E0B', '#10B981', '#EF4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const budgetDistributionData = {
    labels: ['Government', 'Partners', 'SDG', 'Other', 'Gap'],
    datasets: [{
      data: [
        calculateBudgetTotals(allPlans || []).governmentTotal,
        calculateBudgetTotals(allPlans || []).partnersTotal,
        calculateBudgetTotals(allPlans || []).sdgTotal,
        calculateBudgetTotals(allPlans || []).otherTotal,
        calculateBudgetTotals(allPlans || []).fundingGap
      ],
      backgroundColor: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  // Monthly submission trends
  const getMonthlyTrends = () => {
    if (!allPlans || !Array.isArray(allPlans)) return { labels: [], datasets: [] };

    const monthlyData: Record<string, number> = {};
    const monthlyBudget: Record<string, number> = {};
    
    allPlans.forEach(plan => {
      if (plan.submitted_at) {
        const month = format(new Date(plan.submitted_at), 'MMM yyyy');
        monthlyData[month] = (monthlyData[month] || 0) + 1;
        
        // Calculate plan budget using SubActivity model
        const planBudget = calculatePlanBudget(plan);
        monthlyBudget[month] = (monthlyBudget[month] || 0) + planBudget;
      }
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    return {
      labels: sortedMonths,
      datasets: [
        {
          label: 'Plans Submitted',
          data: sortedMonths.map(month => monthlyData[month]),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'Budget Value (Thousands)',
          data: sortedMonths.map(month => Math.round(monthlyBudget[month] / 1000)),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    };
  };

  // Calculate individual plan budget using SubActivity model
  const calculatePlanBudget = (plan: any) => {
    let total = 0;

    try {
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  // Use SubActivity budget calculation
                  if (activity.sub_activities && Array.isArray(activity.sub_activities) && activity.sub_activities.length > 0) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      total += subCost;
                    });
                  } else if (activity.budget) {
                    // Fallback to legacy budget
                    const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    total += cost;
                  }
                });
              }
            });
          }
        });
      }
    } catch (e) {
      console.error('Error calculating plan budget:', e);
    }

    return total;
  };

  // Organization performance data
  const getOrganizationPerformance = () => {
    if (!allPlans || !allOrganizations) return { labels: [], datasets: [] };

    const orgStats: Record<string, { submitted: number; approved: number; budget: number }> = {};
    
    allPlans.forEach(plan => {
      const orgName = organizationsMap[plan.organization] || `Org ${plan.organization}`;
      if (!orgStats[orgName]) {
        orgStats[orgName] = { submitted: 0, approved: 0, budget: 0 };
      }
      
      if (plan.status === 'SUBMITTED' || plan.status === 'APPROVED') {
        orgStats[orgName].submitted += 1;
      }
      if (plan.status === 'APPROVED') {
        orgStats[orgName].approved += 1;
      }
      
      orgStats[orgName].budget += calculatePlanBudget(plan);
    });

    const orgNames = Object.keys(orgStats).slice(0, 10); // Top 10 organizations

    return {
      labels: orgNames,
      datasets: [
        {
          label: 'Plans Submitted',
          data: orgNames.map(name => orgStats[name].submitted),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
        },
        {
          label: 'Plans Approved',
          data: orgNames.map(name => orgStats[name].approved),
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
        }
      ]
    };
  };

  // Filter and sort plans
  const getFilteredPlans = (plans: any[]) => {
    if (!plans) return [];

    let filtered = plans.filter(plan => {
      const matchesSearch = !searchTerm || 
        plan.planner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        organizationsMap[plan.organization]?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || plan.status === statusFilter;
      
      const matchesDateRange = !dateRange.from || !dateRange.to || 
        (plan.submitted_at && 
         new Date(plan.submitted_at) >= new Date(dateRange.from) &&
         new Date(plan.submitted_at) <= new Date(dateRange.to));

      return matchesSearch && matchesStatus && matchesDateRange;
    });

    // Sort plans
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'date':
          aValue = new Date(a.submitted_at || a.created_at).getTime();
          bValue = new Date(b.submitted_at || b.created_at).getTime();
          break;
        case 'organization':
          aValue = organizationsMap[a.organization] || '';
          bValue = organizationsMap[b.organization] || '';
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

  // Review plan mutation
  const reviewPlanMutation = useMutation({
    mutationFn: async (reviewData: { planId: string, status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      try {
        await auth.getCurrentUser();
        await api.get('/auth/csrf/');
        
        const timestamp = new Date().getTime();
        
        if (reviewData.status === 'APPROVED') {
          return api.post(`/plans/${reviewData.planId}/approve/?_=${timestamp}`, { 
            feedback: reviewData.feedback 
          });
        } else {
          return api.post(`/plans/${reviewData.planId}/reject/?_=${timestamp}`, { 
            feedback: reviewData.feedback 
          });
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

  // Event handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      await refetchPlans();
      setSuccess('Data refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleViewPlan = (plan: any) => {
    navigate(`/plans/${plan.id}`);
  };

  const handleReviewPlan = (plan: any) => {
    setSelectedPlan(plan);
    setShowReviewModal(true);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString()}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-800';
      case 'SUBMITTED': return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOrganizationName = (plan: any) => {
    return organizationsMap[plan.organization] || `Organization ${plan.organization}`;
  };

  // Get filtered plans for current tab
  const pendingPlans = getFilteredPlans(allPlans?.filter(p => p.status === 'SUBMITTED') || []);
  const reviewedPlans = getFilteredPlans(allPlans?.filter(p => ['APPROVED', 'REJECTED'].includes(p.status)) || []);
  const allFilteredPlans = getFilteredPlans(allPlans || []);

  if (isLoadingPlans || isLoadingOrgs) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading admin dashboard...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-600">System-wide overview and management</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center px-4 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md disabled:opacity-50"
          >
            {isRefreshing ? <Loader className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh Data
          </button>
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
              { key: 'pending', label: 'Pending Reviews', icon: Clock, count: stats.pendingPlans },
              { key: 'reviewed', label: 'Reviewed Plans', icon: CheckCircle, count: stats.approvedPlans + stats.rejectedPlans },
              { key: 'analytics', label: 'Analytics', icon: TrendingUp },
              { key: 'organizations', label: 'Organizations', icon: Building2 },
              { key: 'users', label: 'Users', icon: Users }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.key
                    ? 'border-green-600 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ml-2 bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Plans</p>
                  <p className="text-3xl font-semibold text-gray-900">{stats.totalPlans}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <span className="text-green-600">+{stats.recentSubmissions}</span> this week
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Pending Reviews</p>
                  <p className="text-3xl font-semibold text-yellow-600">{stats.pendingPlans}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
              <div className="mt-2 text-sm text-gray-600">
                Awaiting evaluation
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Approved Plans</p>
                  <p className="text-3xl font-semibold text-green-600">{stats.approvedPlans}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <div className="mt-2 text-sm text-gray-600">
                {stats.totalPlans > 0 ? Math.round((stats.approvedPlans / stats.totalPlans) * 100) : 0}% approval rate
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Budget</p>
                  <p className="text-3xl font-semibold text-blue-600">{formatCurrency(stats.totalBudget)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-blue-500" />
              </div>
              <div className="mt-2 text-sm text-gray-600">
                Avg: {formatCurrency(stats.avgPlanValue)}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Status Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Distribution</h3>
              <div className="h-64">
                <Doughnut data={planStatusData} options={chartOptions} />
              </div>
            </div>

            {/* Budget Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget & Funding Distribution</h3>
              <div className="h-64">
                <Doughnut data={budgetDistributionData} options={chartOptions} />
              </div>
            </div>
          </div>

          {/* Monthly Trends */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Submission Trends</h3>
            <div className="h-80">
              <Line 
                data={getMonthlyTrends()} 
                options={{
                  ...chartOptions,
                  scales: {
                    y: {
                      type: 'linear',
                      display: true,
                      position: 'left',
                    },
                    y1: {
                      type: 'linear',
                      display: true,
                      position: 'right',
                      grid: {
                        drawOnChartArea: false,
                      },
                    },
                  }
                }} 
              />
            </div>
          </div>

          {/* Organization Performance */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Organizations by Plan Activity</h3>
            <div className="h-80">
              <Bar data={getOrganizationPerformance()} options={chartOptions} />
            </div>
          </div>
        </div>
      )}

      {/* Pending Reviews Tab */}
      {activeTab === 'pending' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by planner or organization..."
                    className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="date">Submission Date</option>
                  <option value="organization">Organization</option>
                  <option value="status">Status</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="flex items-center justify-center w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  {sortOrder === 'asc' ? <ArrowUp className="h-4 w-4 mr-1" /> : <ArrowDown className="h-4 w-4 mr-1" />}
                  {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actions</label>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setDateRange({ from: '', to: '' });
                  }}
                  className="w-full px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Pending Plans Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Pending Reviews ({pendingPlans.length})
              </h3>
            </div>
            
            {pendingPlans.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No pending reviews</h3>
                <p className="text-gray-500">All submitted plans have been reviewed.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planner
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submitted Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Budget
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pendingPlans.map((plan: any) => {
                      const planBudget = calculatePlanBudget(plan);
                      return (
                        <tr key={plan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">
                                {getOrganizationName(plan)}
                              </span>
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
                            {formatCurrency(planBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(plan.status)}`}>
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
        <div className="space-y-6">
          {/* Filters (same as pending) */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by planner or organization..."
                    className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="all">All Status</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="date">Review Date</option>
                  <option value="organization">Organization</option>
                  <option value="status">Status</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <div className="flex space-x-2">
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Reviewed Plans Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Reviewed Plans ({reviewedPlans.length})
              </h3>
            </div>
            
            {reviewedPlans.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No reviewed plans</h3>
                <p className="text-gray-500">No plans have been reviewed yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planner
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plan Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Budget Analysis
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Review Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reviewedPlans.map((plan: any) => {
                      const planBudget = calculatePlanBudget(plan);
                      const budgetDetails = calculateBudgetTotals([plan]);
                      const fundingCoverage = planBudget > 0 ? (budgetDetails.totalFunding / planBudget) * 100 : 0;
                      
                      return (
                        <tr key={plan.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">
                                {getOrganizationName(plan)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.planner_name || 'Unknown'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.type}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm">
                              <div className="font-medium text-gray-900">{formatCurrency(planBudget)}</div>
                              <div className="text-xs text-gray-500">
                                {fundingCoverage.toFixed(1)}% funded
                              </div>
                              {budgetDetails.fundingGap > 0 && (
                                <div className="text-xs text-red-600">
                                  Gap: {formatCurrency(budgetDetails.fundingGap)}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(plan.status)}`}>
                              {plan.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {plan.reviews && plan.reviews.length > 0 ? 
                              formatDate(plan.reviews[plan.reviews.length - 1].reviewed_at) : 
                              formatDate(plan.updated_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleViewPlan(plan)}
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
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget Analysis</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Required:</span>
                  <span className="font-medium">{formatCurrency(stats.totalBudget)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Available:</span>
                  <span className="font-medium text-green-600">{formatCurrency(stats.totalFunding)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Funding Gap:</span>
                  <span className="font-medium text-red-600">{formatCurrency(stats.fundingGap)}</span>
                </div>
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700">Coverage:</span>
                    <span className="font-bold text-blue-600">
                      {stats.totalBudget > 0 ? ((stats.totalFunding / stats.totalBudget) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Performance</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Approval Rate:</span>
                  <span className="font-medium text-green-600">
                    {stats.totalPlans > 0 ? ((stats.approvedPlans / stats.totalPlans) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Rejection Rate:</span>
                  <span className="font-medium text-red-600">
                    {stats.totalPlans > 0 ? ((stats.rejectedPlans / stats.totalPlans) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Pending Rate:</span>
                  <span className="font-medium text-yellow-600">
                    {stats.totalPlans > 0 ? ((stats.pendingPlans / stats.totalPlans) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">System Activity</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Active Organizations:</span>
                  <span className="font-medium">{stats.organizationsWithPlans}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Avg Plan Value:</span>
                  <span className="font-medium">{formatCurrency(stats.avgPlanValue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Recent Submissions:</span>
                  <span className="font-medium text-blue-600">{stats.recentSubmissions}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Submission & Budget Trends</h3>
              <div className="h-80">
                <Line 
                  data={getMonthlyTrends()} 
                  options={{
                    ...chartOptions,
                    scales: {
                      y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                          display: true,
                          text: 'Number of Plans'
                        }
                      },
                      y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                          display: true,
                          text: 'Budget (Thousands)'
                        },
                        grid: {
                          drawOnChartArea: false,
                        },
                      },
                    }
                  }} 
                />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Organization Performance</h3>
              <div className="h-80">
                <Bar data={getOrganizationPerformance()} options={chartOptions} />
              </div>
            </div>
          </div>

          {/* Budget Breakdown Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Detailed Budget Breakdown</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Funding Source
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Percentage
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Plans Count
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {[
                    { name: 'Government Treasury', amount: calculateBudgetTotals(allPlans || []).governmentTotal, color: 'text-blue-600' },
                    { name: 'Partners Funding', amount: calculateBudgetTotals(allPlans || []).partnersTotal, color: 'text-purple-600' },
                    { name: 'SDG Funding', amount: calculateBudgetTotals(allPlans || []).sdgTotal, color: 'text-green-600' },
                    { name: 'Other Funding', amount: calculateBudgetTotals(allPlans || []).otherTotal, color: 'text-orange-600' },
                    { name: 'Funding Gap', amount: calculateBudgetTotals(allPlans || []).fundingGap, color: 'text-red-600' }
                  ].map((item, index) => {
                    const percentage = stats.totalBudget > 0 ? (item.amount / stats.totalBudget) * 100 : 0;
                    const plansWithThisFunding = allPlans?.filter(plan => {
                      const budgetDetails = calculateBudgetTotals([plan]);
                      switch (item.name) {
                        case 'Government Treasury': return budgetDetails.governmentTotal > 0;
                        case 'Partners Funding': return budgetDetails.partnersTotal > 0;
                        case 'SDG Funding': return budgetDetails.sdgTotal > 0;
                        case 'Other Funding': return budgetDetails.otherTotal > 0;
                        case 'Funding Gap': return budgetDetails.fundingGap > 0;
                        default: return false;
                      }
                    }).length || 0;

                    return (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.name}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${item.color}`}>
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {percentage.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                          {plansWithThisFunding}
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

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Organizations Overview</h3>
            </div>
            
            {!allOrganizations || allOrganizations.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No organizations</h3>
                <p className="text-gray-500">No organizations have been created yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Parent
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plans Count
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Budget
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Users
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allOrganizations.map((org: any) => {
                      const orgPlans = allPlans?.filter(p => p.organization === org.id) || [];
                      const orgBudget = orgPlans.reduce((sum, plan) => sum + calculatePlanBudget(plan), 0);
                      
                      return (
                        <tr key={org.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">{org.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {org.type.replace('_', ' ')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {org.parent_name || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {orgPlans.length}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(orgBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {org.users?.length || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(org.created_at)}
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

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">System Users Overview</h3>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {allOrganizations?.reduce((sum: number, org: any) => 
                      sum + (org.users?.filter((u: any) => u.role === 'ADMIN').length || 0), 0) || 0}
                  </div>
                  <div className="text-sm text-gray-500">Admins</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {allOrganizations?.reduce((sum: number, org: any) => 
                      sum + (org.users?.filter((u: any) => u.role === 'PLANNER').length || 0), 0) || 0}
                  </div>
                  <div className="text-sm text-gray-500">Planners</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {allOrganizations?.reduce((sum: number, org: any) => 
                      sum + (org.users?.filter((u: any) => u.role === 'EVALUATOR').length || 0), 0) || 0}
                  </div>
                  <div className="text-sm text-gray-500">Evaluators</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">
                    {allOrganizations?.reduce((sum: number, org: any) => 
                      sum + (org.users?.length || 0), 0) || 0}
                  </div>
                  <div className="text-sm text-gray-500">Total Users</div>
                </div>
              </div>

              {/* Users by Organization Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Admins
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Planners
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Evaluators
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Users
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plans Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allOrganizations?.map((org: any) => {
                      const orgUsers = org.users || [];
                      const adminCount = orgUsers.filter((u: any) => u.role === 'ADMIN').length;
                      const plannerCount = orgUsers.filter((u: any) => u.role === 'PLANNER').length;
                      const evaluatorCount = orgUsers.filter((u: any) => u.role === 'EVALUATOR').length;
                      const orgPlansCount = allPlans?.filter(p => p.organization === org.id).length || 0;
                      
                      return (
                        <tr key={org.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">{org.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {adminCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {plannerCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {evaluatorCount}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {orgUsers.length}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {orgPlansCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
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
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Review Decision
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => reviewPlanMutation.mutate({
                      planId: selectedPlan.id,
                      status: 'APPROVED',
                      feedback: 'Approved by admin'
                    })}
                    disabled={reviewPlanMutation.isPending}
                    className="flex items-center justify-center p-4 border-2 border-green-200 rounded-lg hover:border-green-500 text-green-600 disabled:opacity-50"
                  >
                    <CheckCircle className="h-5 w-5 mr-2" />
                    <div>
                      <p className="font-medium">Approve</p>
                      <p className="text-sm">Accept the plan</p>
                    </div>
                  </button>

                  <button
                    onClick={() => reviewPlanMutation.mutate({
                      planId: selectedPlan.id,
                      status: 'REJECTED',
                      feedback: 'Rejected by admin - requires revision'
                    })}
                    disabled={reviewPlanMutation.isPending}
                    className="flex items-center justify-center p-4 border-2 border-red-200 rounded-lg hover:border-red-500 text-red-600 disabled:opacity-50"
                  >
                    <XCircle className="h-5 w-5 mr-2" />
                    <div>
                      <p className="font-medium">Reject</p>
                      <p className="text-sm">Request changes</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    setSelectedPlan(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;