import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { organizations, auth } from '../lib/api';
import { useLanguage } from '../lib/i18n/LanguageContext';
import { Info, LayoutList, Network, AlertCircle, Loader } from 'lucide-react';
import OrganizationTree from '../components/OrganizationTree';
import OrganizationChart from '../components/OrganizationChart';
import MetadataForm from '../components/MetadataForm';
import type { Organization } from '../types/organization';
import { useNavigate } from 'react-router-dom';
import { AuthState } from '../types/user';
// import { useQuery } from '@tanstack/react-query';
import { plans } from '../lib/api';

// Component to display submitted plans
const SubmittedPlansTable: React.FC<{ userOrgId: number }> = ({ userOrgId }) => {
  const { data: submittedPlans, isLoading, error } = useQuery({
    queryKey: ['plans', 'submitted', userOrgId],
    queryFn: async () => {
      try {
        const response = await plans.getAll();
        const allPlans = response?.data || [];
        
        // Filter plans for the user's organization
        const userPlans = allPlans.filter(plan => 
          plan.organization === userOrgId && 
          ['SUBMITTED', 'APPROVED', 'REJECTED'].includes(plan.status)
        );
        
        return userPlans;
      } catch (error) {
        console.error('Error fetching submitted plans:', error);
        throw error;
      }
    },
    enabled: !!userOrgId,
    retry: 2
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <span>Loading your submitted plans...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8 text-red-500 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-4" />
        <p className="text-lg mb-2">Error loading plans</p>
        <p className="text-sm">Failed to load your submitted plans. Please try again.</p>
      </div>
    );
  }

  if (!submittedPlans || submittedPlans.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <p className="text-lg mb-2">No submitted plans found</p>
        <p className="text-sm">You haven't submitted any plans yet.</p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      return 'Invalid date';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
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
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {submittedPlans.map((plan) => (
            <tr key={plan.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {plan.type}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatDate(plan.from_date)} - {formatDate(plan.to_date)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(plan.status)}`}>
                  {plan.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {plan.submitted_at ? formatDate(plan.submitted_at) : 'Not submitted'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <a
                  href={`/plans/${plan.id}`}
                  className="text-blue-600 hover:text-blue-900"
                >
                  View Details
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function Dashboard() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'tree' | 'chart'>('tree');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'submitted'>('overview');
  const currentYear = new Date().getFullYear();

  // First, fetch current user and their organization access
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        console.log('Fetching user auth data...');
        const authData = await auth.getCurrentUser();
        setAuthState(authData);
        
        if (!authData.isAuthenticated) {
          console.log('User not authenticated, redirecting to login');
          navigate('/login');
          return;
        }
        
        // Extract user organization IDs
        if (authData.userOrganizations && authData.userOrganizations.length > 0) {
          const orgIds = authData.userOrganizations.map(org => org.organization);
          console.log('User organization IDs:', orgIds);
          setUserOrganizations(orgIds);
        } else {
          console.log('User has no organizations');
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        setErrorMessage('Failed to authenticate. Please try again.');
      }
    };
    
    fetchUserData();
  }, [navigate]);

  // Check if we should show submitted plans tab based on navigation state
  useEffect(() => {
    if (location.state?.activeTab === 'submitted') {
      setActiveTab('submitted');
    }
  }, [location.state]);
  // Then fetch organizations data
  const { data: orgData, isLoading, error, refetch } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      try {
        console.log('Fetching all organizations');
        const data = await organizations.getAll();
        console.log('Organizations fetched:', data);
        return data;
      } catch (err: any) {
        console.error('Error fetching organizations:', err);
        setErrorMessage(err.message || 'Failed to load organizations');
        throw err;
      }
    },
    enabled: authState?.isAuthenticated === true, // Only fetch when authenticated
    retry: 2,
    retryDelay: 1000,
  });

  // Retry loading if there was an error
  const handleRetry = () => {
    setErrorMessage(null);
    refetch();
  };

  // If user has no organizations, show a special message
  const hasNoOrganizations = authState?.isAuthenticated && userOrganizations.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader className="h-6 w-6 animate-spin mr-2" />
        <div className="text-lg">{t('common.loading')}</div>
      </div>
    );
  }

  if (error || errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="p-8 bg-red-50 border border-red-200 rounded-lg text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">{t('common.error')}</h3>
          <p className="text-red-600 mb-4">{errorMessage || (error instanceof Error ? error.message : 'Failed to load organizations')}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
          >
            {t('common.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  if (hasNoOrganizations) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="p-8 bg-yellow-50 rounded-lg border border-yellow-200 max-w-md w-full text-center">
          <Info className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-yellow-700 mb-2">{t('dashboard.noUserOrganizations')}</h2>
          <p className="text-yellow-600 mb-4">{t('dashboard.noUserOrganizationsDesc')}</p>
          <p className="text-sm text-yellow-500">{t('dashboard.contactAdmin')}</p>
        </div>
      </div>
    );
  }

  // Make sure we have organization data
  if (!orgData || !Array.isArray(orgData) || orgData.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-lg text-red-600">{t('dashboard.noOrgsCreated')}</div>
      </div>
    );
  }

  const handleSelectOrganization = (org: Organization) => {
    console.log('Organization selected:', org);
    setSelectedOrg(org);
  };

  return (
    <div className="px-4 py-6 sm:px-0">
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
              Organization Overview
            </button>
            <button
              onClick={() => setActiveTab('submitted')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'submitted'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Submitted Plans
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'overview' && (
      <div className="space-y-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{t('dashboard.orgStructure')}</h2>
              <div className="flex space-x-2">
                <button 
                  onClick={() => setViewMode('tree')}
                  className={`p-2 rounded-md ${viewMode === 'tree' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                  title="Tree View"
                >
                  <LayoutList size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('chart')}
                  className={`p-2 rounded-md ${viewMode === 'chart' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                  title="Organogram View"
                >
                  <Network size={18} />
                </button>
              </div>
            </div>
            
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {viewMode === 'tree' ? (
                <OrganizationTree 
                  data={orgData} 
                  onSelectOrganization={handleSelectOrganization}
                  selectedOrgId={selectedOrg?.id}
                />
              ) : (
                <div className="h-0 overflow-hidden">
                  <OrganizationTree 
                    data={orgData} 
                    onSelectOrganization={handleSelectOrganization}
                    selectedOrgId={selectedOrg?.id}
                  />
                </div>
              )}
            </div>
            
            {/* Organogram Chart - Always render, but control visibility */}
            {viewMode === 'chart' && (
              <OrganizationChart data={orgData} />
            )}
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">{t('dashboard.metadata')}</h2>
            
            {!selectedOrg ? (
              <div className="text-center p-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <Info className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-lg mb-2">{t('dashboard.selectOrgPrompt')}</p>
                <p className="text-sm">{t('dashboard.selectOrganization')}</p>
              </div>
            ) : (
              <MetadataForm organization={selectedOrg} />
            )}
          </div>
        </div>
      </div>
      )}

      {activeTab === 'submitted' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">My Submitted Plans</h2>
            <SubmittedPlansTable userOrgId={userOrganizations[0]} />
          </div>
        </div>
      )}
      
      <footer className="bg-white border-t border-gray-200 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-sm text-gray-500 mb-2 md:mb-0">
              &copy; {currentYear} Ministry of Health, Ethiopia. All rights reserved.
            </div>
            <div className="text-sm text-gray-500">
              Developed by Ministry of Health, Information Communication Technology EO
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;