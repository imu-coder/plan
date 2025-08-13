import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, Eye, Building2, CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, BarChart3, PieChart, DollarSign, LayoutGrid } from 'lucide-react';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { plans, organizations, auth, api } from '../lib/api';
import { format } from 'date-fns';
import PlanReviewForm from '../components/PlanReviewForm';
import { isEvaluator } from '../types/user';
import Cookies from 'js-cookie';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

// Register Chart.js components
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Set some chart defaults
ChartJS.defaults.color = '#4b5563';
ChartJS.defaults.font.family = 'Inter, sans-serif';

const EvaluatorDashboard: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
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
  const [userOrgIds, setUserOrgIds] = useState<number[]>([]);

  // Check if user has evaluator permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const authData = await auth.getCurrentUser();
        if (!authData.isAuthenticated) {
          navigate('/login');
          return;
        }
        
        // Get user's organization IDs for filtering
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgIds = authData.userOrganizations.map(org => org.organization);
          setUserOrgIds(orgIds);
          console.log('Evaluator organization IDs:', orgIds);
        }
        
        if (!isEvaluator(authData.userOrganizations)) {
          setError('You do not have permission to access the evaluator dashboard');
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

  // Fetch pending plans for review (filtered by evaluator's organizations)
  const { data: pendingPlans, isLoading, refetch } = useQuery({
    queryKey: ['plans', 'pending-reviews', userOrgIds],
    queryFn: async () => {
      console.log('Fetching pending plans for evaluator organizations:', userOrgIds);
      try {
        await auth.getCurrentUser();
        
        // Get ONLY submitted plans for evaluator's organizations
        const response = await api.get('/plans/', {
          params: {
            status: 'SUBMITTED',
            organization__in: userOrgIds.join(',')
          }
        });
        
        console.log('Pending plans response for evaluator:', response.data?.length || 0);
        
        const plans = response.data?.results || response.data || [];
        
        // Plans are already filtered by organization at API level
        const filteredPlans = plans.filter(plan => 
          plan.status === 'SUBMITTED' && 
          userOrgIds.includes(Number(plan.organization))
        );
        
        console.log(`Filtered ${plans.length} total plans to ${filteredPlans.length} for evaluator orgs:`, userOrgIds);
        
        // Map organization names
        if (Array.isArray(filteredPlans)) {
          filteredPlans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return { data: filteredPlans };
      } catch (error) {
        console.error('Error fetching pending reviews:', error);
        throw error;
      }
    },
    enabled: userOrgIds.length > 0,
    retry: 2,
    refetchInterval: 30000,
    refetchOnWindowFocus: true
  });

  // Fetch reviewed plans (approved/rejected) for evaluator's organizations
  const { data: reviewedPlans, isLoading: isLoadingReviewed } = useQuery({
    queryKey: ['plans', 'reviewed', userOrgIds],
    queryFn: async () => {
      console.log('Fetching reviewed plans for evaluator organizations:', userOrgIds);
      try {
        await auth.getCurrentUser();
        
        // Get ONLY approved and rejected plans for evaluator's organizations
        const response = await api.get('/plans/', {
          params: {
            status__in: 'APPROVED,REJECTED',
            organization__in: userOrgIds.join(',')
          }
        });
        
        console.log('Reviewed plans response for evaluator:', response.data?.length || 0);
        
        const plans = response.data?.results || response.data || [];
        
        // Filter to ensure only approved/rejected plans from evaluator's organizations
        const filteredPlans = plans.filter(plan => 
          ['APPROVED', 'REJECTED'].includes(plan.status) &&
          userOrgIds.includes(Number(plan.organization))
        );
        
        console.log(`Filtered ${plans.length} total plans to ${filteredPlans.length} reviewed plans for evaluator orgs:`, userOrgIds);
        
        // Map organization names
        if (Array.isArray(filteredPlans)) {
          filteredPlans.forEach((plan: any) => {
            if (plan.organization && organizationsMap[plan.organization]) {
              plan.organizationName = organizationsMap[plan.organization];
            }
          });
        }
        
        return { data: filteredPlans };
      } catch (error) {
        console.error('Error fetching reviewed plans:', error);
        throw error;
      }
    },
    enabled: userOrgIds.length > 0,
    retry: 2
  });

  // Manual refresh function
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      // Ensure CSRF token is fresh
      await auth.getCurrentUser();
      
      await refetch();
      
      setSuccess('Plans refreshed successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to refresh plans');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Review mutation (approve or reject)
  const reviewMutation = useMutation({
    mutationFn: async (reviewData: { planId: string, status: 'APPROVED' | 'REJECTED', feedback: string }) => {
      try {
        console.log(`Starting review submission for plan ${reviewData.planId} with status: ${reviewData.status}`);
        
        // Ensure fresh authentication and CSRF token
        await auth.getCurrentUser();
        
        // Get fresh CSRF token
        await api.get('/auth/csrf/');
        const csrfToken = Cookies.get('csrftoken');
        console.log(`Using CSRF token: ${csrfToken ? csrfToken.substring(0, 8) + '...' : 'none'}`);
        
        // Prepare the review data
        const reviewPayload = {
          status: reviewData.status,
          feedback: reviewData.feedback || ''
        };
        
        console.log('Review payload:', reviewPayload);
        
        // Add timestamp for cache busting
        const timestamp = new Date().getTime();
        
        // Submit the review using the planReviews API
        if (reviewData.status === 'APPROVED') {
          console.log('Submitting approval...');
          const response = await api.post(`/plans/${reviewData.planId}/approve/?_=${timestamp}`, reviewPayload);
          console.log('Approval response:', response.data);
          return response;
        } else {
          console.log('Submitting rejection...');
          const response = await api.post(`/plans/${reviewData.planId}/reject/?_=${timestamp}`, reviewPayload);
          console.log('Rejection response:', response.data);
          return response;
        }
      } catch (error) {
        console.error('Review submission failed:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          config: error.config
        });
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Review submitted successfully, refreshing data...');
      queryClient.invalidateQueries({ queryKey: ['plans', 'pending-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['plans', 'all'] });
      setShowReviewModal(false);
      setSelectedPlan(null);
      setSuccess('Plan review submitted successfully');
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (error: any) => {
      console.error('Review mutation error:', error);
      setError(error.message || 'Failed to submit review');
      setTimeout(() => setError(null), 5000);
    },
  });

  const handleViewPlan = async (plan: any) => {
    if (!plan || !plan.id) {
      setError('Invalid plan data for viewing');
      return;
    }
    
    console.log('Navigating to plan details:', plan.id);
    setError(null);
    
    try {
      // Navigate to plan details
      navigate(`/plans/${plan.id}`);
    } catch (err) {
      console.error('Failed to prefetch plan data:', err);
      setError('Error accessing plan. Please try again.');
    }
  };

  const handleReviewPlan = async (plan: any) => {
    if (!plan || !plan.id) {
      setError('Invalid plan data for review');
      return;
    }
    
    try {
      // Ensure CSRF token is fresh
      await auth.getCurrentUser();
      console.log('Opening review modal for plan:', plan.id);
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
      console.log(`Submitting review for plan ${selectedPlan.id} with status: ${data.status}`);
      console.log('Review data:', data);
      
      await reviewMutation.mutateAsync({
        planId: selectedPlan.id,
        status: data.status,
        feedback: data.feedback
      });
    } catch (error) {
      console.error('Failed to submit review:', error);
      
      // Provide more specific error message
      let errorMessage = 'Failed to submit review';
      if (error.response?.status === 403) {
        errorMessage = 'Permission denied. You may not have evaluator permissions.';
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

  // Helper function to safely format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      console.error('Error formatting date:', e);
      return 'Invalid date';
    }
  };

  // Helper function to get organization name from map or plan
  const getOrganizationName = (plan: any) => {
    if (plan.organizationName) {
      return plan.organizationName;
    }
    
    if (plan.organization_name) {
      return plan.organization_name;
    }
    
    // Try to get organization name from our map
    if (plan.organization && organizationsMap[plan.organization]) {
      return organizationsMap[plan.organization];
    }
    
    return 'Unknown Organization';
  };

  // Calculate summary statistics from evaluator's data
  const pendingCount = pendingPlans?.data?.length || 0;
  const reviewedCount = reviewedPlans?.data?.length || 0;
  const approvedCount = reviewedPlans?.data?.filter((p: any) => p.status === 'APPROVED').length || 0;
  const rejectedCount = reviewedPlans?.data?.filter((p: any) => p.status === 'REJECTED').length || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader className="h-6 w-6 animate-spin mr-2 text-green-600" />
        <span className="text-lg">Loading pending plans...</span>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Evaluator Dashboard</h1>
        <p className="text-gray-600">Review and evaluate plans from your assigned organizations</p>
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

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Pending Reviews</h3>
            <Bell className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-3xl font-semibold text-amber-600">{pendingCount}</p>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-medium text-gray-500">Total Reviewed</h3>
            <LayoutGrid className="h-5 w-5 text-blue-500" />
          </div>
          <p className="text-3xl font-semibold text-blue-600">{reviewedCount}</p>
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
      </div>

      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
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
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
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
          </nav>
        </div>
      </div>

      {/* Pending Reviews Tab */}
      {activeTab === 'pending' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="sm:flex sm:items-center">
              <div className="sm:flex-auto">
                <h3 className="text-lg font-medium leading-6 text-gray-900">Pending Reviews</h3>
                <p className="mt-1 text-sm text-gray-500">
                  View all plans submitted for review and their current status.
                </p>
              </div>
              <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
                <div className="flex items-center">
                  <Bell className="h-6 w-6 text-gray-400 mr-2" />
                  <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {pendingPlans?.data?.length || 0}
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
                  There are no plans waiting for your review. Check back later or refresh to see if any new plans have been submitted.
                </p>
                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-300 rounded-md disabled:opacity-50"
                >
                  {isRefreshing ? <Loader className="h-4 w-4 mr-2 inline-block animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2 inline-block" />}
                  Check Again
                </button>
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
                  View all plans you have reviewed and their current status.
                </p>
              </div>
            </div>

            {!reviewedPlans?.data || reviewedPlans.data.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 mt-6">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">No reviewed plans</h3>
                <p className="text-gray-500 max-w-lg mx-auto">
                  You haven't reviewed any plans yet, or there are no approved/rejected plans from your organizations.
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
                        Planning Period
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reviewed Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Feedback
                      </th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reviewedPlans.data.map((plan: any) => (
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {plan.reviews && plan.reviews.length > 0 ? 
                            plan.reviews[plan.reviews.length - 1].feedback : 
                            'System review'}
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

export default EvaluatorDashboard;
