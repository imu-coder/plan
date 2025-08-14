import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Calculator, DollarSign, Info, AlertCircle } from 'lucide-react';
import type { SupervisionCost, TrainingLocation } from '../types/costing';
import { locations, perDiems, accommodations, supervisorCosts, landTransports, airTransports } from '../lib/api';
import { Plus, Trash2 } from 'lucide-react';

// Fallback data if API fails
const FALLBACK_LOCATIONS = [
  { id: 'fallback-1', name: 'Addis Ababa', region: 'Addis Ababa', is_hardship_area: false },
  { id: 'fallback-2', name: 'Adama', region: 'Oromia', is_hardship_area: false }
];

interface TransportRoute {
  id: string;
  transportId?: string;
  origin: string;
  destination: string;
  price: number;
  participants: number;
  originName?: string;
  destinationName?: string;
}

interface SupervisionLocation {
  locationId: string;
  days: number;
  supervisors: number;
}

interface SupervisionCostingToolProps {
  onCalculate: (costs: SupervisionCost) => void;
  onCancel: () => void;
  initialData?: SupervisionCost;
}

const SUPERVISOR_COSTS = [
  { value: 'ALL', label: 'All Additional Costs' },
  { value: 'TRAINING_MATERIALS', label: 'Training Materials' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'COMMUNICATION', label: 'Communication' },
  { value: 'OTHER', label: 'Other' }
];

const SupervisionCostingTool: React.FC<SupervisionCostingToolProps> = ({ 
  onCalculate,
  onCancel, 
  initialData 
}) => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationsData, setLocationsData] = useState<any[]>([]);
  const [perDiemsData, setPerDiemsData] = useState<any[]>([]);
  const [accommodationsData, setAccommodationsData] = useState<any[]>([]);
  const [supervisorCostsData, setSupervisorCostsData] = useState<any[]>([]);
  const [landTransportsData, setLandTransportsData] = useState<any[]>([]);
  const [airTransportsData, setAirTransportsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [landTransportRoutes, setLandTransportRoutes] = useState<TransportRoute[]>([]);
  const [airTransportRoutes, setAirTransportRoutes] = useState<TransportRoute[]>([]);
  const [additionalLocations, setAdditionalLocations] = useState<SupervisionLocation[]>([]);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
  
  const { register, watch, control, setValue, handleSubmit, formState: { errors }, trigger, getValues } = useForm<SupervisionCost>({
    defaultValues: initialData || {
      description: '',
      numberOfDays: 1,
      numberOfSupervisors: 1,
      numberOfSessions: 1,
      numberOfSupervisorsWithAdditionalCost: 0,
      additionalSupervisorCosts: [],
      transportRequired: false,
      landTransportSupervisors: 0,
      airTransportSupervisors: 0,
      otherCosts: 0
    }
  });

  // Watch all form values at once
  const allFormValues = watch();

  // ... existing functions ...

  // Calculate average transport costs
  const calculateAvgLandTransportCost = () => {
    if (!landTransportsData || landTransportsData.length === 0) return 1000;
    return 1000;
  };

  const calculateAvgAirTransportCost = () => {
    if (!airTransportsData || airTransportsData.length === 0) return 5000;
    return 5000;
  };

  // Memoize these values to avoid recalculating on every render
  const avgLandTransportCost = calculateAvgLandTransportCost();
  const avgAirTransportCost = calculateAvgAirTransportCost();

  // Re-validate transport supervisors when total supervisors changes
  useEffect(() => {
    if (allFormValues.transportRequired) {
      trigger(['landTransportSupervisors', 'airTransportSupervisors']);
    }
  }, [allFormValues.numberOfSupervisors, trigger, allFormValues.transportRequired]);

  // Calculate total budget whenever relevant data changes
  useEffect(() => {
    const calculateTotalBudget = () => {
      const locationId = allFormValues.location;
      const days = allFormValues.numberOfDays || 0;
      const supervisors = allFormValues.numberOfSupervisors || 0;
      const numSessions = Number(allFormValues.numberOfSessions) || 1;
      
      let totalCost = 0;
      
      // Per diem costs
      const perDiemData = perDiemsData.find(pd => pd.location === locationId);
      if (perDiemData) {
        const perDiemCost = Number(perDiemData.amount) || 0;
        totalCost += perDiemCost * supervisors * days;
      }
      
      // Accommodation costs
      const accommodationData = accommodationsData.find(acc => 
        acc.location === locationId && acc.service_type === 'FULL_BOARD'
      );
      if (accommodationData) {
        const accommodationCost = Number(accommodationData.price) || 0;
        totalCost += accommodationCost * supervisors * days;
      }
      
      // Additional supervisor costs
      const additionalSupervisors = allFormValues.numberOfSupervisorsWithAdditionalCost || 0;
      const selectedAdditionalCosts = allFormValues.additionalSupervisorCosts || [];
      
      selectedAdditionalCosts.forEach((costType: string) => {
        const costData = supervisorCostsData.find(sc => sc.cost_type === costType);
        if (costData) {
          totalCost += Number(costData.amount) * additionalSupervisors;
        }
      });
      
      // Transport costs
      if (allFormValues.transportRequired) {
        const landSupervisors = Number(allFormValues.landTransportSupervisors) || 0;
        const airSupervisors = Number(allFormValues.airTransportSupervisors) || 0;
        
        totalCost += landSupervisors * avgLandTransportCost;
        totalCost += airSupervisors * avgAirTransportCost;
      }
      
      // Other costs
      totalCost += Number(allFormValues.otherCosts) || 0;
      
      setValue('totalBudget', totalCost);
      return totalCost;
    };

    calculateTotalBudget();
  }, [
    allFormValues,
    additionalLocations, 
    landTransportRoutes, 
    airTransportRoutes,
    perDiemsData,
    accommodationsData,
    supervisorCostsData,
    landTransportsData,
    airTransportsData,
    setValue
  ]);

  const handleFormSubmit = async (data: SupervisionCost) => {
    try {
      setIsCalculating(true);
      setError(null);
      
      const totalBudget = watch('totalBudget');
      
      if (!totalBudget || totalBudget <= 0) {
        setError('Total budget must be greater than 0');
        setIsCalculating(false);
        return;
      }
      
      const supervisionCosts: SupervisionCost = {
        ...data,
        totalBudget: totalBudget || 0,
        // Ensure numeric values
        numberOfDays: Number(data.numberOfDays),
        numberOfSupervisors: Number(data.numberOfSupervisors),
        numberOfSupervisorsWithAdditionalCost: Number(data.numberOfSupervisorsWithAdditionalCost || 0),
        landTransportSupervisors: Number(data.landTransportSupervisors || 0),
        airTransportSupervisors: Number(data.airTransportSupervisors || 0),
        otherCosts: Number(data.otherCosts || 0)
      };
      
      console.log("Submitting supervision costs:", supervisionCosts);
      
      try {
        // Call the onCalculate function from props
        await onCalculate(supervisionCosts);
        console.log("Supervision calculation successfully passed to parent");
      } catch (err) {
        console.error("Error in onCalculate callback:", err);
        setError(`Failed to process: ${err instanceof Error ? err.message : String(err)}`);
        setIsCalculating(false);
      }
    } catch (error: any) {
      console.error('Failed to process supervision costs:', error);
      setError(error.message || 'Failed to process supervision costs. Please try again.');
      setIsCalculating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6 max-h-[75vh] overflow-y-auto p-2 pb-20">
      <div className="flex items-center justify-between">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex-1">
          <h3 className="text-lg font-medium text-blue-800 mb-2 flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Supervision Cost Calculator
          </h3>
          <p className="text-sm text-blue-600">
            Fill in the supervision details below to calculate the total budget.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-4 p-2 text-gray-400 hover:text-gray-500"
        >
          <span className="sr-only">Cancel</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description of Supervision Activity
        </label>
        <textarea
          {...register('description', { required: 'Description is required' })}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Describe the supervision activity..."
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Number of Days
          </label>
          <input
            type="number"
            min="1"
            {...register('numberOfDays', {
              required: 'Number of days is required',
              min: { value: 1, message: 'Minimum 1 day required' },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {errors.numberOfDays && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfDays.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Number of Supervisors
          </label>
          <input
            type="number"
            min="1"
            {...register('numberOfSupervisors', {
              required: 'Number of supervisors is required',
              min: { value: 1, message: 'Minimum 1 supervisor required' },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {errors.numberOfSupervisors && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfSupervisors.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Supervisors with Additional Costs
          </label>
          <input
            type="number"
            min="0"
            {...register('numberOfSupervisorsWithAdditionalCost', {
              min: { value: 0, message: 'Cannot be negative' },
              max: { 
                value: allFormValues.numberOfSupervisors || 0, 
                message: 'Cannot exceed total supervisors' 
              },
              valueAsNumber: true
            })}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
          {errors.numberOfSupervisorsWithAdditionalCost && (
            <p className="mt-1 text-sm text-red-600">{errors.numberOfSupervisorsWithAdditionalCost.message}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Additional Supervisor Costs
        </label>
        <div className="grid grid-cols-2 gap-4">
          {SUPERVISOR_COSTS.map(cost => (
            <label key={cost.value} className="flex items-center">
              <Controller
                name="additionalSupervisorCosts"
                control={control}
                defaultValue={[]}
                render={({ field }) => (
                  <input
                    type="checkbox"
                    value={cost.value}
                    checked={field.value?.includes(cost.value)}
                    onChange={(e) => {
                      const currentValues = field.value || [];
                      field.onChange(
                        e.target.checked
                          ? [...currentValues, cost.value]
                          : currentValues.filter((v: string) => v !== cost.value)
                      );
                    }}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                )}
              />
              <span className="ml-2 text-sm text-gray-700">{cost.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center mb-4">
          <input
            type="checkbox"
            {...register('transportRequired')}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <label className="ml-2 text-sm font-medium text-gray-700">
            Transport Required
          </label>
        </div>
      </div>
      
      {allFormValues.transportRequired && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Land Transport Supervisors
              </label>
              <input
                type="number"
                min="0"
                {...register('landTransportSupervisors', {
                  min: { value: 0, message: 'Cannot be negative' },
                  max: { 
                    value: allFormValues.numberOfSupervisors || 0, 
                    message: 'Cannot exceed total supervisors' 
                  },
                  valueAsNumber: true
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              {errors.landTransportSupervisors && (
                <p className="mt-1 text-sm text-red-600">{errors.landTransportSupervisors.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Air Transport Supervisors
              </label>
              <input
                type="number"
                min="0"
                {...register('airTransportSupervisors', {
                  min: { value: 0, message: 'Cannot be negative' },
                  max: { 
                    value: allFormValues.numberOfSupervisors || 0, 
                    message: 'Cannot exceed total supervisors' 
                  },
                  valueAsNumber: true
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              {errors.airTransportSupervisors && (
                <p className="mt-1 text-sm text-red-600">{errors.airTransportSupervisors.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Other Costs (ETB)
        </label>
        <input
          type="number"
          min="0"
          {...register('otherCosts', {
            min: { value: 0, message: 'Cannot be negative' },
            valueAsNumber: true
          })}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="0"
        />
        {errors.otherCosts && (
          <p className="mt-1 text-sm text-red-600">{errors.otherCosts.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Justification for Additional Costs
        </label>
        <textarea
          {...register('justification')}
          rows={3}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Explain any additional costs..."
        />
      </div>

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DollarSign className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-lg font-medium text-gray-900">Total Supervision Budget</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-2xl font-bold text-green-600">
              ETB {watch('totalBudget')?.toLocaleString() || '0'}
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={isCalculating}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCalculating}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center"
              >
                {isCalculating ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Continue to Budget Form'
                )}
              </button>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-gray-500 flex items-center">
          <Info className="h-4 w-4 mr-1" />
          This total is calculated based on supervision days, supervisors, and standard rates
        </p>
      </div>
    </form>
  );
};

export default SupervisionCostingTool;