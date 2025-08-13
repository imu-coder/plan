import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Shield, Users, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, 
  Building2, DollarSign, TrendingUp, BarChart3, PieChart, Calendar,
  Eye, ClipboardCheck, Search, ChevronLeft, ChevronRight, Filter,
  Activity, Briefcase, GraduationCap, MessageSquare, Wrench, FileText, Package
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

const AdminDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'reviewed' | 'budget-activity' | 'analytics' | 'executive-performance'>('overview');
  const [reviewedFilter, setReviewedFilter] = useState('all');
  const [reviewedOrgFilter, setReviewedOrgFilter] = useState('all');
  const [reviewedSearch, setReviewedSearch] = useState('');
  const [reviewedSortBy, setReviewedSortBy] = useState<'date' | 'organization' | 'status'>('date');
  const [reviewedSortOrder, setReviewedSortOrder] = useState<'asc' | 'desc'>('desc');
  const [reviewedCurrentPage, setReviewedCurrentPage] = useState(1);
  const [budgetActivityCurrentPage, setBudgetActivityCurrentPage] = useState(1);
  const [executiveCurrentPage, setExecutiveCurrentPage] = useState(1);
  const reviewedItemsPerPage = 10;
  const budgetActivityItemsPerPage = 10;
  const executiveItemsPerPage = 10;

  // Check if user has admin permissions
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

  // Fetch all organizations to map IDs to names
  const { data: organizationsData } = useQuery({
    queryKey: ['organizations', 'admin'],
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

  // Fetch all plans for admin overview
  const { data: allPlans, isLoading, refetch } = useQuery({
    queryKey: ['plans', 'admin-all'],
    queryFn: async () => {
      try {
        const response = await api.get('/plans/');
        const plansData = response.data?.results || response.data || [];
        
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
        return { data: [] };
      }
    },
    enabled: !!organizationsMap && Object.keys(organizationsMap).length > 0,
    retry: 2
  });

  // Helper function to get organization name
  const getOrganizationName = (plan: any) => {
    if (plan.organizationName) return plan.organizationName;
    if (plan.organization_name) return plan.organization_name;
    if (plan.organization && organizationsMap[plan.organization]) {
      return organizationsMap[plan.organization];
    }
    return 'Unknown Organization';
  };

  // Helper function to calculate plan budget using SubActivity model
  const calculatePlanBudget = (plan: any) => {
    let total = 0;
    let government = 0;
    let partners = 0;
    let sdg = 0;
    let other = 0;

    try {
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  // Calculate budget from sub-activities if they exist
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      
                      total += subCost;
                      government += Number(subActivity.government_treasury || 0);
                      partners += Number(subActivity.partners_funding || 0);
                      sdg += Number(subActivity.sdg_funding || 0);
                      other += Number(subActivity.other_funding || 0);
                    });
                  } else if (activity.budget) {
                    // Fallback to legacy budget
                    const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    
                    total += cost;
                    government += Number(activity.budget.government_treasury || 0);
                    partners += Number(activity.budget.partners_funding || 0);
                    sdg += Number(activity.budget.sdg_funding || 0);
                    other += Number(activity.budget.other_funding || 0);
                  }
                });
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Error calculating plan budget:', error);
    }

    const totalFunding = government + partners + sdg + other;
    const gap = Math.max(0, total - totalFunding);

    return { total, government, partners, sdg, other, totalFunding, gap };
  };

  // Calculate summary statistics
  const reviewedPlansData = allPlans?.data || [];
  
  const totalPlans = reviewedPlansData.filter(plan => 
    ['SUBMITTED', 'APPROVED'].includes(plan.status)
  ).length;
  const pendingCount = reviewedPlansData.filter(plan => plan.status === 'SUBMITTED').length;
  const approvedCount = reviewedPlansData.filter(plan => plan.status === 'APPROVED').length;
  const rejectedCount = reviewedPlansData.filter(plan => plan.status === 'REJECTED').length;

  // Calculate budget totals using SubActivity model
  const calculateBudgetTotals = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    let totalBudget = 0;
    let totalFunding = 0;
    let governmentTotal = 0;
    let partnersTotal = 0;
    let sdgTotal = 0;
    let otherTotal = 0;

    submittedAndApprovedPlans.forEach((plan: any) => {
      const budget = calculatePlanBudget(plan);
      totalBudget += budget.total;
      totalFunding += budget.totalFunding;
      governmentTotal += budget.government;
      partnersTotal += budget.partners;
      sdgTotal += budget.sdg;
      otherTotal += budget.other;
    });

    const fundingGap = Math.max(0, totalBudget - totalFunding);

    return {
      totalBudget,
      totalFunding,
      fundingGap,
      governmentTotal,
      partnersTotal,
      sdgTotal,
      otherTotal
    };
  };

  const budgetTotals = calculateBudgetTotals();

  // Calculate budget data for charts
  const calculateBudgetData = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    let totalBudget = 0;
    let totalGovernment = 0;
    let totalPartners = 0;
    let totalSdg = 0;
    let totalOther = 0;

    submittedAndApprovedPlans.forEach((plan: any) => {
      const budget = calculatePlanBudget(plan);
      totalBudget += budget.total;
      totalGovernment += budget.government;
      totalPartners += budget.partners;
      totalSdg += budget.sdg;
      totalOther += budget.other;
    });

    return {
      totalBudget,
      totalGovernment,
      totalPartners,
      totalSdg,
      totalOther,
      fundingGap: Math.max(0, totalBudget - (totalGovernment + totalPartners + totalSdg + totalOther))
    };
  };

  // Calculate activity type budgets
  const calculateActivityTypeBudgets = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    const activityBudgets = {
      Training: { count: 0, budget: 0 },
      Meeting: { count: 0, budget: 0 },
      Workshop: { count: 0, budget: 0 },
      Supervision: { count: 0, budget: 0 },
      Procurement: { count: 0, budget: 0 },
      Printing: { count: 0, budget: 0 },
      Other: { count: 0, budget: 0 }
    };

    submittedAndApprovedPlans.forEach((plan: any) => {
      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  // Count sub-activities by type
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const activityType = subActivity.activity_type || 'Other';
                      if (activityBudgets[activityType]) {
                        activityBudgets[activityType].count++;
                        
                        const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(subActivity.estimated_cost_with_tool || 0)
                          : Number(subActivity.estimated_cost_without_tool || 0);
                        
                        activityBudgets[activityType].budget += subCost;
                      }
                    });
                  } else if (activity.budget && activity.budget.activity_type) {
                    // Fallback to legacy budget
                    const activityType = activity.budget.activity_type || 'Other';
                    if (activityBudgets[activityType]) {
                      activityBudgets[activityType].count++;
                      
                      const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                        ? Number(activity.budget.estimated_cost_with_tool || 0)
                        : Number(activity.budget.estimated_cost_without_tool || 0);
                      
                      activityBudgets[activityType].budget += cost;
                    }
                  }
                });
              }
            });
          }
        });
      }
    });

    return activityBudgets;
  };

  // Calculate monthly trends
  const calculateMonthlyTrends = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    const monthlyData: Record<string, { submissions: number; budget: number }> = {};

    submittedAndApprovedPlans.forEach((plan: any) => {
      if (plan.submitted_at) {
        const month = format(new Date(plan.submitted_at), 'MMM yyyy');
        if (!monthlyData[month]) {
          monthlyData[month] = { submissions: 0, budget: 0 };
        }
        monthlyData[month].submissions++;
        
        const budget = calculatePlanBudget(plan);
        monthlyData[month].budget += budget.total;
      }
    });

    const sortedMonths = Object.keys(monthlyData).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    return {
      labels: sortedMonths,
      submissions: sortedMonths.map(month => monthlyData[month].submissions),
      budgets: sortedMonths.map(month => monthlyData[month].budget)
    };
  };

  // Calculate organization performance for charts
  const calculateOrgPerformance = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    const orgData: Record<string, { plans: number; budget: number; name: string }> = {};

    submittedAndApprovedPlans.forEach((plan: any) => {
      const orgId = plan.organization;
      const orgName = getOrganizationName(plan);
      
      if (!orgData[orgId]) {
        orgData[orgId] = { plans: 0, budget: 0, name: orgName };
      }
      
      orgData[orgId].plans++;
      const budget = calculatePlanBudget(plan);
      orgData[orgId].budget += budget.total;
    });

    const sortedOrgs = Object.values(orgData)
      .sort((a, b) => b.plans - a.plans)
      .slice(0, 10);

    return {
      labels: sortedOrgs.map(org => org.name),
      plans: sortedOrgs.map(org => org.plans),
      budgets: sortedOrgs.map(org => org.budget)
    };
  };

  // Calculate budget by activity type for table
  const calculateBudgetByActivityTable = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    const orgActivityData: Record<string, {
      organizationName: string;
      Training: { count: number; budget: number };
      Meeting: { count: number; budget: number };
      Workshop: { count: number; budget: number };
      Procurement: { count: number; budget: number };
      Printing: { count: number; budget: number };
      Other: { count: number; budget: number };
      totalCount: number;
      totalBudget: number;
    }> = {};

    submittedAndApprovedPlans.forEach((plan: any) => {
      const orgId = plan.organization;
      const orgName = getOrganizationName(plan);
      
      if (!orgActivityData[orgId]) {
        orgActivityData[orgId] = {
          organizationName: orgName,
          Training: { count: 0, budget: 0 },
          Meeting: { count: 0, budget: 0 },
          Workshop: { count: 0, budget: 0 },
          Procurement: { count: 0, budget: 0 },
          Printing: { count: 0, budget: 0 },
          Other: { count: 0, budget: 0 },
          totalCount: 0,
          totalBudget: 0
        };
      }

      if (plan.objectives && Array.isArray(plan.objectives)) {
        plan.objectives.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  // Process sub-activities
                  if (activity.sub_activities && Array.isArray(activity.sub_activities)) {
                    activity.sub_activities.forEach((subActivity: any) => {
                      const activityType = subActivity.activity_type || 'Other';
                      if (orgActivityData[orgId][activityType]) {
                        orgActivityData[orgId][activityType].count++;
                        orgActivityData[orgId].totalCount++;
                        
                        const subCost = subActivity.budget_calculation_type === 'WITH_TOOL'
                          ? Number(subActivity.estimated_cost_with_tool || 0)
                          : Number(subActivity.estimated_cost_without_tool || 0);
                        
                        orgActivityData[orgId][activityType].budget += subCost;
                        orgActivityData[orgId].totalBudget += subCost;
                      }
                    });
                  } else if (activity.budget && activity.budget.activity_type) {
                    // Fallback to legacy budget
                    const activityType = activity.budget.activity_type || 'Other';
                    if (orgActivityData[orgId][activityType]) {
                      orgActivityData[orgId][activityType].count++;
                      orgActivityData[orgId].totalCount++;
                      
                      const cost = activity.budget.budget_calculation_type === 'WITH_TOOL'
                        ? Number(activity.budget.estimated_cost_with_tool || 0)
                        : Number(activity.budget.estimated_cost_without_tool || 0);
                      
                      orgActivityData[orgId][activityType].budget += cost;
                      orgActivityData[orgId].totalBudget += cost;
                    }
                  }
                });
              }
            });
          }
        });
      }
    });

    return Object.values(orgActivityData);
  };

  // Calculate executive performance data
  const calculateExecutivePerformance = () => {
    const submittedAndApprovedPlans = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    const executiveData: Record<string, {
      organizationName: string;
      totalPlans: number;
      approved: number;
      submitted: number;
      totalBudget: number;
      availableFunding: number;
      governmentBudget: number;
      sdgBudget: number;
      partnersBudget: number;
      fundingGap: number;
    }> = {};

    submittedAndApprovedPlans.forEach((plan: any) => {
      const orgId = plan.organization;
      const orgName = getOrganizationName(plan);
      
      if (!executiveData[orgId]) {
        executiveData[orgId] = {
          organizationName: orgName,
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

      executiveData[orgId].totalPlans++;
      
      if (plan.status === 'APPROVED') {
        executiveData[orgId].approved++;
      } else if (plan.status === 'SUBMITTED') {
        executiveData[orgId].submitted++;
      }

      const budget = calculatePlanBudget(plan);
      executiveData[orgId].totalBudget += budget.total;
      executiveData[orgId].availableFunding += budget.totalFunding;
      executiveData[orgId].governmentBudget += budget.government;
      executiveData[orgId].sdgBudget += budget.sdg;
      executiveData[orgId].partnersBudget += budget.partners;
      executiveData[orgId].fundingGap += budget.gap;
    });

    return Object.values(executiveData);
  };

  // Calculate complete budget overview for analytics (only organizations with submitted/approved plans)
  const calculateCompleteBudgetOverview = () => {
    const plansWithActivity = reviewedPlansData.filter(plan => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );
    
    const orgBudgetData: Record<string, {
      organizationName: string;
      totalBudget: number;
      funding: number;
    }> = {};

    plansWithActivity.forEach((plan: any) => {
      const orgId = plan.organization;
      const orgName = getOrganizationName(plan);
      
      if (!orgBudgetData[orgId]) {
        orgBudgetData[orgId] = {
          organizationName: orgName,
          totalBudget: 0,
          funding: 0
        };
      }

      const budget = calculatePlanBudget(plan);
      orgBudgetData[orgId].totalBudget += budget.total;
      orgBudgetData[orgId].funding += budget.totalFunding;
    });

    return Object.values(orgBudgetData).sort((a, b) => b.totalBudget - a.totalBudget);
  };

  // Get chart data
  const budgetData = calculateBudgetData();
  const activityBudgets = calculateActivityTypeBudgets();
  const monthlyTrends = calculateMonthlyTrends();
  const orgPerformance = calculateOrgPerformance();
  const budgetByActivityData = calculateBudgetByActivityTable();
  const executivePerformanceData = calculateExecutivePerformance();
  const completeBudgetOverview = calculateCompleteBudgetOverview();

  // Filter and sort reviewed plans
  const getFilteredReviewedPlans = () => {
    let filtered = reviewedPlansData.filter(plan => 
      ['APPROVED', 'REJECTED'].includes(plan.status)
    );

    // Apply status filter
    if (reviewedFilter !== 'all') {
      filtered = filtered.filter(plan => plan.status === reviewedFilter);
    }

    // Apply organization filter
    if (reviewedOrgFilter !== 'all') {
      filtered = filtered.filter(plan => plan.organization === reviewedOrgFilter);
    }

    // Apply search filter
    if (reviewedSearch) {
      filtered = filtered.filter(plan => 
        getOrganizationName(plan).toLowerCase().includes(reviewedSearch.toLowerCase()) ||
        (plan.planner_name && plan.planner_name.toLowerCase().includes(reviewedSearch.toLowerCase()))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (reviewedSortBy) {
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
      
      if (reviewedSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  };

  const filteredReviewedPlans = getFilteredReviewedPlans();

  // Pagination for reviewed plans
  const reviewedTotalPages = Math.ceil(filteredReviewedPlans.length / reviewedItemsPerPage);
  const reviewedStartIndex = (reviewedCurrentPage - 1) * reviewedItemsPerPage;
  const reviewedPaginatedPlans = filteredReviewedPlans.slice(
    reviewedStartIndex, 
    reviewedStartIndex + reviewedItemsPerPage
  );

  // Pagination for budget by activity
  const budgetActivityTotalPages = Math.ceil(budgetByActivityData.length / budgetActivityItemsPerPage);
  const budgetActivityStartIndex = (budgetActivityCurrentPage - 1) * budgetActivityItemsPerPage;
  const budgetActivityPaginatedData = budgetByActivityData.slice(
    budgetActivityStartIndex,
    budgetActivityStartIndex + budgetActivityItemsPerPage
  );

  // Pagination for executive performance
  const executiveTotalPages = Math.ceil(executivePerformanceData.length / executiveItemsPerPage);
  const executiveStartIndex = (executiveCurrentPage - 1) * executiveItemsPerPage;
  const executivePaginatedData = executivePerformanceData.slice(
    executiveStartIndex,
    executiveStartIndex + executiveItemsPerPage
  );

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  const formatCurrency = (amount: number): string => {
    return `$${amount.toLocaleString()}`;
  };

  // Chart configurations
  const planStatusChartData = {
    labels: ['Approved', 'Rejected', 'Pending'],
    datasets: [{
      data: [approvedCount, rejectedCount, pendingCount],
      backgroundColor: ['#10B981', '#EF4444', '#F59E0B'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const budgetDistributionChartData = {
    labels: ['Government', 'Partners', 'SDG', 'Other', 'Gap'],
    datasets: [{
      data: [
        budgetTotals.governmentTotal,
        budgetTotals.partnersTotal,
        budgetTotals.sdgTotal,
        budgetTotals.otherTotal,
        budgetTotals.fundingGap
      ],
      backgroundColor: ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'],
      borderWidth: 2,
      borderColor: '#ffffff'
    }]
  };

  const monthlyTrendsChartData = {
    labels: monthlyTrends.labels,
    datasets: [
      {
        type: 'line' as const,
        label: 'Submissions',
        data: monthlyTrends.submissions,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        yAxisID: 'y',
        tension: 0.4
      },
      {
        type: 'bar' as const,
        label: 'Budget ($)',
        data: monthlyTrends.budgets,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        yAxisID: 'y1'
      }
    ]
  };

  const orgPerformanceChartData = {
    labels: orgPerformance.labels,
    datasets: [
      {
        label: 'Plans Count',
        data: orgPerformance.plans,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        yAxisID: 'y'
      },
      {
        label: 'Budget ($)',
        data: orgPerformance.budgets,
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        yAxisID: 'y1'
      }
    ]
  };

  // Complete Budget Overview Chart Data (for organizations with submitted/approved plans)
  const completeBudgetChartData = {
    labels: completeBudgetOverview.map(org => org.organizationName),
    datasets: [
      {
        label: 'Total Budget',
        data: completeBudgetOverview.map(org => org.totalBudget),
        backgroundColor: completeBudgetOverview.map((_, index) => {
          const colors = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
            '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1',
            '#14B8A6', '#F59E0B', '#8B5CF6', '#06B6D4', '#84CC16'
          ];
          return colors[index % colors.length];
        }),
        borderWidth: 1,
        borderRadius: 4
      },
      {
        label: 'Available Funding',
        data: completeBudgetOverview.map(org => org.funding),
        backgroundColor: completeBudgetOverview.map((_, index) => {
          const colors = [
            '#93C5FD', '#86EFAC', '#FCD34D', '#FCA5A5', '#C4B5FD',
            '#67E8F9', '#BEF264', '#FDBA74', '#F9A8D4', '#A5B4FC',
            '#5EEAD4', '#FCD34D', '#C4B5FD', '#67E8F9', '#BEF264'
          ];
          return colors[index % colors.length];
        }),
        borderWidth: 1,
        borderRadius: 4
      }
    ]
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-blue-600" />
        <span className="text-lg">Loading admin dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-red-800">Access Denied</h3>
        <p className="text-red-600 mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      {/* Beautiful Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-green-600 rounded-lg shadow-lg mb-8 overflow-hidden">
        <div className="px-8 py-12 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center mb-4">
                <Shield className="h-12 w-12 text-white mr-4" />
                <div>
                  <h1 className="text-4xl font-bold">Admin Dashboard</h1>
                  <p className="text-xl text-blue-100">Ministry of Health - System Overview</p>
                </div>
              </div>
              <p className="text-lg text-blue-100 max-w-2xl">
                Comprehensive monitoring and analysis of strategic planning activities across all organizational units. 
                Track plan submissions, budget allocations, and performance metrics in real-time.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{totalPlans}</div>
              <div className="text-blue-100">Total Plans</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('reviewed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'reviewed'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Reviewed Plans
              {(approvedCount + rejectedCount) > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">
                  {approvedCount + rejectedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('budget-activity')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'budget-activity'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Budget by Activity
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'analytics'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('executive-performance')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'executive-performance'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Executive Performance
            </button>
          </nav>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Top Statistics Cards - Plan Status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total Plans</p>
                  <p className="text-3xl font-bold">{totalPlans}</p>
                  <p className="text-blue-100 text-xs">Submitted + Approved</p>
                </div>
                <ClipboardCheck className="h-12 w-12 text-blue-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-amber-100 text-sm font-medium">Pending Review</p>
                  <p className="text-3xl font-bold">{pendingCount}</p>
                  <p className="text-amber-100 text-xs">Awaiting evaluation</p>
                </div>
                <AlertCircle className="h-12 w-12 text-amber-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Approved</p>
                  <p className="text-3xl font-bold">{approvedCount}</p>
                  <p className="text-green-100 text-xs">Successfully reviewed</p>
                </div>
                <CheckCircle className="h-12 w-12 text-green-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Rejected</p>
                  <p className="text-3xl font-bold">{rejectedCount}</p>
                  <p className="text-red-100 text-xs">Needs revision</p>
                </div>
                <XCircle className="h-12 w-12 text-red-200" />
              </div>
            </div>
          </div>

          {/* Budget Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-indigo-100 text-sm font-medium">Total Budget</p>
                  <p className="text-2xl font-bold">{formatCurrency(budgetTotals.totalBudget)}</p>
                  <p className="text-indigo-100 text-xs">All LEO/EO Plans</p>
                </div>
                <DollarSign className="h-10 w-10 text-indigo-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-emerald-100 text-sm font-medium">Available Funding</p>
                  <p className="text-2xl font-bold">{formatCurrency(budgetTotals.totalFunding)}</p>
                  <p className="text-emerald-100 text-xs">All sources combined</p>
                </div>
                <TrendingUp className="h-10 w-10 text-emerald-200" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-lg shadow-lg p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-rose-100 text-sm font-medium">Funding Gap</p>
                  <p className="text-2xl font-bold">{formatCurrency(budgetTotals.fundingGap)}</p>
                  <p className="text-rose-100 text-xs">Additional funding needed</p>
                </div>
                <AlertCircle className="h-10 w-10 text-rose-200" />
              </div>
            </div>
          </div>

          {/* Budget by Activity Type Cards */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Budget by Activity Type</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-gradient-to-br from-blue-400 to-blue-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <GraduationCap className="h-8 w-8 text-blue-100" />
                  <span className="text-xs bg-blue-600 px-2 py-1 rounded-full">
                    {activityBudgets.Training.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Training</h4>
                <p className="text-xs text-blue-100">{formatCurrency(activityBudgets.Training.budget)}</p>
              </div>

              <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <MessageSquare className="h-8 w-8 text-green-100" />
                  <span className="text-xs bg-green-600 px-2 py-1 rounded-full">
                    {activityBudgets.Meeting.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Meeting</h4>
                <p className="text-xs text-green-100">{formatCurrency(activityBudgets.Meeting.budget)}</p>
              </div>

              <div className="bg-gradient-to-br from-purple-400 to-purple-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <Users className="h-8 w-8 text-purple-100" />
                  <span className="text-xs bg-purple-600 px-2 py-1 rounded-full">
                    {activityBudgets.Workshop.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Workshop</h4>
                <p className="text-xs text-purple-100">{formatCurrency(activityBudgets.Workshop.budget)}</p>
              </div>

              <div className="bg-gradient-to-br from-orange-400 to-orange-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <Eye className="h-8 w-8 text-orange-100" />
                  <span className="text-xs bg-orange-600 px-2 py-1 rounded-full">
                    {activityBudgets.Supervision.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Supervision</h4>
                <p className="text-xs text-orange-100">{formatCurrency(activityBudgets.Supervision.budget)}</p>
              </div>

              <div className="bg-gradient-to-br from-teal-400 to-teal-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <Package className="h-8 w-8 text-teal-100" />
                  <span className="text-xs bg-teal-600 px-2 py-1 rounded-full">
                    {activityBudgets.Procurement.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Procurement</h4>
                <p className="text-xs text-teal-100">{formatCurrency(activityBudgets.Procurement.budget)}</p>
              </div>

              <div className="bg-gradient-to-br from-pink-400 to-pink-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <FileText className="h-8 w-8 text-pink-100" />
                  <span className="text-xs bg-pink-600 px-2 py-1 rounded-full">
                    {activityBudgets.Printing.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Printing</h4>
                <p className="text-xs text-pink-100">{formatCurrency(activityBudgets.Printing.budget)}</p>
              </div>

              <div className="bg-gradient-to-br from-gray-400 to-gray-500 rounded-lg shadow-md p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <Wrench className="h-8 w-8 text-gray-100" />
                  <span className="text-xs bg-gray-600 px-2 py-1 rounded-full">
                    {activityBudgets.Other.count}
                  </span>
                </div>
                <h4 className="font-medium text-sm">Other</h4>
                <p className="text-xs text-gray-100">{formatCurrency(activityBudgets.Other.budget)}</p>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Status Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <PieChart className="h-5 w-5 mr-2 text-blue-600" />
                Plan Status Distribution
              </h3>
              <div className="h-64">
                <Doughnut 
                  data={planStatusChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Budget & Funding Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                Budget & Funding Distribution
              </h3>
              <div className="h-64">
                <Doughnut 
                  data={budgetDistributionChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Submission Trends */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
              Monthly Submission Trends
            </h3>
            <div className="h-80">
              <Line 
                data={monthlyTrendsChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    mode: 'index' as const,
                    intersect: false,
                  },
                  scales: {
                    x: {
                      display: true,
                      title: {
                        display: true,
                        text: 'Month'
                      }
                    },
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
                        text: 'Budget Amount ($)'
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
                    }
                  }
                }}
              />
            </div>
          </div>

          {/* Top Organizations by Plan Activity */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-indigo-600" />
              Top Organizations by Plan Activity
            </h3>
            <div className="h-80">
              <Bar 
                data={orgPerformanceChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      title: {
                        display: true,
                        text: 'Number of Plans'
                      }
                    },
                    y1: {
                      type: 'linear' as const,
                      display: true,
                      position: 'right' as const,
                      title: {
                        display: true,
                        text: 'Budget Amount ($)'
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Reviewed Plans Tab */}
      {activeTab === 'reviewed' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Reviewed Plans</h3>
                <p className="mt-1 text-sm text-gray-500">
                  All plans that have been reviewed (approved or rejected)
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search planner or organization..."
                    value={reviewedSearch}
                    onChange={(e) => setReviewedSearch(e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={reviewedFilter}
                  onChange={(e) => setReviewedFilter(e.target.value)}
                  className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                <select
                  value={reviewedOrgFilter}
                  onChange={(e) => setReviewedOrgFilter(e.target.value)}
                  className="text-sm rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="all">All Organizations</option>
                  {Object.entries(organizationsMap).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <button
                  onClick={() => refetch()}
                  className="flex items-center px-3 py-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </button>
              </div>
            </div>

            {filteredReviewedPlans.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <ClipboardCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No reviewed plans found</h3>
                <p className="text-gray-500">No plans match your current filters.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (reviewedSortBy === 'organization') {
                              setReviewedSortOrder(reviewedSortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setReviewedSortBy('organization');
                              setReviewedSortOrder('asc');
                            }
                          }}
                        >
                          <div className="flex items-center">
                            Organization
                            {reviewedSortBy === 'organization' && (
                              <span className="ml-1">
                                {reviewedSortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Planner
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Plan Type
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (reviewedSortBy === 'date') {
                              setReviewedSortOrder(reviewedSortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setReviewedSortBy('date');
                              setReviewedSortOrder('desc');
                            }
                          }}
                        >
                          <div className="flex items-center">
                            Submitted Date
                            {reviewedSortBy === 'date' && (
                              <span className="ml-1">
                                {reviewedSortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (reviewedSortBy === 'status') {
                              setReviewedSortOrder(reviewedSortOrder === 'asc' ? 'desc' : 'asc');
                            } else {
                              setReviewedSortBy('status');
                              setReviewedSortOrder('asc');
                            }
                          }}
                        >
                          <div className="flex items-center">
                            Status
                            {reviewedSortBy === 'status' && (
                              <span className="ml-1">
                                {reviewedSortOrder === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Budget Analysis
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reviewedPaginatedPlans.map((plan: any) => {
                        const budget = calculatePlanBudget(plan);
                        const fundingCoverage = budget.total > 0 ? (budget.totalFunding / budget.total) * 100 : 0;
                        
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
                              {plan.planner_name || 'Unknown Planner'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {plan.type || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {plan.submitted_at ? formatDate(plan.submitted_at) : 'Not submitted'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                plan.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {plan.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm">
                                <div className="font-medium text-gray-900">
                                  {formatCurrency(budget.total)}
                                </div>
                                <div className="text-gray-500">
                                  Funding: {fundingCoverage.toFixed(1)}%
                                </div>
                                <div className="text-xs text-gray-400">
                                  Gap: {formatCurrency(budget.gap)}
                                </div>
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
                {reviewedTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => setReviewedCurrentPage(Math.max(1, reviewedCurrentPage - 1))}
                        disabled={reviewedCurrentPage === 1}
                        className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setReviewedCurrentPage(Math.min(reviewedTotalPages, reviewedCurrentPage + 1))}
                        disabled={reviewedCurrentPage === reviewedTotalPages}
                        className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium">{reviewedStartIndex + 1}</span> to{' '}
                          <span className="font-medium">
                            {Math.min(reviewedStartIndex + reviewedItemsPerPage, filteredReviewedPlans.length)}
                          </span>{' '}
                          of <span className="font-medium">{filteredReviewedPlans.length}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                          <button
                            onClick={() => setReviewedCurrentPage(Math.max(1, reviewedCurrentPage - 1))}
                            disabled={reviewedCurrentPage === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          {Array.from({ length: Math.min(5, reviewedTotalPages) }, (_, i) => {
                            const pageNum = i + 1;
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setReviewedCurrentPage(pageNum)}
                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                  pageNum === reviewedCurrentPage
                                    ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setReviewedCurrentPage(Math.min(reviewedTotalPages, reviewedCurrentPage + 1))}
                            disabled={reviewedCurrentPage === reviewedTotalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Budget by Activity Tab */}
      {activeTab === 'budget-activity' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Budget by Activity Type</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Activity counts and budgets by organization
                </p>
              </div>
            </div>

            {budgetByActivityData.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No activity data found</h3>
                <p className="text-gray-500">No budget activities have been recorded yet.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Organization Name
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Training
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Meeting
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Workshop
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Procurement
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Printing
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Other
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Count
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Budget
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {budgetActivityPaginatedData.map((orgData: any, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">
                                {orgData.organizationName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {orgData.Training.count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {orgData.Meeting.count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              {orgData.Workshop.count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                              {orgData.Procurement.count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                              {orgData.Printing.count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {orgData.Other.count}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="text-sm font-medium text-gray-900">
                              {orgData.totalCount}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="text-sm font-medium text-green-600">
                              {formatCurrency(orgData.totalBudget)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination for Budget by Activity */}
                {budgetActivityTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => setBudgetActivityCurrentPage(Math.max(1, budgetActivityCurrentPage - 1))}
                        disabled={budgetActivityCurrentPage === 1}
                        className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setBudgetActivityCurrentPage(Math.min(budgetActivityTotalPages, budgetActivityCurrentPage + 1))}
                        disabled={budgetActivityCurrentPage === budgetActivityTotalPages}
                        className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium">{budgetActivityStartIndex + 1}</span> to{' '}
                          <span className="font-medium">
                            {Math.min(budgetActivityStartIndex + budgetActivityItemsPerPage, budgetByActivityData.length)}
                          </span>{' '}
                          of <span className="font-medium">{budgetByActivityData.length}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                          <button
                            onClick={() => setBudgetActivityCurrentPage(Math.max(1, budgetActivityCurrentPage - 1))}
                            disabled={budgetActivityCurrentPage === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          {Array.from({ length: Math.min(5, budgetActivityTotalPages) }, (_, i) => {
                            const pageNum = i + 1;
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setBudgetActivityCurrentPage(pageNum)}
                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                  pageNum === budgetActivityCurrentPage
                                    ? 'z-10 bg-blue-600 text-white'
                                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setBudgetActivityCurrentPage(Math.min(budgetActivityTotalPages, budgetActivityCurrentPage + 1))}
                            disabled={budgetActivityCurrentPage === budgetActivityTotalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-8">
          {/* Complete Budget Overview by Executives - Colorful Chart */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
              Complete Budget Overview by Executives
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              Budget analysis for organizations with submitted and approved plans
            </p>
            {completeBudgetOverview.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No budget data available</h3>
                <p className="text-gray-500">No organizations have submitted or approved plans with budget data.</p>
              </div>
            ) : (
              <div className="h-96">
                <Bar 
                  data={completeBudgetChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'top' as const,
                      },
                      title: {
                        display: true,
                        text: `Budget Overview - ${completeBudgetOverview.length} Organizations`
                      }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Organizations'
                        },
                        ticks: {
                          maxRotation: 45,
                          minRotation: 45
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: 'Budget Amount ($)'
                        },
                        ticks: {
                          callback: function(value) {
                            return '$' + Number(value).toLocaleString();
                          }
                        }
                      }
                    },
                    interaction: {
                      intersect: false,
                      mode: 'index' as const
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Other Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Plan Status Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <PieChart className="h-5 w-5 mr-2 text-blue-600" />
                Plan Status Distribution
              </h3>
              <div className="h-64">
                <Doughnut 
                  data={planStatusChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Budget & Funding Distribution */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                Budget & Funding Distribution
              </h3>
              <div className="h-64">
                <Doughnut 
                  data={budgetDistributionChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Monthly Submission Trends */}
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-purple-600" />
              Monthly Submission Trends
            </h3>
            <div className="h-80">
              <Line 
                data={monthlyTrendsChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    mode: 'index' as const,
                    intersect: false,
                  },
                  scales: {
                    x: {
                      display: true,
                      title: {
                        display: true,
                        text: 'Month'
                      }
                    },
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
                        text: 'Budget Amount ($)'
                      },
                      grid: {
                        drawOnChartArea: false,
                      },
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900">Executive Performance Overview</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Comprehensive performance metrics for all executive organizations
                </p>
              </div>
            </div>

            {executivePerformanceData.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No performance data available</h3>
                <p className="text-gray-500">No executive performance data has been recorded yet.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Organization Name
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Plans
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Approved
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submitted
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Budget
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Available Funding
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Government Budget
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          SDG Budget
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Partners Budget
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Funding Gap
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {executivePaginatedData.map((execData: any, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Building2 className="h-5 w-5 text-gray-400 mr-2" />
                              <span className="text-sm font-medium text-gray-900">
                                {execData.organizationName}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
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
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-gray-900">
                            {formatCurrency(execData.totalBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-green-600">
                            {formatCurrency(execData.availableFunding)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-blue-600">
                            {formatCurrency(execData.governmentBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-purple-600">
                            {formatCurrency(execData.sdgBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium text-orange-600">
                            {formatCurrency(execData.partnersBudget)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                            <span className={execData.fundingGap > 0 ? 'text-red-600' : 'text-green-600'}>
                              {formatCurrency(execData.fundingGap)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination for Executive Performance */}
                {executiveTotalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
                    <div className="flex flex-1 justify-between sm:hidden">
                      <button
                        onClick={() => setExecutiveCurrentPage(Math.max(1, executiveCurrentPage - 1))}
                        disabled={executiveCurrentPage === 1}
                        className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setExecutiveCurrentPage(Math.min(executiveTotalPages, executiveCurrentPage + 1))}
                        disabled={executiveCurrentPage === executiveTotalPages}
                        className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                    <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium">{executiveStartIndex + 1}</span> to{' '}
                          <span className="font-medium">
                            {Math.min(executiveStartIndex + executiveItemsPerPage, executivePerformanceData.length)}
                          </span>{' '}
                          of <span className="font-medium">{executivePerformanceData.length}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                          <button
                            onClick={() => setExecutiveCurrentPage(Math.max(1, executiveCurrentPage - 1))}
                            disabled={executiveCurrentPage === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </button>
                          {Array.from({ length: Math.min(5, executiveTotalPages) }, (_, i) => {
                            const pageNum = i + 1;
                            return (
                              <button
                                key={pageNum}
                                onClick={() => setExecutiveCurrentPage(pageNum)}
                                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                                  pageNum === executiveCurrentPage
                                    ? 'z-10 bg-blue-600 text-white'
                                    : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setExecutiveCurrentPage(Math.min(executiveTotalPages, executiveCurrentPage + 1))}
                            disabled={executiveCurrentPage === executiveTotalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;