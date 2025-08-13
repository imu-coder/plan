import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Building2, CheckCircle, XCircle, AlertCircle, Loader, Eye, Users, Calendar, LayoutGrid, DollarSign, TrendingUp, PieChart, ChevronLeft, ChevronRight, Activity, Briefcase, GraduationCap, Printer, Shield, ShoppingCart } from 'lucide-react';
import { plans, organizations, auth } from '../lib/api';
import { format } from 'date-fns';
import { isAdmin } from '../types/user';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [reviewedPage, setReviewedPage] = useState(1);
  const [currentActivityPage, setCurrentActivityPage] = useState(1);
  const plansPerPage = 5;
  const activitiesPerPage = 10;

  // Define activity types
  const activityTypes = ['Training', 'Meeting', 'Workshop', 'Procurement', 'Printing', 'Other'];

  // Check admin permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        setIsUserAdmin(isAdmin(authData.userOrganizations));
        
        if (!isAdmin(authData.userOrganizations)) {
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Failed to check permissions:', error);
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

  const getOrganizationName = (plan: any) => {
    return plan.organizationName || 
           plan.organization_name || 
           organizationsMap[plan.organization] || 
           `Organization ${plan.organization}`;
  };

  // Fetch all plans
  const { data: allPlansData, isLoading, error, isFetching } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      try {
        console.log('Fetching all plans for admin dashboard...');
        const response = await plans.getAll();
        const plansData = response.data?.results || response.data || [];
        
        console.log(`Loaded ${plansData.length} total plans`);
        
        // Map organization names
        plansData.forEach((plan: any) => {
          if (plan.organization && organizationsMap[plan.organization]) {
            plan.organizationName = organizationsMap[plan.organization];
          }
        });
        
        return plansData;
      } catch (error) {
        console.error('Error fetching plans:', error);
        throw error;
      }
    },
    enabled: Object.keys(organizationsMap).length > 0,
    retry: 1,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });

  // Calculate activity breakdown by organization
  const calculateActivityBreakdown = useMemo(() => {
    const activityBreakdown: Array<{
      organizationId: number;
      organizationName: string;
      activityType: string;
      budget: number;
      count: number;
    }> = [];

    if (!allPlansData || !Array.isArray(allPlansData)) return activityBreakdown;

    const relevantPlans = allPlansData.filter((plan: any) => 
      ['SUBMITTED', 'APPROVED'].includes(plan.status)
    );

    relevantPlans.forEach((plan: any) => {
      const orgId = Number(plan.organization);
      const orgName = getOrganizationName(plan);
      
      const objectives = plan.objectives || plan.selected_objectives_data || plan.objectives_data || [];
      
      objectives.forEach((objective: any) => {
        const initiatives = objective.initiatives || [];
        
        initiatives.forEach((initiative: any) => {
          const activities = initiative.main_activities || [];
          
          activities.forEach((activity: any) => {
            // Calculate budget from sub-activities if they exist
            if (activity.sub_activities && activity.sub_activities.length > 0) {
              activity.sub_activities.forEach((subActivity: any) => {
                let activityType = (subActivity.activity_type || 'Other').toLowerCase();
                const budget = subActivity.budget_calculation_type === 'WITH_TOOL'
                  ? Number(subActivity.estimated_cost_with_tool || 0)
                  : Number(subActivity.estimated_cost_without_tool || 0);
                
                // Normalize activity types
                if (activityType === 'supervision') activityType = 'other';
                if (!activityTypes.map(t => t.toLowerCase()).includes(activityType)) {
                  activityType = 'other';
                }
                
                // Find existing entry or create new one
                const existingIndex = activityBreakdown.findIndex(item => 
                  item.organizationId === orgId && item.activityType === activityType
                );
                
                if (existingIndex >= 0) {
                  activityBreakdown[existingIndex].budget += budget;
                  activityBreakdown[existingIndex].count += 1;
                } else {
                  activityBreakdown.push({
                    organizationId: orgId,
                    organizationName: orgName,
                    activityType,
                    budget,
                    count: 1
                  });
                }
              });
            } else if (activity.budget) {
              // Use legacy budget if no sub-activities
              let activityType = (activity.budget.activity_type || 'Other').toLowerCase();
              const budget = activity.budget.budget_calculation_type === 'WITH_TOOL' 
                ? Number(activity.budget.estimated_cost_with_tool || 0)
                : Number(activity.budget.estimated_cost_without_tool || 0);
              
              // Normalize activity types
              if (activityType === 'supervision') activityType = 'other';
              if (!activityTypes.map(t => t.toLowerCase()).includes(activityType)) {
                activityType = 'other';
              }
              
              // Find existing entry or create new one
              const existingIndex = activityBreakdown.findIndex(item => 
                item.organizationId === orgId && item.activityType === activityType
              );
              
              if (existingIndex >= 0) {
                activityBreakdown[existingIndex].budget += budget;
                activityBreakdown[existingIndex].count += 1;
              } else {
                activityBreakdown.push({
                  organizationId: orgId,
                  organizationName: orgName,
                  activityType,
                  budget,
                  count: 1
                });
              }
            }
          });
        });
      });
    });

    return activityBreakdown;
  }, [allPlansData, organizationsMap, activityTypes]);

  // Transform activity breakdown data to organization-based summary
  const orgActivitySummary = useMemo(() => {
    const summary: Record<string, {
      organizationName: string;
      activities: Record<string, { count: number; budget: number }>;
      totalCount: number;
      totalBudget: number;
    }> = {};

    calculateActivityBreakdown.forEach(item => {
      const orgName = item.organizationName;
      const type = item.activityType;
      
      if (!summary[orgName]) {
        summary[orgName] = {
          organizationName: orgName,
          activities: {},
          totalCount: 0,
          totalBudget: 0
        };
        
        // Initialize all activity types to zero
        activityTypes.forEach(t => {
          const typeKey = t.toLowerCase();
          summary[orgName].activities[typeKey] = { count: 0, budget: 0 };
        });
      }
      
      // Add to specific activity type
      if (summary[orgName].activities[type]) {
        summary[orgName].activities[type].count += item.count;
        summary[orgName].activities[type].budget += item.budget;
      } else {
        // Handle other types
        summary[orgName].activities.other.count += item.count;
        summary[orgName].activities.other.budget += item.budget;
      }
      
      // Update totals
      summary[orgName].totalCount += item.count;
      summary[orgName].totalBudget += item.budget;
    });

    return Object.values(summary).sort((a, b) => 
      a.organizationName.localeCompare(b.organizationName)
    );
  }, [calculateActivityBreakdown]);

  // Pagination for activity breakdown
  const totalActivityPages = Math.ceil(orgActivitySummary.length / activitiesPerPage);
  const startActivityIndex = (currentActivityPage - 1) * activitiesPerPage;
  const endActivityIndex = startActivityIndex + activitiesPerPage;
  const currentActivityData = orgActivitySummary.slice(startActivityIndex, endActivityIndex);

  // Calculate comprehensive statistics including activity budgets
  const calculateStats = useMemo(() => {
    if (!allPlansData || !Array.isArray(allPlansData)) {
      return {
        totalPlans: 0,
        draftPlans: 0,
        submittedPlans: 0,
        approvedPlans: 0,
        rejectedPlans: 0,
        organizationStats: {},
        totalBudgetAllOrgs: 0,
        totalFundingAllOrgs: 0,
        totalGapAllOrgs: 0,
        activityStats: {
          training: { count: 0, budget: 0 },
          meeting: { count: 0, budget: 0 },
          workshop: { count: 0, budget: 0 },
          supervision: { count: 0, budget: 0 },
          procurement: { count: 0, budget: 0 },
          printing: { count: 0, budget: 0 },
          other: { count: 0, budget: 0 }
        }
      };
    }

    const stats = {
      totalPlans: 0, // Will count only submitted and approved
      draftPlans: 0,
      submittedPlans: 0,
      approvedPlans: 0,
      rejectedPlans: 0,
      organizationStats: {} as Record<string, any>,
      totalBudgetAllOrgs: 0,
      totalFundingAllOrgs: 0,
      totalGapAllOrgs: 0,
      activityStats: {
        training: { count: 0, budget: 0 },
        meeting: { count: 0, budget: 0 },
        workshop: { count: 0, budget: 0 },
        supervision: { count: 0, budget: 0 },
        procurement: { count: 0, budget: 0 },
        printing: { count: 0, budget: 0 },
        other: { count: 0, budget: 0 }
      }
    };

    // Organization statistics with REAL budget values from plans
    const orgStats: Record<string, any> = {};

    // Helper function to calculate real budget from plan data
    const calculatePlanBudget = (plan: any) => {
      let totalBudget = 0;
      let governmentFunding = 0;
      let sdgFunding = 0;
      let partnersFunding = 0;
      let otherFunding = 0;
      const activityBreakdown = {
        training: { count: 0, budget: 0 },
        meeting: { count: 0, budget: 0 },
        workshop: { count: 0, budget: 0 },
        supervision: { count: 0, budget: 0 },
        procurement: { count: 0, budget: 0 },
        printing: { count: 0, budget: 0 },
        other: { count: 0, budget: 0 }
      };
      
      try {
        // Check multiple possible data structures for objectives
        let objectivesData = [];
        
        // Try different possible locations for objectives data
        if (plan.objectives && Array.isArray(plan.objectives)) {
          objectivesData = plan.objectives;
        } else if (plan.selected_objectives_data && Array.isArray(plan.selected_objectives_data)) {
          objectivesData = plan.selected_objectives_data;
        } else if (plan.objectives_data && Array.isArray(plan.objectives_data)) {
          objectivesData = plan.objectives_data;
        }
        
        // Traverse objectives → initiatives → main_activities to get budget data
        objectivesData.forEach((objective: any) => {
          if (objective.initiatives && Array.isArray(objective.initiatives)) {
            objective.initiatives.forEach((initiative: any) => {
              if (initiative.main_activities && Array.isArray(initiative.main_activities)) {
                initiative.main_activities.forEach((activity: any) => {
                  // Calculate budget from sub-activities if they exist
                  if (activity.sub_activities && activity.sub_activities.length > 0) {
                    console.log(`Admin: Processing main activity "${activity.name}" with ${activity.sub_activities.length} sub-activities`);
                    
                    activity.sub_activities.forEach((subActivity: any) => {
                      // Use direct SubActivity model fields
                      const subBudgetRequired = subActivity.budget_calculation_type === 'WITH_TOOL'
                        ? Number(subActivity.estimated_cost_with_tool || 0)
                        : Number(subActivity.estimated_cost_without_tool || 0);
                      
                      const subGov = Number(subActivity.government_treasury || 0);
                      const subPartners = Number(subActivity.partners_funding || 0);
                      const subSdg = Number(subActivity.sdg_funding || 0);
                      const subOther = Number(subActivity.other_funding || 0);
                      
                      console.log(`Admin sub-activity "${subActivity.name}": budget=${subBudgetRequired}, gov=${subGov}, partners=${subPartners}, sdg=${subSdg}, other=${subOther}`);
                      
                      totalBudget += subBudgetRequired;
                      governmentFunding += subGov;
                      sdgFunding += subSdg;
                      partnersFunding += subPartners;
                      otherFunding += subOther;
                      
                      // Track activity type budgets from sub-activities
                      let activityType = (subActivity.activity_type || 'other').toLowerCase();
                      if (activityType === 'supervision') activityType = 'other';
                      
                      if (activityBreakdown[activityType]) {
                        activityBreakdown[activityType].count += 1;
                        activityBreakdown[activityType].budget += subBudgetRequired;
                      } else {
                        activityBreakdown.other.count += 1;
                        activityBreakdown.other.budget += subBudgetRequired;
                      }
                    });
                  } else if (activity.budget) {
                    // Use legacy budget if no sub-activities
                    const estimatedCost = activity.budget.budget_calculation_type === 'WITH_TOOL' 
                      ? Number(activity.budget.estimated_cost_with_tool || 0)
                      : Number(activity.budget.estimated_cost_without_tool || 0);
                    
                    totalBudget += estimatedCost;
                    governmentFunding += Number(activity.budget.government_treasury || 0);
                    sdgFunding += Number(activity.budget.sdg_funding || 0);
                    partnersFunding += Number(activity.budget.partners_funding || 0);
                    otherFunding += Number(activity.budget.other_funding || 0);
                    
                    // Track activity type budgets from legacy budget
                    let activityType = (activity.budget.activity_type || 'other').toLowerCase();
                    if (activityType === 'supervision') activityType = 'other';
                    
                    if (activityBreakdown[activityType]) {
                      activityBreakdown[activityType].count += 1;
                      activityBreakdown[activityType].budget += estimatedCost;
                    } else {
                      activityBreakdown.other.count += 1;
                      activityBreakdown.other.budget += estimatedCost;
                    }
                  }
                });
              }
            });
          }
        });
      } catch (error) {
        console.warn(`Error calculating budget for plan ${plan.id}`);
      }
      
      const totalAvailableFunding = governmentFunding + sdgFunding + partnersFunding + otherFunding;
      const fundingGap = Math.max(0, totalBudget - totalAvailableFunding);
      
      return {
        totalBudget,
        availableFunding: totalAvailableFunding,
        fundingGap,
        governmentBudget: governmentFunding,
        sdgBudget: sdgFunding,
        partnersBudget: partnersFunding,
        otherBudget: otherFunding,
        activityBreakdown
      };
    };
    
    allPlansData.forEach((plan: any) => {
      // Count by status
      switch (plan.status) {
        case 'DRAFT': stats.draftPlans++; break;
        case 'SUBMITTED': stats.submittedPlans++; break;
        case 'APPROVED': stats.approvedPlans++; break;
        case 'REJECTED': stats.rejectedPlans++; break;
      }
      
      // Count submitted and approved as active plans
      if (plan.status === 'SUBMITTED' || plan.status === 'APPROVED') {
        stats.totalPlans++;
      }

      // Organization statistics - Only process SUBMITTED and APPROVED plans for budget
      const orgName = plan.organizationName || 
        organizationsMap[plan.organization] || 
        `Organization ${plan.organization}`;

      if (!orgStats[orgName]) {
        orgStats[orgName] = {
          planCount: 0,
          totalBudget: 0,
          availableFunding: 0,
          fundingGap: 0,
          governmentBudget: 0,
          sdgBudget: 0,
          partnersBudget: 0,
          otherBudget: 0,
          approvedPlans: 0,
          submittedPlans: 0,
          draftPlans: 0,
          rejectedPlans: 0,
          activityBreakdown: {
            training: { count: 0, budget: 0 },
            meeting: { count: 0, budget: 0 },
            workshop: { count: 0, budget: 0 },
            supervision: { count: 0, budget: 0 },
            procurement: { count: 0, budget: 0 },
            printing: { count: 0, budget: 0 },
            other: { count: 0, budget: 0 }
          }
        };
      }

      orgStats[orgName].planCount++;

      // Only calculate budget for SUBMITTED and APPROVED plans
      if (plan.status === 'SUBMITTED' || plan.status === 'APPROVED') {
        const budgetData = calculatePlanBudget(plan);
        orgStats[orgName].totalBudget += budgetData.totalBudget;
        orgStats[orgName].availableFunding += budgetData.availableFunding;
        orgStats[orgName].fundingGap += budgetData.fundingGap;
        orgStats[orgName].governmentBudget += budgetData.governmentBudget;
        orgStats[orgName].sdgBudget += budgetData.sdgBudget;
        orgStats[orgName].partnersBudget += budgetData.partnersBudget;
        orgStats[orgName].otherBudget += budgetData.otherBudget;
        
        // Add activity breakdown to organization stats
        Object.keys(budgetData.activityBreakdown).forEach(activityType => {
          const activity = budgetData.activityBreakdown[activityType];
          orgStats[orgName].activityBreakdown[activityType].count += activity.count;
          orgStats[orgName].activityBreakdown[activityType].budget += activity.budget;
          
          // Add to global activity stats
          stats.activityStats[activityType].count += activity.count;
          stats.activityStats[activityType].budget += activity.budget;
        });
      }

      // Count plans by status per organization
      switch (plan.status) {
        case 'DRAFT': orgStats[orgName].draftPlans++; break;
        case 'SUBMITTED': orgStats[orgName].submittedPlans++; break;
        case 'APPROVED': orgStats[orgName].approvedPlans++; break;
        case 'REJECTED': orgStats[orgName].rejectedPlans++; break;
      }
    });

    // Include ALL organizations that have submitted or approved plans
    const filteredOrgStats: Record<string, any> = {};
    Object.entries(orgStats).forEach(([orgName, orgData]: [string, any]) => {
      // Include organizations with submitted or approved plans (even if budget is 0)
      if (orgData.submittedPlans > 0 || orgData.approvedPlans > 0) {
        filteredOrgStats[orgName] = orgData;
      }
    });

    // Calculate totals across all organizations
    Object.values(filteredOrgStats).forEach((orgData: any) => {
      stats.totalBudgetAllOrgs += orgData.totalBudget;
      stats.totalFundingAllOrgs += orgData.availableFunding;
      stats.totalGapAllOrgs += orgData.fundingGap;
    });

    stats.organizationStats = filteredOrgStats;
    
    return stats;
  }, [allPlansData, organizationsMap]);

  // Pagination logic for all plans
  const { allPlans, totalPages, currentPlans } = useMemo(() => {
    const plans = allPlansData || [];
    const total = Math.ceil(plans.length / plansPerPage);
    const start = (currentPage - 1) * plansPerPage;
    const end = start + plansPerPage;
    const current = plans.slice(start, end);
    
    return {
      allPlans: plans,
      totalPages: total,
      currentPlans: current
    };
  }, [allPlansData, currentPage, plansPerPage]);
  
  // Pagination logic for reviewed plans
  const { reviewedPlans, totalReviewedPages, currentReviewedPlans } = useMemo(() => {
    const reviewed = allPlans.filter(plan => ['APPROVED', 'REJECTED'].includes(plan.status));
    const totalReviewed = Math.ceil(reviewed.length / plansPerPage);
    const reviewedStart = (reviewedPage - 1) * plansPerPage;
    const reviewedEnd = reviewedStart + plansPerPage;
    const currentReviewed = reviewed.slice(reviewedStart, reviewedEnd);
    
    return {
      reviewedPlans: reviewed,
      totalReviewedPages: totalReviewed,
      currentReviewedPlans: currentReviewed
    };
  }, [allPlans, reviewedPage, plansPerPage]);
  
  // Get activity type icon
  const getActivityIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'training': return <GraduationCap className="h-4 w-4" />;
      case 'meeting': return <Users className="h-4 w-4" />;
      case 'workshop': return <Briefcase className="h-4 w-4" />;
      case 'procurement': return <ShoppingCart className="h-4 w-4" />;
      case 'printing': return <Printer className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };
  
  // Pagination component
  const PaginationControls = ({ currentPage, totalPages, onPageChange, label }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    label: string;
  }) => (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <div className="flex-1 flex justify-between sm:hidden">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
      <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{Math.min((currentPage - 1) * plansPerPage + 1, totalPages * plansPerPage)}</span> to{' '}
            <span className="font-medium">{Math.min(currentPage * plansPerPage, totalPages * plansPerPage)}</span> of{' '}
            <span className="font-medium">{totalPages * plansPerPage}</span> {label}
          </p>
        </div>
        <div>
          <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                  page === currentPage
                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );

  // Handle view plan
  const handleViewPlan = (plan: any) => {
    if (!plan || !plan.id) {
      console.error('Invalid plan data:', plan);
      return;
    }
    
    console.log('Navigating to plan:', plan.id);
    navigate(`/plans/${plan.id}`);
  };

  // Format date safely
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  if (!isUserAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center p-8 bg-red-50 rounded-xl border border-red-200 shadow-lg max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Access Denied</h3>
          <p className="text-red-600">You need admin permissions to access this dashboard.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center">
          <Loader className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Dashboard</h3>
          <p className="text-gray-600">Fetching plans and budget data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center p-8 bg-red-50 rounded-xl border border-red-200 shadow-lg max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Data</h3>
          <p className="text-red-600">Failed to load admin dashboard data. Please refresh the page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white shadow-lg">
          <h1 className="text-3xl font-bold mb-2">Higher Officials Dashboard</h1>
          <p className="text-blue-100">Comprehensive overview of all plans and budgets across all Executives</p>
          {isFetching && (
            <div className="mt-2 flex items-center text-blue-200">
              <Loader className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Refreshing data...</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Active Plans</h3>
            <div className="p-2 bg-blue-100 rounded-lg">
              <LayoutGrid className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-blue-600">{calculateStats.totalPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Submitted + Approved</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Submitted</h3>
            <div className="p-2 bg-amber-100 rounded-lg">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-amber-600">{calculateStats.submittedPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Awaiting Review</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Approved</h3>
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-green-600">{calculateStats.approvedPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Successfully Reviewed</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Rejected</h3>
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-600">{calculateStats.rejectedPlans}</p>
          <p className="text-xs text-gray-500 mt-1">Needs Revision</p>
        </div>
      </div>

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Total Budget (All EO/LEO)</h3>
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-purple-600">ETB {calculateStats.totalBudgetAllOrgs.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Across all Executives</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Available Funding</h3>
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-green-600">ETB {calculateStats.totalFundingAllOrgs.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total available funds</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 hover:shadow-xl transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-500">Funding Gap</h3>
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
          <p className="text-3xl font-bold text-red-600">ETB {calculateStats.totalGapAllOrgs.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total funding needed</p>
        </div>
      </div>

      {/* Activity Budget Breakdown */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 mb-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
          <Activity className="h-6 w-6 mr-3 text-blue-600" />
          Budget by Activity Type
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {Object.entries(calculateStats.activityStats).map(([activityType, data]: [string, any]) => (
            <div key={activityType} className="bg-gray-50 p-4 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  {getActivityIcon(activityType)}
                  <span className="ml-2 text-sm font-medium text-gray-700 capitalize">{activityType}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-blue-600">{data.count}</p>
                <p className="text-xs text-gray-500">Activities</p>
                <p className="text-sm font-semibold text-green-600">ETB {data.budget.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Total Budget</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Plan Status Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
            <PieChart className="h-6 w-6 mr-3 text-blue-600" />
            Plan Status Distribution
          </h3>
          <div className="h-80">
            <Doughnut
              data={{
                labels: ['Approved', 'Submitted', 'Draft', 'Rejected'],
                datasets: [{
                  data: [calculateStats.approvedPlans, calculateStats.submittedPlans, calculateStats.draftPlans, calculateStats.rejectedPlans],
                  backgroundColor: ['#059669', '#d97706', '#6b7280', '#dc2626'],
                  borderWidth: 3,
                  borderColor: '#ffffff',
                  hoverBackgroundColor: ['#047857', '#b45309', '#4b5563', '#b91c1c'],
                  hoverBorderWidth: 4
                }]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: {
                      padding: 20,
                      usePointStyle: true,
                      font: {
                        size: 12,
                        weight: '500'
                      }
                    }
                  },
                  tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#374151',
                    borderWidth: 1
                  }
                }
              }}
            />
          </div>
        </div>

        {/* Budget by Organization Chart */}
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
          <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
            <BarChart3 className="h-6 w-6 mr-3 text-purple-600" />
            Budget by Executives
          </h3>
          <div className="h-80">
            {Object.keys(calculateStats.organizationStats).length > 0 ? (
              <Bar
                data={{
                  labels: Object.keys(calculateStats.organizationStats).map(name => 
                    name.length > 15 ? name.substring(0, 15) + '...' : name
                  ),
                  datasets: [
                    {
                      label: 'Total Budget',
                      data: Object.values(calculateStats.organizationStats).map((org: any) => org.totalBudget),
                      backgroundColor: 'rgba(139, 92, 246, 0.8)',
                      borderColor: '#8b5cf6',
                      borderWidth: 2,
                      borderRadius: 4,
                      borderSkipped: false
                    },
                    {
                      label: 'Available Funding',
                      data: Object.values(calculateStats.organizationStats).map((org: any) => org.availableFunding),
                      backgroundColor: 'rgba(16, 185, 129, 0.8)',
                      borderColor: '#10b981',
                      borderWidth: 2,
                      borderRadius: 4,
                      borderSkipped: false
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    intersect: false,
                    mode: 'index'
                  },
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: {
                          size: 12,
                          weight: '500'
                        }
                      }
                    },
                    tooltip: {
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      titleColor: '#ffffff',
                      bodyColor: '#ffffff',
                      borderColor: '#374151',
                      borderWidth: 1,
                      callbacks: {
                        label: function(context) {
                          return `${context.dataset.label}: ETB ${context.parsed.y.toLocaleString()}`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      grid: {
                        display: false
                      },
                      ticks: {
                        maxRotation: 45,
                        minRotation: 0,
                        font: {
                          size: 10
                        }
                      }
                    },
                    y: {
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      },
                      ticks: {
                        callback: function(value) {
                          const val = value as number;
                          if (val >= 1000000) {
                            return 'ETB ' + (val / 1000000).toFixed(1) + 'M';
                          } else if (val >= 1000) {
                            return 'ETB ' + (val / 1000).toFixed(0) + 'K';
                          }
                          return 'ETB ' + val.toLocaleString();
                        },
                        font: {
                          size: 10
                        }
                      }
                    }
                  }
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <h4 className="text-lg font-medium text-gray-600 mb-2">No Budget Data Available</h4>
                  <p className="text-sm text-gray-500">Executives need submitted/approved plans with budget data</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Budget by Activity Type Table - UPDATED */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-8">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="bg-white/20 p-2 rounded-lg mr-3">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Budget by Activity Type</h3>
                <p className="text-purple-100 text-sm">Breakdown by Executives and activity type</p>
              </div>
            </div>
            <div className="bg-white/20 px-3 py-1 rounded-full">
              <span className="text-white font-medium">{orgActivitySummary.length} Executives</span>
            </div>
          </div>
        </div>

        <div className="p-6">
          {orgActivitySummary.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Activity Budget Data</h3>
              <p className="text-gray-500">No Executives have submitted plans with activity budgets yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Executives
                      </th>
                      {activityTypes.map(type => (
                        <th key={type} className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                          <div className="flex flex-col items-center">
                            <div className="mb-1">
                              {getActivityIcon(type)}
                            </div>
                            <span>{type}</span>
                          </div>
                        </th>
                      ))}
                      <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Total Count
                      </th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Total Budget
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentActivityData.map((org, index) => (
                      <tr key={org.organizationName} 
                          className="hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all duration-200">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="bg-blue-100 p-2 rounded-lg mr-3">
                              <Building2 className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              {org.organizationName}
                            </div>
                          </div>
                        </td>
                        
                        {activityTypes.map(type => {
                          const typeKey = type.toLowerCase();
                          const activity = org.activities[typeKey];
                          return (
                            <td key={`${org.organizationName}-${type}`} className="px-6 py-4 whitespace-nowrap text-center">
                              {activity.count > 0 ? (
                                <>
                                  <div className="text-sm font-medium text-gray-900">
                                    {activity.count}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    ETB {activity.budget.toLocaleString()}
                                  </div>
                                </>
                              ) : (
                                <div className="text-xs text-gray-400">-</div>
                              )}
                            </td>
                          );
                        })}
                        
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                            {org.totalCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            ETB {org.totalBudget.toLocaleString()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Activity Breakdown Pagination */}
              {totalActivityPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 mt-6">
                  <div className="flex-1 flex justify-between sm:hidden">
                    <button
                      onClick={() => setCurrentActivityPage(Math.max(1, currentActivityPage - 1))}
                      disabled={currentActivityPage === 1}
                      className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentActivityPage(Math.min(totalActivityPages, currentActivityPage + 1))}
                      disabled={currentActivityPage === totalActivityPages}
                      className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                  <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{startActivityIndex + 1}</span> to{' '}
                        <span className="font-medium">{Math.min(endActivityIndex, orgActivitySummary.length)}</span> of{' '}
                        <span className="font-medium">{orgActivitySummary.length}</span> organizations
                      </p>
                    </div>
                    <div>
                      <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                          onClick={() => setCurrentActivityPage(Math.max(1, currentActivityPage - 1))}
                          disabled={currentActivityPage === 1}
                          className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        {Array.from({ length: totalActivityPages }, (_, i) => i + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentActivityPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              page === currentActivityPage
                                ? 'z-10 bg-purple-50 border-purple-500 text-purple-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                        <button
                          onClick={() => setCurrentActivityPage(Math.min(totalActivityPages, currentActivityPage + 1))}
                          disabled={currentActivityPage === totalActivityPages}
                          className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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

      {/* All Plans Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-8">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center">
              <LayoutGrid className="h-6 w-6 mr-3 text-blue-600" />
              All Plans Overview
            </h3>
            <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {allPlans.length} Total Plans
            </div>
          </div>

          {!allPlans || allPlans.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <LayoutGrid className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No plans found</h3>
              <p className="text-gray-500">No plans have been created yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Executives
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Planner
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Plan Type
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Period
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Submitted
                      </th>
                      <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentPlans.map((plan: any) => (
                      <tr key={plan.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg mr-3">
                              <Building2 className="h-4 w-4 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {plan.planner_name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {plan.type || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {plan.from_date && plan.to_date ? 
                            `${formatDate(plan.from_date)} - ${formatDate(plan.to_date)}` :
                            'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            plan.status === 'APPROVED' ? 'bg-green-100 text-green-800 border border-green-200' :
                            plan.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                            plan.status === 'REJECTED' ? 'bg-red-100 text-red-800 border border-red-200' :
                            'bg-gray-100 text-gray-800 border border-gray-200'
                          }`}>
                            {plan.status || 'DRAFT'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(plan.submitted_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleViewPlan(plan)}
                            className="inline-flex items-center px-3 py-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
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
              
              {/* Pagination for All Plans */}
              {totalPages > 1 && (
                <PaginationControls
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  label="plans"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Budget by Organization - Full Width Chart */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 mb-8">
        <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
          <BarChart3 className="h-6 w-6 mr-3 text-purple-600" />
          Complete Budget Overview by Executives
        </h3>
        
        {Object.keys(calculateStats.organizationStats).length > 0 ? (
          <div className="h-96">
            <Bar
              data={{
                labels: Object.keys(calculateStats.organizationStats).map(name => 
                  name.length > 20 ? name.substring(0, 20) + '...' : name
                ),
                datasets: [
                  {
                    label: 'Total Budget Required',
                    data: Object.values(calculateStats.organizationStats).map((org: any) => org.totalBudget),
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: '#6366f1',
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false
                  },
                  {
                    label: 'Available Funding',
                    data: Object.values(calculateStats.organizationStats).map((org: any) => org.availableFunding),
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderColor: '#22c55e',
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false
                  },
                  {
                    label: 'Funding Gap',
                    data: Object.values(calculateStats.organizationStats).map((org: any) => org.fundingGap),
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderRadius: 6,
                    borderSkipped: false
                  }
                ]
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  intersect: false,
                  mode: 'index'
                },
                plugins: {
                  legend: {
                    position: 'top',
                    labels: {
                      padding: 20,
                      usePointStyle: true,
                      font: {
                        size: 12,
                        weight: '500'
                      }
                    }
                  },
                  tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#374151',
                    borderWidth: 1,
                    callbacks: {
                      label: function(context) {
                        return `${context.dataset.label}: ETB ${context.parsed.y.toLocaleString()}`;
                      }
                    }
                  }
                },
                scales: {
                  x: {
                    grid: {
                      display: false
                    },
                    ticks: {
                      maxRotation: 45,
                      minRotation: 0,
                      font: {
                        size: 11
                      }
                    }
                  },
                  y: {
                    beginAtZero: true,
                    grid: {
                      color: 'rgba(0, 0, 0, 0.1)'
                    },
                    ticks: {
                      callback: function(value) {
                        const val = value as number;
                        if (val >= 1000000) {
                          return 'ETB ' + (val / 1000000).toFixed(1) + 'M';
                        } else if (val >= 1000) {
                          return 'ETB ' + (val / 1000).toFixed(0) + 'K';
                        }
                        return 'ETB ' + val.toLocaleString();
                      },
                      font: {
                        size: 11
                      }
                    }
                  }
                }
              }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <BarChart3 className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h4 className="text-lg font-medium text-gray-600 mb-2">No Budget Data Available</h4>
              <p className="text-sm text-gray-500">Executives need submitted/approved plans with budget data</p>
            </div>
          </div>
        )}
      </div>

      {/* Organization Performance Table */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center">
            <Building2 className="h-6 w-6 mr-3 text-green-600" />
            Executives Performance
          </h3>
          <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {Object.keys(calculateStats.organizationStats).length} Organizations with Budget Data
          </div>
        </div>

        {Object.keys(calculateStats.organizationStats).length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <BarChart3 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Budget Data Available</h3>
            <p className="text-gray-500 mb-2">No organizations have submitted or approved plans with budget information yet.</p>
            <p className="text-sm text-gray-400">Budget data will appear here once organizations submit plans with complete budget details.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Executives
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Total Plans
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Approved
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Submitted
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Total Budget
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Available Funding
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Government Budget
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    SDG Budget
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Partners Budget
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Funding Gap
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(calculateStats.organizationStats).map(([orgName, orgData]: [string, any]) => (
                  <tr key={orgName} className="hover:bg-blue-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 bg-blue-100 rounded-lg mr-3">
                          <Building2 className="h-4 w-4 text-blue-600" />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{orgName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-gray-900">{orgData.planCount}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-green-600">{orgData.approvedPlans}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-amber-600">{orgData.submittedPlans}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-blue-600">ETB {orgData.totalBudget.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-green-600">ETB {orgData.availableFunding.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-blue-600">ETB {orgData.governmentBudget.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-purple-600">ETB {orgData.sdgBudget.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-orange-600">ETB {orgData.partnersBudget.toLocaleString()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-bold text-red-600">ETB {orgData.fundingGap.toLocaleString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reviewed Plans Section */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center">
              <CheckCircle className="h-6 w-6 mr-3 text-green-600" />
              Reviewed Plans
            </h3>
            <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {reviewedPlans.length} Reviewed Plans
            </div>
          </div>

          {reviewedPlans.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <CheckCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No reviewed plans</h3>
              <p className="text-gray-500">No plans have been reviewed yet.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <tr>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Executives
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Planner
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Plan Type
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Reviewed Date
                      </th>
                      <th scope="col" className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentReviewedPlans.map((plan: any) => (
                      <tr key={plan.id} className="hover:bg-blue-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg mr-3">
                              <Building2 className="h-4 w-4 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium text-gray-900">{getOrganizationName(plan)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {plan.planner_name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {plan.type || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            plan.status === 'APPROVED' ? 'bg-green-100 text-green-800 border border-green-200' :
                            'bg-red-100 text-red-800 border border-red-200'
                          }`}>
                            {plan.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(plan.updated_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleViewPlan(plan)}
                            className="inline-flex items-center px-3 py-1 text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
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
              
              {/* Pagination for Reviewed Plans */}
              {totalReviewedPages > 1 && (
                <PaginationControls
                  currentPage={reviewedPage}
                  totalPages={totalReviewedPages}
                  onPageChange={setReviewedPage}
                  label="reviewed plans"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard