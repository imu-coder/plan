import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, BarChart3, PieChart, TrendingUp, Users, Building2, 
  CheckCircle, XCircle, Clock, AlertCircle, Loader, RefreshCw, 
  DollarSign, Activity, FileText, Calendar, Eye, Filter,
  ChevronLeft, ChevronRight, Search, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
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
  
  // Filtering and pagination state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [organizationFilter, setOrganizationFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortField, setSortField] = useState<string>('submitted_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [budgetActivityPage, setBudgetActivityPage] = useState(1);
  const [executivePage, setExecutivePage] = useState(1);
  const itemsPerPage = 10;

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

  // Fetch organizations data
  const { data: organizationsData } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      try {
        const response = await organizations.getAll();
        return response || [];
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // Create organizations mapping
  useEffect(() => {
    if (organizationsData && Array.isArray(organizationsData)) {
      const orgMap: Record<string, string> = {};
      organizationsData.forEach((org: any) => {
        if (org && org.id) {
          orgMap[String(org.id)] = org.name;
        }
      });
      setOrganizationsMap(orgMap);
    }
  }, [organizationsData]);

  // Fetch all plans data
  const { data: allPlansData, isLoading, refetch } = useQuery({
    queryKey: ['plans', 'admin-all'],
    queryFn: async () => {
      try {
        const response = await plans.getAll();
        const plansData = response?.data || [];
        
        // Map organization names
        if (Array.isArray(plansData)) {
          plansData.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return { data: plansData };
      } catch (error) {
        console.error('Error fetching all plans:', error);
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: 2,
    refetchInterval: 30000,
  });

  // Calculate budget totals using SubActivity model
  const calculateBudgetTotals = (plansData: any[]) => {
    let totalBudget = 0;
    let totalGovernment = 0;
    let totalSDG = 0;
    let totalPartners = 0;
    let totalOther = 0;
    let activityTypeBudgets: Record<string, { count: number; budget: number }> = {
      'Training': { count: 0, budget: 0 },
      'Meeting': { count: 0, budget: 0 },
      'Workshop': { count: 0, budget: 0 },
      'Supervision': { count: 0, budget: 0 },
      'Procurement': { count: 0, budget: 0 },
      'Printing': { count: 0, budget: 0 },
      'Other': { count: 0, budget: 0 }
    };

    plansData.forEach((plan: any) => {
      if (!plan.objectives) return;

      plan.objectives.forEach((objective: any) => {
        objective.initiatives?.forEach((initiative: any) => {
          initiative.main_activities?.forEach((activity: any) => {
            // Calculate budget from sub-activities (new model)
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                const subGov = Number(subActivity.government_treasury || 0);
                const subPartners = Number(subActivity.partners_funding || 0);
                const subSdg = Number(subActivity.sdg_funding || 0);
                const subOther = Number(subActivity.other_funding || 0);
                
                totalBudget += subCost;
                totalGovernment += subGov;
                totalPartners += subPartners;
                totalSDG += subSdg;
                totalOther += subOther;

                // Count by activity type
                const activityType = subActivity.activity_type || 'Other';
                if (activityTypeBudgets[activityType]) {
                  activityTypeBudgets[activityType].count += 1;
                  activityTypeBudgets[activityType].budget += subCost;
                }
              });
            } else if (activity.budget) {
              // Fallback to legacy budget
              const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);
              
              totalBudget += cost;
              totalGovernment += Number(activity.budget.government_treasury || 0);
              totalPartners += Number(activity.budget.partners_funding || 0);
              totalSDG += Number(activity.budget.sdg_funding || 0);
              totalOther += Number(activity.budget.other_funding || 0);

              // Count by activity type
              const activityType = activity.budget.activity_type || 'Other';
              if (activityTypeBudgets[activityType]) {
                activityTypeBudgets[activityType].count += 1;
                activityTypeBudgets[activityType].budget += cost;
              }
            }
          });
        });
      });
    });

    const totalAvailable = totalGovernment + totalSDG + totalPartners + totalOther;
    const fundingGap = Math.max(0, totalBudget - totalAvailable);

    return {
      totalBudget,
      totalAvailable,
      fundingGap,
      totalGovernment,
      totalSDG,
      totalPartners,
      totalOther,
      activityTypeBudgets
    };
  };

  // Get organization name with multiple fallbacks
  const getOrganizationName = (plan: any) => {
    if (plan.organizationName) return plan.organizationName;
    if (plan.organization_name) return plan.organization_name;
    if (plan.organization && organizationsMap[String(plan.organization)]) {
      return organizationsMap[String(plan.organization)];
    }
    return 'Unknown Organization';
  };

  // Calculate statistics
  const allPlans = allPlansData?.data || [];
  const submittedPlans = allPlans.filter(p => p.status === 'SUBMITTED');
  const approvedPlans = allPlans.filter(p => p.status === 'APPROVED');
  const rejectedPlans = allPlans.filter(p => p.status === 'REJECTED');
  const totalPlansCount = submittedPlans.length + approvedPlans.length;
  
  const budgetTotals = calculateBudgetTotals(allPlans);

  // Prepare budget by activity type data for the new table
  const prepareBudgetByActivityData = () => {
    const orgActivityData: Record<string, Record<string, { count: number; budget: number }>> = {};
    
    allPlans.forEach((plan: any) => {
      const orgName = getOrganizationName(plan);
      
      if (!orgActivityData[orgName]) {
        orgActivityData[orgName] = {
          'Training': { count: 0, budget: 0 },
          'Meeting': { count: 0, budget: 0 },
          'Workshop': { count: 0, budget: 0 },
          'Procurement': { count: 0, budget: 0 },
          'Printing': { count: 0, budget: 0 },
          'Other': { count: 0, budget: 0 }
        };
      }

      plan.objectives?.forEach((objective: any) => {
        objective.initiatives?.forEach((initiative: any) => {
          initiative.main_activities?.forEach((activity: any) => {
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                const activityType = subActivity.activity_type || 'Other';
                const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                if (orgActivityData[orgName][activityType]) {
                  orgActivityData[orgName][activityType].count += 1;
                  orgActivityData[orgName][activityType].budget += cost;
                }
              });
            } else if (activity.budget) {
              const activityType = activity.budget.activity_type || 'Other';
              const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);
              
              if (orgActivityData[orgName][activityType]) {
                orgActivityData[orgName][activityType].count += 1;
                orgActivityData[orgName][activityType].budget += cost;
              }
            }
          });
        });
      });
    });

    return Object.entries(orgActivityData).map(([orgName, activities]) => {
      const totalCount = Object.values(activities).reduce((sum, act) => sum + act.count, 0);
      const totalBudget = Object.values(activities).reduce((sum, act) => sum + act.budget, 0);
      
      return {
        organization: orgName,
        training: activities.Training.count,
        meeting: activities.Meeting.count,
        workshop: activities.Workshop.count,
        procurement: activities.Procurement.count,
        printing: activities.Printing.count,
        other: activities.Other.count,
        totalCount,
        totalBudget
      };
    });
  };

  // Prepare executive performance data
  const prepareExecutivePerformanceData = () => {
    const orgPerformance: Record<string, any> = {};
    
    allPlans.forEach((plan: any) => {
      const orgName = getOrganizationName(plan);
      
      if (!orgPerformance[orgName]) {
        orgPerformance[orgName] = {
          organization: orgName,
          totalPlans: 0,
          approved: 0,
          submitted: 0,
          rejected: 0,
          totalBudget: 0,
          availableFunding: 0,
          governmentBudget: 0,
          sdgBudget: 0,
          partnersBudget: 0,
          fundingGap: 0
        };
      }

      orgPerformance[orgName].totalPlans += 1;
      
      if (plan.status === 'APPROVED') orgPerformance[orgName].approved += 1;
      if (plan.status === 'SUBMITTED') orgPerformance[orgName].submitted += 1;
      if (plan.status === 'REJECTED') orgPerformance[orgName].rejected += 1;

      // Calculate budget from SubActivity model
      plan.objectives?.forEach((objective: any) => {
        objective.initiatives?.forEach((initiative: any) => {
          initiative.main_activities?.forEach((activity: any) => {
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                const cost = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                const gov = Number(subActivity.government_treasury || 0);
                const partners = Number(subActivity.partners_funding || 0);
                const sdg = Number(subActivity.sdg_funding || 0);
                const other = Number(subActivity.other_funding || 0);
                
                orgPerformance[orgName].totalBudget += cost;
                orgPerformance[orgName].governmentBudget += gov;
                orgPerformance[orgName].partnersBudget += partners;
                orgPerformance[orgName].sdgBudget += sdg;
                orgPerformance[orgName].availableFunding += (gov + partners + sdg + other);
              });
            } else if (activity.budget) {
              // Fallback to legacy budget
              const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);
              
              orgPerformance[orgName].totalBudget += cost;
              orgPerformance[orgName].governmentBudget += Number(activity.budget.government_treasury || 0);
              orgPerformance[orgName].partnersBudget += Number(activity.budget.partners_funding || 0);
              orgPerformance[orgName].sdgBudget += Number(activity.budget.sdg_funding || 0);
              orgPerformance[orgName].availableFunding += Number(activity.budget.government_treasury || 0) + 
                                                          Number(activity.budget.partners_funding || 0) + 
                                                          Number(activity.budget.sdg_funding || 0) + 
                                                          Number(activity.budget.other_funding || 0);
            }
          });
        });
      });

      orgPerformance[orgName].fundingGap = Math.max(0, 
        orgPerformance[orgName].totalBudget - orgPerformance[orgName].availableFunding
      );
    });

    return Object.values(orgPerformance);
  };

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: async (reviewData: { planId: string, status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      try {
        await auth.getCurrentUser();
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

  // Handle plan review
  const handleReviewPlan = (plan: any) => {
    setSelectedPlan(plan);
    setShowReviewModal(true);
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
      console.error('Failed to submit review:', error);
    }
  };

  // Format date helper
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  // Handle refresh
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

  // Filter and sort plans
  const getFilteredPlans = () => {
    let filtered = allPlans;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(plan => plan.status === statusFilter);
    }

    // Organization filter
    if (organizationFilter !== 'all') {
      filtered = filtered.filter(plan => String(plan.organization) === organizationFilter);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(plan => 
        plan.planner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getOrganizationName(plan).toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortField) {
        case 'submitted_at':
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

  // Pagination helpers
  const getPaginatedData = (data: any[], page: number) => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (dataLength: number) => {
    return Math.ceil(dataLength / itemsPerPage);
  };

  // Chart data preparation
  const planStatusData = {
    labels: ['Submitted', 'Approved', 'Rejected'],
    datasets: [{
      data: [submittedPlans.length, approvedPlans.length, rejectedPlans.length],
      backgroundColor: ['#fbbf24', '#10b981', '#ef4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const budgetDistributionData = {
    labels: ['Government', 'SDG', 'Partners', 'Other', 'Gap'],
    datasets: [{
      data: [
        budgetTotals.totalGovernment,
        budgetTotals.totalSDG,
        budgetTotals.totalPartners,
        budgetTotals.totalOther,
        budgetTotals.fundingGap
      ],
      backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  // Monthly trends data
  const monthlyTrendsData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    datasets: [
      {
        label: 'Plans Submitted',
        data: Array(12).fill(0).map((_, index) => {
          return allPlans.filter(plan => {
            if (!plan.submitted_at) return false;
            const month = new Date(plan.submitted_at).getMonth();
            return month === index;
          }).length;
        }),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        yAxisID: 'y'
      },
      {
        label: 'Budget (Millions)',
        data: Array(12).fill(0).map((_, index) => {
          const monthPlans = allPlans.filter(plan => {
            if (!plan.submitted_at) return false;
            const month = new Date(plan.submitted_at).getMonth();
            return month === index;
          });
          
          const monthBudget = calculateBudgetTotals(monthPlans).totalBudget;
          return monthBudget / 1000000; // Convert to millions
        }),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        yAxisID: 'y1'
      }
    ]
  };

  // Top organizations data
  const topOrganizationsData = {
    labels: Object.keys(organizationsMap).slice(0, 10).map(id => organizationsMap[id]),
    datasets: [{
      label: 'Number of Plans',
      data: Object.keys(organizationsMap).slice(0, 10).map(orgId => {
        return allPlans.filter(plan => String(plan.organization) === orgId).length;
      }),
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 1
    }]
  };

  // Complete Budget Overview Chart Data (for 30-50 organizations)
  const budgetOverviewChartData = {
    labels: Object.values(organizationsMap).slice(0, 50),
    datasets: [
      {
        label: 'Total Budget',
        data: Object.keys(organizationsMap).slice(0, 50).map(orgId => {
          const orgPlans = allPlans.filter(plan => String(plan.organization) === orgId);
          return calculateBudgetTotals(orgPlans).totalBudget;
        }),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      },
      {
        label: 'Available Funding',
        data: Object.keys(organizationsMap).slice(0, 50).map(orgId => {
          const orgPlans = allPlans.filter(plan => String(plan.organization) === orgId);
          return calculateBudgetTotals(orgPlans).totalAvailable;
        }),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1
      },
      {
        label: 'Funding Gap',
        data: Object.keys(organizationsMap).slice(0, 50).map(orgId => {
          const orgPlans = allPlans.filter(plan => String(plan.organization) === orgId);
          return calculateBudgetTotals(orgPlans).fundingGap;
        }),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1
      }
    ]
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading admin dashboard...</span>
      </div>
    );
  }

  const budgetActivityData = prepareBudgetByActivityData();
  const executivePerformanceData = prepareExecutivePerformanceData();
  const filteredPlans = getFilteredPlans();
  const paginatedPlans = getPaginatedData(filteredPlans, currentPage);
  const paginatedBudgetActivity = getPaginatedData(budgetActivityData, budgetActivityPage);
  const paginatedExecutivePerformance = getPaginatedData(executivePerformanceData, executivePage);

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Beautiful Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-green-600 rounded-lg shadow-lg mb-8 overflow-hidden">
        <div className="px-8 py-12 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center mb-4">
                <Shield className="h-12 w-12 mr-4 text-white drop-shadow-lg" />
                <div>
                  <h1 className="text-4xl font-bold drop-shadow-md">Admin Dashboard</h1>
                  <p className="text-xl opacity-90 mt-2">Ministry of Health - Comprehensive Planning System</p>
                </div>
              </div>
              <p className="text-lg opacity-80 max-w-2xl">
                Monitor and manage strategic planning activities across all organizational levels. 
                Track plan submissions, review processes, budget allocations, and system-wide performance metrics.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{totalPlansCount}</div>
              <div className="text-sm opacity-80">Total Plans</div>
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
              { key: 'budget-activity', label: 'Budget by Activity', icon: DollarSign },
              { key: 'analytics', label: 'Analytics', icon: PieChart },
              { key: 'executive-performance', label: 'Executive Performance', icon: TrendingUp }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                    activeTab === tab.key
                      ? 'border-green-600 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Plan Statistics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Plans</p>
                  <p className="text-3xl font-bold">{totalPlansCount}</p>
                  <p className="text-blue-100 text-xs mt-1">Submitted + Approved</p>
                </div>
                <FileText className="h-12 w-12 text-blue-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm font-medium">Pending Review</p>
                  <p className="text-3xl font-bold">{submittedPlans.length}</p>
                  <p className="text-amber-100 text-xs mt-1">Awaiting evaluation</p>
                </div>
                <Clock className="h-12 w-12 text-amber-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Approved</p>
                  <p className="text-3xl font-bold">{approvedPlans.length}</p>
                  <p className="text-green-100 text-xs mt-1">Successfully reviewed</p>
                </div>
                <CheckCircle className="h-12 w-12 text-green-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Rejected</p>
                  <p className="text-3xl font-bold">{rejectedPlans.length}</p>
                  <p className="text-red-100 text-xs mt-1">Needs revision</p>
                </div>
                <XCircle className="h-12 w-12 text-red-200" />
              </div>
            </div>
          </div>

          {/* Budget Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm font-medium">Total Budget</p>
                  <p className="text-2xl font-bold">${budgetTotals.totalBudget.toLocaleString()}</p>
                  <p className="text-indigo-100 text-xs mt-1">All LEO/EO Plans</p>
                </div>
                <DollarSign className="h-10 w-10 text-indigo-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Available Funding</p>
                  <p className="text-2xl font-bold">${budgetTotals.totalAvailable.toLocaleString()}</p>
                  <p className="text-emerald-100 text-xs mt-1">All sources combined</p>
                </div>
                <CheckCircle className="h-10 w-10 text-emerald-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-rose-100 text-sm font-medium">Funding Gap</p>
                  <p className="text-2xl font-bold">${budgetTotals.fundingGap.toLocaleString()}</p>
                  <p className="text-rose-100 text-xs mt-1">Additional needed</p>
                </div>
                <AlertCircle className="h-10 w-10 text-rose-200" />
              </div>
            </div>
          </div>

          {/* Budget by Activity Type Cards */}
          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-6">Budget by Activity Type</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              {Object.entries(budgetTotals.activityTypeBudgets).map(([type, data], index) => {
                const colors = [
                  'from-blue-500 to-blue-600',
                  'from-green-500 to-green-600', 
                  'from-purple-500 to-purple-600',
                  'from-orange-500 to-orange-600',
                  'from-pink-500 to-pink-600',
                  'from-indigo-500 to-indigo-600',
                  'from-gray-500 to-gray-600'
                ];
                
                return (
                  <div key={type} className={`bg-gradient-to-br ${colors[index]} p-4 rounded-lg shadow-md text-white`}>
                    <div className="text-center">
                      <Activity className="h-8 w-8 mx-auto mb-2 text-white opacity-80" />
                      <p className="text-sm font-medium opacity-90">{type}</p>
                      <p className="text-xl font-bold">{data.count}</p>
                      <p className="text-xs opacity-75">${data.budget.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Distribution</h3>
              <div className="h-64">
                <Doughnut data={planStatusData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget & Funding Distribution</h3>
              <div className="h-64">
                <Doughnut data={budgetDistributionData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>
          </div>

          {/* Monthly Trends */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Submission Trends</h3>
            <div className="h-80">
              <Line 
                data={monthlyTrendsData} 
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      type: 'linear',
                      display: true,
                      position: 'left',
                      title: { display: true, text: 'Number of Plans' }
                    },
                    y1: {
                      type: 'linear',
                      display: true,
                      position: 'right',
                      title: { display: true, text: 'Budget (Millions)' },
                      grid: { drawOnChartArea: false }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Top Organizations */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Organizations by Plan Activity</h3>
            <div className="h-80">
              <Bar 
                data={topOrganizationsData} 
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: { display: true, text: 'Number of Plans' }
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

            {submittedPlans.length === 0 ? (
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {submittedPlans.map((plan: any) => {
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
                            {formatDate(plan.submitted_at)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${planBudget.totalBudget.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleReviewPlan(plan)}
                              className="text-green-600 hover:text-green-900 flex items-center"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Review
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

      {/* Budget by Activity Tab */}
      {activeTab === 'budget-activity' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Budget by Activity Type</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization Name</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Training</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Meeting</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Workshop</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Procurement</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Printing</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Other</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Count</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Budget</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedBudgetActivity.map((row: any, index: number) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{row.organization}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {row.training}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {row.meeting}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {row.workshop}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          {row.procurement}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                          {row.printing}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {row.other}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-sm font-bold text-gray-900">{row.totalCount}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-sm font-bold text-green-600">${row.totalBudget.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination for Budget Activity */}
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-700">
                Showing {((budgetActivityPage - 1) * itemsPerPage) + 1} to {Math.min(budgetActivityPage * itemsPerPage, budgetActivityData.length)} of {budgetActivityData.length} organizations
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setBudgetActivityPage(Math.max(1, budgetActivityPage - 1))}
                  disabled={budgetActivityPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {budgetActivityPage} of {getTotalPages(budgetActivityData.length)}
                </span>
                <button
                  onClick={() => setBudgetActivityPage(Math.min(getTotalPages(budgetActivityData.length), budgetActivityPage + 1))}
                  disabled={budgetActivityPage === getTotalPages(budgetActivityData.length)}
                  className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reviewed Plans Tab */}
      {activeTab === 'reviewed' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Reviewed Plans</h3>
              
              {/* Filters */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Filter className="h-4 w-4 text-gray-400" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-3 py-1"
                  >
                    <option value="all">All Status</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
                
                <select
                  value={organizationFilter}
                  onChange={(e) => setOrganizationFilter(e.target.value)}
                  className="text-sm border border-gray-300 rounded-md px-3 py-1"
                >
                  <option value="all">All Organizations</option>
                  {Object.entries(organizationsMap).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search planner..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-1 text-sm border border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
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
                          sortOrder === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Planner</th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        if (sortField === 'submitted_at') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortField('submitted_at');
                          setSortOrder('desc');
                        }
                      }}
                    >
                      <div className="flex items-center">
                        Date
                        {sortField === 'submitted_at' && (
                          sortOrder === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
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
                          sortOrder === 'asc' ? <ArrowUp className="h-4 w-4 ml-1" /> : <ArrowDown className="h-4 w-4 ml-1" />
                        )}
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget Analysis</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedPlans.map((plan: any) => {
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
                          {plan.planner_name || 'Unknown Planner'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(plan.submitted_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="space-y-1">
                            <div>Budget: ${planBudget.totalBudget.toLocaleString()}</div>
                            <div>Funding: ${planBudget.totalAvailable.toLocaleString()} ({fundingCoverage}%)</div>
                            {planBudget.fundingGap > 0 && (
                              <div className="text-red-600">Gap: ${planBudget.fundingGap.toLocaleString()}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => navigate(`/plans/${plan.id}`)}
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

            {/* Pagination for Reviewed Plans */}
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-700">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredPlans.length)} of {filteredPlans.length} plans
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {currentPage} of {getTotalPages(filteredPlans.length)}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(getTotalPages(filteredPlans.length), currentPage + 1))}
                  disabled={currentPage === getTotalPages(filteredPlans.length)}
                  className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          {/* Complete Budget Overview by Executives - Colorful Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Complete Budget Overview by Executives</h3>
            <div className="h-96">
              <Bar 
                data={budgetOverviewChartData}
                options={{
                  maintainAspectRatio: false,
                  responsive: true,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                    title: {
                      display: true,
                      text: 'Budget Analysis by Organization (Capable of 30-50 Organizations)'
                    }
                  },
                  scales: {
                    x: {
                      ticks: {
                        maxRotation: 45,
                        minRotation: 45
                      }
                    },
                    y: {
                      beginAtZero: true,
                      title: {
                        display: true,
                        text: 'Amount ($)'
                      }
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Other Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Plan Status Distribution</h3>
              <div className="h-64">
                <Doughnut data={planStatusData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Budget & Funding Distribution</h3>
              <div className="h-64">
                <Doughnut data={budgetDistributionData} options={{ maintainAspectRatio: false }} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Monthly Submission Trends</h3>
            <div className="h-80">
              <Line 
                data={monthlyTrendsData} 
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      type: 'linear',
                      display: true,
                      position: 'left',
                      title: { display: true, text: 'Number of Plans' }
                    },
                    y1: {
                      type: 'linear',
                      display: true,
                      position: 'right',
                      title: { display: true, text: 'Budget (Millions)' },
                      grid: { drawOnChartArea: false }
                    }
                  }
                }}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Top Organizations by Plan Activity</h3>
            <div className="h-80">
              <Bar 
                data={topOrganizationsData} 
                options={{
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      beginAtZero: true,
                      title: { display: true, text: 'Number of Plans' }
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Executive Performance Tab */}
      {activeTab === 'executive-performance' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Executive Performance Overview</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization Name</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Plans</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Total Budget</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Available Funding</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Government Budget</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">SDG Budget</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Partners Budget</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Funding Gap</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedExecutivePerformance.map((row: any, index: number) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                          <span className="text-sm font-medium text-gray-900">{row.organization}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">{row.totalPlans}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {row.approved}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {row.submitted}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                        ${row.totalBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-green-600">
                        ${row.availableFunding.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-blue-600">
                        ${row.governmentBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-purple-600">
                        ${row.sdgBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-orange-600">
                        ${row.partnersBudget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                        {row.fundingGap > 0 ? (
                          <span className="text-red-600">${row.fundingGap.toLocaleString()}</span>
                        ) : (
                          <span className="text-green-600">Fully Funded</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination for Executive Performance */}
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-gray-700">
                Showing {((executivePage - 1) * itemsPerPage) + 1} to {Math.min(executivePage * itemsPerPage, executivePerformanceData.length)} of {executivePerformanceData.length} organizations
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setExecutivePage(Math.max(1, executivePage - 1))}
                  disabled={executivePage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-1 text-sm text-gray-700">
                  Page {executivePage} of {getTotalPages(executivePerformanceData.length)}
                </span>
                <button
                  onClick={() => setExecutivePage(Math.min(getTotalPages(executivePerformanceData.length), executivePage + 1))}
                  disabled={executivePage === getTotalPages(executivePerformanceData.length)}
                  className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
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
              Review Plan: {getOrganizationName(selectedPlan)}
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